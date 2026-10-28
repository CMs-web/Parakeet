import { app, dialog, ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { promises as fs } from 'fs'
import { streamAnswer } from './llm'
import * as sessions from './sessions'
import { loadSettings, resetSettings, saveSettings } from './store'
import {
  broadcast,
  createMainWindow,
  createOverlayWindow,
  getOverlayWindow,
  hideOverlay,
  isOverlayVisible,
  positionOverlay,
  setOverlayClickThrough,
  setOverlayOpacity,
  showOverlay,
  sendToMain,
  sendToOverlay
} from './windows'
import type { OverlayCommand } from '../preload'
import type {
  AnswerRequest,
  AppStatus,
  OverlayState,
  SessionMeta,
  Settings,
  TranscriptSegment
} from '../shared/types'

const controllers = new Map<string, AbortController>()

async function runAnswer(
  requestId: string,
  request: AnswerRequest,
  controller: AbortController
): Promise<void> {
  const settings = await loadSettings()
  const startedAt = Date.now()
  let text = ''
  try {
    const result = await streamAnswer(
      settings,
      request,
      (delta) => {
        text += delta
        broadcast('answer:delta', { requestId, text: delta, done: false })
      },
      controller.signal
    )
    await sessions.addAnswer(request.sessionId, {
      id: requestId,
      question: request.question,
      text: result.text || text,
      model: result.model,
      createdAt: startedAt,
      latencyMs: Date.now() - startedAt
    })
    broadcast('answer:delta', {
      requestId,
      text: '',
      done: true,
      model: result.model
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('aborted')) {
      broadcast('answer:delta', { requestId, text: '', done: true })
      return
    }
    broadcast('answer:delta', { requestId, text: '', done: true, error: message })
  } finally {
    controllers.delete(requestId)
  }
}

export function registerIpc(): void {
  ipcMain.handle('settings:get', async (): Promise<Settings> => loadSettings())

  ipcMain.handle('settings:save', async (_event, patch: Partial<Settings>): Promise<Settings> => {
    const settings = await saveSettings(patch)
    setOverlayOpacity(settings.overlay.opacity)
    positionOverlay(settings.overlay.position, settings.overlay.width)
    return settings
  })

  ipcMain.handle('settings:reset', async (): Promise<Settings> => {
    const settings = await resetSettings()
    setOverlayOpacity(settings.overlay.opacity)
    return settings
  })

  ipcMain.handle('stt:config', async () => {
    const settings = await loadSettings()
    return {
      provider: settings.stt.provider,
      language: settings.stt.language,
      openaiKey: settings.stt.openaiKey,
      openaiModel: settings.stt.openaiModel,
      speechmaticsKey: settings.stt.speechmaticsKey,
      localUrl: settings.stt.localUrl
    }
  })

  ipcMain.handle('session:start', async (_event, meta: SessionMeta) => sessions.startSession(meta))
  ipcMain.handle('session:end', async (_event, id: string) => sessions.endSession(id))
  ipcMain.handle('session:list', async () => sessions.listSessions())
  ipcMain.handle('session:get', async (_event, id: string) => sessions.getSession(id))
  ipcMain.handle('session:delete', async (_event, id: string) => sessions.deleteSession(id))

  ipcMain.handle('session:export', async (_event, id: string) => sessions.exportSession(id))

  ipcMain.handle('session:save-file', async (_event, id: string): Promise<string | null> => {
    const { markdown, record } = await sessions.exportSession(id)
    if (!record) return null
    const safeTitle = (record.title || 'session').replace(/[^a-z0-9-_ ]/gi, '').trim() || 'session'
    const result = await dialog.showSaveDialog({
      defaultPath: `${safeTitle}.md`,
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    })
    if (result.canceled || !result.filePath) return null
    await fs.writeFile(result.filePath, markdown, 'utf8')
    return result.filePath
  })

  ipcMain.handle(
    'transcript:append',
    async (_event, sessionId: string, segment: TranscriptSegment) => {
      await sessions.appendSegment(sessionId, segment)
    }
  )

  ipcMain.handle(
    'answer:generate',
    async (_event, request: AnswerRequest): Promise<{ requestId: string }> => {
      const requestId = randomUUID()
      const controller = new AbortController()
      controllers.set(requestId, controller)
      void runAnswer(requestId, request, controller)
      return { requestId }
    }
  )

  ipcMain.handle('answer:cancel', async (_event, requestId: string) => {
    controllers.get(requestId)?.abort()
  })

  ipcMain.handle('overlay:toggle', async (): Promise<boolean> => {
    if (isOverlayVisible()) {
      hideOverlay()
      broadcast('overlay:visibility', false)
      return false
    }
    const settings = await loadSettings()
    if (!getOverlayWindow()) createOverlayWindow(settings.overlay.position, settings.overlay.width)
    setOverlayOpacity(settings.overlay.opacity)
    setOverlayClickThrough(settings.overlay.clickThrough)
    showOverlay()
    broadcast('overlay:visibility', true)
    return true
  })

  ipcMain.handle('overlay:show', async (): Promise<boolean> => {
    const settings = await loadSettings()
    if (!getOverlayWindow()) createOverlayWindow(settings.overlay.position, settings.overlay.width)
    setOverlayOpacity(settings.overlay.opacity)
    showOverlay()
    broadcast('overlay:visibility', true)
    return true
  })

  ipcMain.handle('overlay:hide', async (): Promise<boolean> => {
    hideOverlay()
    broadcast('overlay:visibility', false)
    return false
  })

  ipcMain.handle('overlay:visible', async (): Promise<boolean> => isOverlayVisible())

  ipcMain.handle('overlay:opacity', async (_event, opacity: number) => {
    setOverlayOpacity(opacity)
  })

  ipcMain.handle('overlay:click-through', async (_event, enabled: boolean) => {
    setOverlayClickThrough(enabled)
  })

  ipcMain.handle('overlay:position', async (_event, position: 'left' | 'right') => {
    const settings = await loadSettings()
    if (!getOverlayWindow()) createOverlayWindow(position, settings.overlay.width)
    positionOverlay(position, settings.overlay.width)
  })

  ipcMain.on('overlay:sync', (_event, state: OverlayState) => {
    sendToOverlay('overlay:state', state)
  })

  ipcMain.on('overlay:emit', (_event, command: OverlayCommand) => {
    sendToMain('overlay:command', command)
  })

  ipcMain.handle('app:status', async (): Promise<AppStatus> => ({
    version: app.getVersion(),
    platform: process.platform,
    overlayVisible: isOverlayVisible(),
    recording: [...controllers.keys()].length > 0
  }))

  ipcMain.handle('app:open-main', async () => {
    createMainWindow().show()
  })
}

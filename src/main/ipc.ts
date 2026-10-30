import 'dotenv/config'
import { app, dialog, ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { promises as fs, createReadStream } from 'fs'
import path from 'path'
import { streamAnswer } from './llm'
import * as sessions from './sessions'
import * as billing from './billing'
import * as documents from './documents'
import { getMeetingDetection } from './meetings'
import { loadAuth } from './deeplink'
import { loadSettings, resetSettings, saveSettings } from './store'
import {
  broadcast,
  createMainWindow,
  createOverlayWindow,
  getMainWindow,
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
  DocumentRecord,
  DocumentKind,
  OverlayState,
  SessionBrief,
  SessionRecord,
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
    const docs = request.documents ?? (await documents.resolveSessionDocuments(request.meta))
    const result = await streamAnswer(
      settings,
      { ...request, documents: docs },
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
      latencyMs: Date.now() - startedAt,
      auto: false
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

function normalizeSarvamLanguage(input?: string): string {
  if (!input) return 'en-IN'
  const trimmed = input.trim()
  const map: Record<string, string> = {
    en: 'en-IN',
    hi: 'hi-IN',
    bn: 'bn-IN',
    kn: 'kn-IN',
    ml: 'ml-IN',
    mr: 'mr-IN',
    od: 'od-IN',
    or: 'od-IN',
    pa: 'pa-IN',
    ta: 'ta-IN',
    te: 'te-IN',
    gu: 'gu-IN',
    as: 'as-IN',
    ur: 'ur-IN',
    ne: 'ne-IN',
    sa: 'sa-IN',
    auto: 'unknown',
    unknown: 'unknown'
  }
  const lower = trimmed.toLowerCase()
  if (map[lower]) return map[lower]
  const SUPPORTED = [
    'unknown', 'hi-IN', 'bn-IN', 'kn-IN', 'ml-IN', 'mr-IN', 'od-IN', 'pa-IN',
    'ta-IN', 'te-IN', 'en-IN', 'gu-IN', 'as-IN', 'ur-IN', 'ne-IN', 'kok-IN',
    'ks-IN', 'sd-IN', 'sa-IN', 'sat-IN', 'mni-IN', 'brx-IN', 'mai-IN', 'doi-IN'
  ]
  const match = SUPPORTED.find((s) => s.toLowerCase() === lower)
  return match || 'en-IN'
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
      speechmaticsUrl: settings.stt.speechmaticsUrl,
      localUrl: settings.stt.localUrl,
      speakerDiarization: settings.stt.speakerDiarization,
      sarvamKey: settings.stt.sarvamKey || process.env.SARVAM_API_KEY || '',
      sarvamModel: settings.stt.sarvamModel || 'saaras:v4'
    }
  })

  ipcMain.handle(
    'stt:transcribe-sarvam',
    async (
      _event,
      { audio, language }: { audio: Uint8Array; language?: string }
    ): Promise<string> => {
      const settings = await loadSettings()
      const apiKey = (settings.stt.sarvamKey || process.env.SARVAM_API_KEY || '').trim()
      if (!apiKey) throw new Error('No Sarvam API key found in settings or .env')

      const tempFile = path.join(app.getPath('temp'), `stt_${randomUUID()}.wav`)
      try {
        await fs.writeFile(tempFile, Buffer.from(audio))
        const { SarvamAIClient } = await import('sarvamai')
        const client = new SarvamAIClient({ apiSubscriptionKey: apiKey })
        const response = await client.speechToText.transcribe({
          file: createReadStream(tempFile),
          model: (settings.stt.sarvamModel || 'saaras:v4') as any,
          language_code: normalizeSarvamLanguage(language || settings.stt.language) as any,
          mode: 'transcribe'
        })
        return response.transcript || ''
      } finally {
        await fs.unlink(tempFile).catch(() => undefined)
      }
    }
  )

  ipcMain.handle('billing:get', async () => billing.getBillingState())
  ipcMain.handle('billing:quote', async () => billing.quoteStart())
  ipcMain.handle('billing:grant', async () => billing.grantCredits())
  ipcMain.handle('billing:reset', async () => billing.resetBilling())

  ipcMain.handle(
    'session:start',
    async (_event, brief: SessionBrief): Promise<SessionRecord> => {
      const requested = await billing.quoteStart()
      if (!requested.allowed) throw new Error(requested.reason ?? 'Session not allowed')
      const id = randomUUID()
      const charge = await billing.chargeSessionStart(id)
      return sessions.startSession(
        brief,
        {
          freeSession: charge.free,
          creditsCharged: charge.free ? 0 : charge.cost,
          extensions: 0,
          extendedMinutes: 0,
          refunded: false
        },
        id
      )
    }
  )

  ipcMain.handle('session:end', async (_event, id: string) => {
    const record = sessions.getActive(id) ?? (await sessions.getSession(id))
    const settlement = await billing.settleSession(id, {
      free: record?.billing.freeSession ?? false
    })
    return sessions.endSession(id, settlement.refunded)
  })

  ipcMain.handle('session:extend', async (_event, id: string) => {
    const settings = await loadSettings()
    const result = await billing.extendSession(id)
    if (!result.ok) return { ok: false, reason: result.reason, state: result.state, record: null }
    const record = await sessions.recordExtend(id, settings.limits.extensionMinutes)
    return { ok: true, reason: null, state: result.state, record }
  })

  ipcMain.handle('session:list', async () => sessions.listSessions())
  ipcMain.handle('session:get', async (_event, id: string) => sessions.getSession(id))
  ipcMain.handle('session:delete', async (_event, id: string) => sessions.deleteSession(id))
  ipcMain.handle('session:export', async (_event, id: string) => sessions.exportSession(id))

  ipcMain.handle(
    'session:rate',
    async (_event, sessionId: string, answerId: string, rating: 'up' | 'down' | null) => {
      await sessions.rateAnswer(sessionId, answerId, rating)
    }
  )

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

  ipcMain.handle('documents:list', async (): Promise<DocumentRecord[]> => documents.listDocuments())

  ipcMain.handle(
    'documents:add',
    async (_event, input: { kind: DocumentKind; name: string; text: string }) =>
      documents.addDocument(input)
  )

  ipcMain.handle('documents:add-file', async (_event, kind: DocumentKind) =>
    documents.addDocumentFromFile(getMainWindow(), kind)
  )

  ipcMain.handle('documents:remove', async (_event, id: string) => documents.removeDocument(id))

  ipcMain.handle('meeting:get', async () => getMeetingDetection())
  ipcMain.handle('auth:get', async () => loadAuth())

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

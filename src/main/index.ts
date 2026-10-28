import {
  app,
  BrowserWindow,
  desktopCapturer,
  globalShortcut,
  Menu,
  nativeImage,
  session,
  Tray
} from 'electron'
import { createMainWindow, createOverlayWindow, hideOverlay, isOverlayVisible, setOverlayClickThrough, setOverlayOpacity, showOverlay, sendToMain, sendToOverlay } from './windows'
import { registerIpc } from './ipc'
import { loadSettings } from './store'
import type { OverlayCommand } from '../preload'

const TRAY_ICON =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAANElEQVR42mNgGJRApCLvPzZMtEbdK/uxYoIG4dOMbAjZmvEaMmoAFQygOBqpkpAoTsoDAgCtDDi8Ho2kQgAAAABJRU5ErkJggg=='

let tray: Tray | null = null

function sendCommand(command: OverlayCommand): void {
  sendToMain('overlay:command', command)
  sendToOverlay('overlay:command', command)
}

async function toggleOverlay(): Promise<void> {
  if (isOverlayVisible()) {
    hideOverlay()
    return
  }
  const settings = await loadSettings()
  createOverlayWindow(settings.overlay.position, settings.overlay.width)
  setOverlayOpacity(settings.overlay.opacity)
  setOverlayClickThrough(settings.overlay.clickThrough)
  showOverlay()
}

async function registerShortcuts(): Promise<void> {
  const settings = await loadSettings()
  globalShortcut.unregisterAll()
  const handlers: Record<string, () => void> = {
    toggleOverlay: () => void toggleOverlay(),
    answerNow: () => sendCommand({ type: 'answer' }),
    clearAnswer: () => sendCommand({ type: 'clear' }),
    scrollUp: () => sendCommand({ type: 'scroll', direction: 'up' }),
    scrollDown: () => sendCommand({ type: 'scroll', direction: 'down' }),
    toggleMic: () => sendCommand({ type: 'toggle-mic' }),
    toggleSystem: () => sendCommand({ type: 'toggle-system' }),
    endSession: () => sendCommand({ type: 'end-session' })
  }
  for (const [name, accelerator] of Object.entries(settings.hotkeys)) {
    const handler = handlers[name]
    if (!handler || !accelerator) continue
    try {
      globalShortcut.register(accelerator, handler)
    } catch {
      continue
    }
  }
}

function createTray(): void {
  if (tray) return
  const image = nativeImage.createFromDataURL(`data:image/png;base64,${TRAY_ICON}`)
  tray = new Tray(image)
  tray.setToolTip('Parakeet Clone')
  const menu = Menu.buildFromTemplate([
    {
      label: 'Open dashboard',
      click: () => {
        const window = createMainWindow()
        window.show()
        window.focus()
      }
    },
    {
      label: 'Toggle overlay',
      click: () => void toggleOverlay()
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit()
    }
  ])
  tray.setContextMenu(menu)
  tray.on('click', () => {
    const window = createMainWindow()
    window.show()
    window.focus()
  })
}

function configureDisplayMedia(): void {
  session.defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      try {
        const sources = await desktopCapturer.getSources({ types: ['screen'] })
        const primary = sources[0]
        if (!primary) {
          callback({})
          return
        }
        callback({ video: primary, audio: 'loopback' as never })
      } catch {
        callback({})
      }
    },
    { useSystemPicker: false }
  )
}

function configurePermissions(): void {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media' || permission === 'display-capture')
  })
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const window = createMainWindow()
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  })

  app.whenReady().then(async () => {
    configureDisplayMedia()
    configurePermissions()
    registerIpc()
    createMainWindow()
    createTray()
    await registerShortcuts()
    const settings = await loadSettings()
    createOverlayWindow(settings.overlay.position, settings.overlay.width)
    setOverlayOpacity(settings.overlay.opacity)
    setOverlayClickThrough(settings.overlay.clickThrough)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
  })

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}

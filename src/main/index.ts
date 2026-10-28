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
import {
  createMainWindow,
  createOverlayWindow,
  hideOverlay,
  isOverlayVisible,
  setOverlayClickThrough,
  setOverlayOpacity,
  showOverlay,
  broadcast,
  sendToMain,
  sendToOverlay
} from './windows'
import { registerIpc } from './ipc'
import { loadSettings } from './store'
import {
  getMeetingDetection,
  onMeetingChange,
  startMeetingDetector,
  stopMeetingDetector
} from './meetings'
import { PROTOCOL, parseDeepLink, registerProtocol, saveAuth } from './deeplink'
import type { OverlayCommand } from '../preload'

const TRAY_ICON =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAANElEQVR42mNgGJRApCLvPzZMtEbdK/uxYoIG4dOMbAjZmvEaMmoAFQygOBqpkpAoTsoDAgCtDDi8Ho2kQgAAAABJRU5ErkJggg=='

let tray: Tray | null = null
let pendingDeepLink: string | null = null

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

/** Ctrl+Shift+Space: bring the panel forward, like the shipped app's chat shortcut. */
function togglePanel(): void {
  const window = createMainWindow()
  if (window.isVisible() && window.isFocused()) {
    window.hide()
    return
  }
  window.show()
  window.focus()
  sendCommand({ type: 'toggle-chat' })
}

async function registerShortcuts(): Promise<void> {
  const settings = await loadSettings()
  globalShortcut.unregisterAll()
  const handlers: Record<string, () => void> = {
    toggleChat: togglePanel,
    toggleOverlay: () => void toggleOverlay(),
    answerNow: () => sendCommand({ type: 'answer' }),
    prevAnswer: () => sendCommand({ type: 'prev-answer' }),
    nextAnswer: () => sendCommand({ type: 'next-answer' }),
    clearAnswer: () => sendCommand({ type: 'clear' }),
    clearTranscript: () => sendCommand({ type: 'clear-transcript' }),
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
      label: 'Open ParakeetAI',
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
    callback(permission === 'media' || permission === 'display-capture' || permission === 'clipboard-read')
  })
}

function focusPanel(): void {
  const window = createMainWindow()
  window.show()
  window.focus()
}

async function handleDeepLink(url: string): Promise<void> {
  const link = parseDeepLink(url)
  if (link.kind === 'auth') {
    await saveAuth(link.auth)
    broadcast('auth:received', link.auth)
    focusPanel()
    return
  }
  if (link.kind === 'callSession') {
    broadcast('deeplink:callSession', link.callSessionId)
    focusPanel()
  }
}

function drainDeepLink(): void {
  if (!pendingDeepLink) return
  const url = pendingDeepLink
  pendingDeepLink = null
  void handleDeepLink(url)
}

const protocolArg = process.argv.find((arg) => arg.startsWith(`${PROTOCOL}://`))
if (protocolArg) pendingDeepLink = protocolArg

registerProtocol()

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const link = argv.find((arg) => arg.startsWith(`${PROTOCOL}://`))
    if (link) void handleDeepLink(link)
    focusPanel()
  })

  app.on('open-url', (event, url) => {
    event.preventDefault()
    if (app.isReady()) void handleDeepLink(url)
    else pendingDeepLink = url
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
    if (settings.autoDetectMeetings) startMeetingDetector()

    onMeetingChange((detection, change) => {
      broadcast('meeting:changed', { detection, change })
      if (change === 'started' && detection.app) {
        tray?.displayBalloon({
          title: 'Meeting detected',
          content: `${detection.app.appName} is running. Open ParakeetAI to start a session.`
        })
      }
    })

    drainDeepLink()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
  })

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    stopMeetingDetector()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}

export { getMeetingDetection }

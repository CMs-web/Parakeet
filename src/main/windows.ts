import { BrowserWindow, screen, shell } from 'electron'
import { join } from 'path'

let mainWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null
let overlayClickThrough = false

function rendererUrl(page: string): string {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) return `${devUrl}/${page}`
  return join(__dirname, `../renderer/${page}`)
}

function loadPage(window: BrowserWindow, page: string): void {
  const target = rendererUrl(page)
  if (target.startsWith('http')) void window.loadURL(target)
  else void window.loadFile(target)
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function getOverlayWindow(): BrowserWindow | null {
  return overlayWindow
}

export function createMainWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow
  mainWindow = new BrowserWindow({
    title: 'Talkwise',
    width: 1200,
    height: 800,
    minWidth: 940,
    minHeight: 620,
    show: false,
    backgroundColor: '#0b0f14',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show()
    }
  }, 1200)
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  loadPage(mainWindow, 'index.html')
  return mainWindow
}

export function createOverlayWindow(position: 'left' | 'right', width: number): BrowserWindow {
  if (overlayWindow && !overlayWindow.isDestroyed()) return overlayWindow
  const area = screen.getPrimaryDisplay().workArea
  const overlayWidth = Math.max(360, Math.min(width, 720))
  const overlayHeight = Math.min(520, area.height - 80)
  const x = position === 'right' ? area.x + area.width - overlayWidth - 24 : area.x + 24
  const y = area.y + 48
  overlayWindow = new BrowserWindow({
    title: 'Talkwise Overlay',
    width: overlayWidth,
    height: overlayHeight,
    x,
    y,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: true,
    movable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  overlayWindow.setAlwaysOnTop(true, 'screen-saver')
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  overlayWindow.on('closed', () => {
    overlayWindow = null
  })
  loadPage(overlayWindow, 'overlay.html')
  return overlayWindow
}

export function showOverlay(): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  overlayWindow.showInactive()
}

export function hideOverlay(): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  overlayWindow.hide()
}

export function isOverlayVisible(): boolean {
  return Boolean(overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible())
}

export function setOverlayOpacity(opacity: number): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  overlayWindow.setOpacity(Math.max(0.2, Math.min(1, opacity)))
}

export function setOverlayClickThrough(enabled: boolean): void {
  overlayClickThrough = enabled
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  overlayWindow.setIgnoreMouseEvents(enabled, { forward: true })
}

export function overlayClickThroughEnabled(): boolean {
  return overlayClickThrough
}

export function positionOverlay(position: 'left' | 'right', width: number): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  const area = screen.getPrimaryDisplay().workArea
  const bounds = overlayWindow.getBounds()
  const overlayWidth = Math.max(360, Math.min(width, area.width - 48))
  const x = position === 'right' ? area.x + area.width - overlayWidth - 24 : area.x + 24
  overlayWindow.setBounds({ x, y: bounds.y, width: overlayWidth, height: bounds.height })
}

export function broadcast(channel: string, payload: unknown): void {
  for (const target of [mainWindow, overlayWindow]) {
    if (target && !target.isDestroyed()) target.webContents.send(channel, payload)
  }
}

export function sendToOverlay(channel: string, payload: unknown): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.webContents.send(channel, payload)
}

export function sendToMain(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
}

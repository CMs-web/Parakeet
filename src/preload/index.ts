import { contextBridge, ipcRenderer } from 'electron'
import type {
  AnswerDelta,
  AnswerRequest,
  AppStatus,
  OverlayState,
  SessionMeta,
  SessionRecord,
  SessionSummary,
  Settings,
  SttRuntimeConfig,
  TranscriptSegment
} from '../shared/types'

export type OverlayCommand =
  | { type: 'scroll'; direction: 'up' | 'down' }
  | { type: 'clear' }
  | { type: 'answer' }
  | { type: 'toggle-mic' }
  | { type: 'toggle-system' }
  | { type: 'end-session' }

const api = {
  settings: {
    get: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
    save: (patch: Partial<Settings>): Promise<Settings> => ipcRenderer.invoke('settings:save', patch),
    reset: (): Promise<Settings> => ipcRenderer.invoke('settings:reset')
  },
  stt: {
    config: (): Promise<SttRuntimeConfig> => ipcRenderer.invoke('stt:config')
  },
  session: {
    start: (meta: SessionMeta): Promise<SessionRecord> => ipcRenderer.invoke('session:start', meta),
    end: (id: string): Promise<SessionRecord | null> => ipcRenderer.invoke('session:end', id),
    list: (): Promise<SessionSummary[]> => ipcRenderer.invoke('session:list'),
    get: (id: string): Promise<SessionRecord | null> => ipcRenderer.invoke('session:get', id),
    remove: (id: string): Promise<void> => ipcRenderer.invoke('session:delete', id),
    export: (id: string): Promise<{ markdown: string; record: SessionRecord | null }> =>
      ipcRenderer.invoke('session:export', id),
    saveFile: (id: string): Promise<string | null> => ipcRenderer.invoke('session:save-file', id)
  },
  transcript: {
    append: (sessionId: string, segment: TranscriptSegment): Promise<void> =>
      ipcRenderer.invoke('transcript:append', sessionId, segment)
  },
  answer: {
    generate: (request: AnswerRequest): Promise<{ requestId: string }> =>
      ipcRenderer.invoke('answer:generate', request),
    cancel: (requestId: string): Promise<void> => ipcRenderer.invoke('answer:cancel', requestId)
  },
  overlay: {
    toggle: (): Promise<boolean> => ipcRenderer.invoke('overlay:toggle'),
    show: (): Promise<boolean> => ipcRenderer.invoke('overlay:show'),
    hide: (): Promise<boolean> => ipcRenderer.invoke('overlay:hide'),
    isVisible: (): Promise<boolean> => ipcRenderer.invoke('overlay:visible'),
    setOpacity: (opacity: number): Promise<void> => ipcRenderer.invoke('overlay:opacity', opacity),
    setClickThrough: (enabled: boolean): Promise<void> =>
      ipcRenderer.invoke('overlay:click-through', enabled),
    setPosition: (position: 'left' | 'right'): Promise<void> =>
      ipcRenderer.invoke('overlay:position', position),
    sync: (state: OverlayState): void => ipcRenderer.send('overlay:sync', state),
    emit: (command: OverlayCommand): void => ipcRenderer.send('overlay:emit', command)
  },
  app: {
    status: (): Promise<AppStatus> => ipcRenderer.invoke('app:status'),
    openMain: (): Promise<void> => ipcRenderer.invoke('app:open-main')
  },
  onAnswerDelta: (callback: (delta: AnswerDelta) => void): (() => void) => {
    const listener = (_event: unknown, payload: AnswerDelta): void => callback(payload)
    ipcRenderer.on('answer:delta', listener)
    return () => ipcRenderer.removeListener('answer:delta', listener)
  },
  onOverlayCommand: (callback: (command: OverlayCommand) => void): (() => void) => {
    const listener = (_event: unknown, payload: OverlayCommand): void => callback(payload)
    ipcRenderer.on('overlay:command', listener)
    return () => ipcRenderer.removeListener('overlay:command', listener)
  },
  onOverlayState: (callback: (state: OverlayState) => void): (() => void) => {
    const listener = (_event: unknown, payload: OverlayState): void => callback(payload)
    ipcRenderer.on('overlay:state', listener)
    return () => ipcRenderer.removeListener('overlay:state', listener)
  },
  onOverlayVisibility: (callback: (visible: boolean) => void): (() => void) => {
    const listener = (_event: unknown, visible: boolean): void => callback(visible)
    ipcRenderer.on('overlay:visibility', listener)
    return () => ipcRenderer.removeListener('overlay:visibility', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api

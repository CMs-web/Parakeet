import { contextBridge, ipcRenderer } from 'electron'
import type {
  AnswerDelta,
  AnswerRequest,
  AppStatus,
  BillingState,
  DeepLinkAuth,
  DocumentKind,
  DocumentRecord,
  MeetingDetection,
  OverlayState,
  SessionBrief,
  SessionRecord,
  SessionSummary,
  Settings,
  StartQuote,
  SttRuntimeConfig,
  TranscriptSegment
} from '../shared/types'

export type OverlayCommand =
  | { type: 'scroll'; direction: 'up' | 'down' }
  | { type: 'clear' }
  | { type: 'clear-transcript' }
  | { type: 'answer' }
  | { type: 'prev-answer' }
  | { type: 'next-answer' }
  | { type: 'toggle-chat' }
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
    config: (): Promise<SttRuntimeConfig> => ipcRenderer.invoke('stt:config'),
    transcribeSarvam: (audio: Uint8Array, language?: string): Promise<string> =>
      ipcRenderer.invoke('stt:transcribe-sarvam', { audio, language })
  },
  billing: {
    get: (): Promise<BillingState> => ipcRenderer.invoke('billing:get'),
    quote: (): Promise<StartQuote> => ipcRenderer.invoke('billing:quote'),
    grant: (): Promise<BillingState> => ipcRenderer.invoke('billing:grant'),
    reset: (): Promise<BillingState> => ipcRenderer.invoke('billing:reset')
  },
  documents: {
    list: (): Promise<DocumentRecord[]> => ipcRenderer.invoke('documents:list'),
    add: (input: { kind: DocumentKind; name: string; text: string }): Promise<DocumentRecord> =>
      ipcRenderer.invoke('documents:add', input),
    addFile: (kind: DocumentKind): Promise<DocumentRecord | null> =>
      ipcRenderer.invoke('documents:add-file', kind),
    remove: (id: string): Promise<void> => ipcRenderer.invoke('documents:remove', id)
  },
  session: {
    start: (brief: SessionBrief): Promise<SessionRecord> => ipcRenderer.invoke('session:start', brief),
    end: (id: string): Promise<SessionRecord | null> => ipcRenderer.invoke('session:end', id),
    extend: (
      id: string
    ): Promise<{
      ok: boolean
      reason: string | null
      state: BillingState
      record: SessionRecord | null
    }> => ipcRenderer.invoke('session:extend', id),
    list: (): Promise<SessionSummary[]> => ipcRenderer.invoke('session:list'),
    get: (id: string): Promise<SessionRecord | null> => ipcRenderer.invoke('session:get', id),
    remove: (id: string): Promise<void> => ipcRenderer.invoke('session:delete', id),
    rate: (sessionId: string, answerId: string, rating: 'up' | 'down' | null): Promise<void> =>
      ipcRenderer.invoke('session:rate', sessionId, answerId, rating),
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
  meeting: {
    get: (): Promise<MeetingDetection> => ipcRenderer.invoke('meeting:get')
  },
  auth: {
    get: (): Promise<DeepLinkAuth | null> => ipcRenderer.invoke('auth:get')
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
  },
  onMeetingChange: (
    callback: (payload: { detection: MeetingDetection; change: 'started' | 'ended' | null }) => void
  ): (() => void) => {
    const listener = (
      _event: unknown,
      payload: { detection: MeetingDetection; change: 'started' | 'ended' | null }
    ): void => callback(payload)
    ipcRenderer.on('meeting:changed', listener)
    return () => ipcRenderer.removeListener('meeting:changed', listener)
  },
  onAuth: (callback: (auth: DeepLinkAuth) => void): (() => void) => {
    const listener = (_event: unknown, payload: DeepLinkAuth): void => callback(payload)
    ipcRenderer.on('auth:received', listener)
    return () => ipcRenderer.removeListener('auth:received', listener)
  },
  onCallSessionLink: (callback: (callSessionId: string) => void): (() => void) => {
    const listener = (_event: unknown, id: string): void => callback(id)
    ipcRenderer.on('deeplink:callSession', listener)
    return () => ipcRenderer.removeListener('deeplink:callSession', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api

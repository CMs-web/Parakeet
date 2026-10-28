export type Speaker = 'you' | 'them'
export type SessionMode = 'general' | 'interview' | 'sales' | 'support'
export type SttProvider = 'openai' | 'speechmatics' | 'local'
export type LlmProvider = 'openai' | 'anthropic'

export type ResponseFormat = 'bullets' | 'short-paragraph' | 'structured'
export type ResponseLength = 'brief' | 'balanced' | 'detailed'
export type ResponseTone = 'professional' | 'friendly' | 'confident' | 'concise'

export interface AnswerPrefs {
  responseFormat: ResponseFormat
  responseLength: ResponseLength
  responseTone: ResponseTone
}

export interface SttSettings {
  provider: SttProvider
  openaiKey: string
  openaiModel: string
  speechmaticsKey: string
  localUrl: string
  language: string
}

export interface LlmSettings {
  provider: LlmProvider
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
  maxTokens: number
}

export interface OverlaySettings {
  opacity: number
  clickThrough: boolean
  position: 'left' | 'right'
  width: number
}

export interface LimitSettings {
  trialMinutes: number
  callMinutes: number
  extensionMinutes: number
  cooldownMinutes: number
}

export interface Settings {
  stt: SttSettings
  llm: LlmSettings
  overlay: OverlaySettings
  limits: LimitSettings
  defaults: AnswerPrefs & { sessionMode: SessionMode }
  autoAnswer: boolean
  captureSystemAudio: boolean
  captureMic: boolean
  hotkeys: Record<string, string>
  onboarded: boolean
}

export interface TranscriptSegment {
  id: string
  speaker: Speaker
  text: string
  startedAt: number
  endedAt: number
  final: boolean
}

export interface AnswerRecord {
  id: string
  question: string
  text: string
  model: string
  createdAt: number
  latencyMs: number | null
}

export interface SessionMeta {
  mode: SessionMode
  title: string
  company: string
  description: string
  extraContext: string
  answerPrefs: AnswerPrefs
}

export interface SessionRecord extends SessionMeta {
  id: string
  createdAt: number
  endedAt: number | null
  durationMs: number
  segments: TranscriptSegment[]
  answers: AnswerRecord[]
}

export interface SessionSummary {
  id: string
  createdAt: number
  endedAt: number | null
  durationMs: number
  mode: SessionMode
  title: string
  company: string
  segmentCount: number
  answerCount: number
}

export interface AnswerRequest {
  sessionId: string
  question: string
  instruction: string
  segments: TranscriptSegment[]
  meta: SessionMeta
}

export interface AnswerDelta {
  requestId: string
  text: string
  done: boolean
  error?: string
  model?: string
}

export interface AudioDeviceInfo {
  deviceId: string
  label: string
  kind: 'audioinput' | 'audiooutput'
}

export interface OverlayState {
  status: 'idle' | 'listening' | 'answering' | 'error'
  timer: string
  question: string
  answer: string
  micActive: boolean
  systemActive: boolean
  model: string
  error: string | null
}

export interface SttRuntimeConfig {
  provider: SttProvider
  language: string
  openaiKey: string
  openaiModel: string
  speechmaticsKey: string
  localUrl: string
}

export interface AppStatus {
  version: string
  platform: string
  overlayVisible: boolean
  recording: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  stt: {
    provider: 'openai',
    openaiKey: '',
    openaiModel: 'gpt-4o-transcribe',
    speechmaticsKey: '',
    localUrl: 'http://127.0.0.1:8080/inference',
    language: 'en'
  },
  llm: {
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4.1',
    temperature: 0.6,
    maxTokens: 700
  },
  overlay: {
    opacity: 0.94,
    clickThrough: false,
    position: 'right',
    width: 460
  },
  limits: {
    trialMinutes: 10,
    callMinutes: 30,
    extensionMinutes: 20,
    cooldownMinutes: 12
  },
  defaults: {
    sessionMode: 'general',
    responseFormat: 'bullets',
    responseLength: 'balanced',
    responseTone: 'professional'
  },
  autoAnswer: false,
  captureSystemAudio: true,
  captureMic: true,
  hotkeys: {
    toggleOverlay: 'CommandOrControl+Shift+Space',
    answerNow: 'CommandOrControl+Alt+Enter',
    clearAnswer: 'CommandOrControl+Shift+Backspace',
    scrollUp: 'CommandOrControl+Up',
    scrollDown: 'CommandOrControl+Down',
    toggleMic: 'CommandOrControl+Shift+Up',
    toggleSystem: 'CommandOrControl+Shift+Down',
    endSession: 'CommandOrControl+Shift+Enter'
  },
  onboarded: false
}

export const MODELS: Array<{ id: string; label: string; ttftMs: number | null }> = [
  { id: 'gpt-4.1', label: 'GPT-4.1', ttftMs: 520 },
  { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini', ttftMs: 448 },
  { id: 'gpt-5', label: 'GPT-5', ttftMs: 506 },
  { id: 'gpt-5-mini', label: 'GPT-5 Mini', ttftMs: 550 },
  { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', ttftMs: 1774 },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', ttftMs: 700 },
  { id: 'cerebras-gpt-oss-120b', label: 'GPT OSS 120B (Cerebras)', ttftMs: 300 },
  { id: 'gemini-3-1-flash-lite', label: 'Gemini 3.1 Flash Lite', ttftMs: 400 },
  { id: 'gemini-3-5-flash', label: 'Gemini 3.5 Flash', ttftMs: 450 },
  { id: 'gemini-3-5-flash-lite', label: 'Gemini 3.5 Flash Lite', ttftMs: 380 },
  { id: 'gemini-3-6-flash', label: 'Gemini 3.6 Flash', ttftMs: 420 },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', ttftMs: 1200 },
  { id: 'claude-opus-5', label: 'Claude Opus 5', ttftMs: 1900 }
]

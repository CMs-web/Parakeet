import { DEFAULT_AI_MODEL, PRODUCT_LIMITS, type MeetingApp } from './limits'

export type SessionMode = 'interview' | 'regular_call'
export type Speaker = 'you' | 'them'
export type SttProvider = 'speechmatics' | 'openai' | 'local'
export type LlmProvider = 'openai' | 'anthropic' | 'ollama'

/** Enumerations recovered from the 3.9.135 renderer; see shared/limits.ts. */
export type ResponseFormat = 'paragraph' | 'balanced' | 'bullets'
export type ResponseLength = 'concise' | 'balanced' | 'detailed'
export type ResponseTone = 'simple' | 'formal' | 'casual'
export type DocumentSelectionMode = 'all' | 'none' | 'custom'
export type DocumentKind = 'resume' | 'document'

export interface AnswerPrefs {
  responseLength: ResponseLength
  responseFormat: ResponseFormat
  responseTone: ResponseTone
  useStarMethod: boolean
  useFillerWords: boolean
}

export interface SttSettings {
  provider: SttProvider
  openaiKey: string
  openaiModel: string
  speechmaticsKey: string
  /** Per-call keys are minted server-side in the real app; this is the local fallback. */
  speechmaticsUrl: string
  localUrl: string
  language: string
  speakerDiarization: boolean
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

export interface SessionDefaults extends AnswerPrefs {
  sessionMode: SessionMode
  language: string
  aiModel: string
  autoAnswer: boolean
  saveTranscription: boolean
  documentSelectionMode: DocumentSelectionMode
}

export interface Settings {
  stt: SttSettings
  llm: LlmSettings
  overlay: OverlaySettings
  limits: LimitSettings
  defaults: SessionDefaults
  autoAnswer: boolean
  captureSystemAudio: boolean
  captureMic: boolean
  autoDetectMeetings: boolean
  autoExtend: boolean
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
  /** Speechmatics speaker label (S1, S2…) when diarization attributed a voice. */
  speakerLabel?: string
}

export interface AnswerRecord {
  id: string
  question: string
  text: string
  model: string
  createdAt: number
  latencyMs: number | null
  auto: boolean
  /** Renderer feedback channel equivalent: feedback.rateResponse. */
  rating?: 'up' | 'down' | null
}

export interface SessionBrief {
  mode: SessionMode
  title: string
  companyDomain: string
  description: string
  jobPostUrl: string | null
  language: string
  extraContext: string
  resumeId: string | null
  saveTranscription: boolean
  aiModel: string
  autoAnswer: boolean
  answerPrefs: AnswerPrefs
  documentSelectionMode: DocumentSelectionMode
  selectedDocumentIds: string[]
  isMock: boolean
}

export interface SessionBilling {
  freeSession: boolean
  creditsCharged: number
  extensions: number
  extendedMinutes: number
  refunded: boolean
}

export interface SessionRecord extends SessionBrief {
  id: string
  createdAt: number
  endedAt: number | null
  durationMs: number
  segments: TranscriptSegment[]
  answers: AnswerRecord[]
  billing: SessionBilling
}

export interface SessionSummary {
  id: string
  createdAt: number
  endedAt: number | null
  durationMs: number
  mode: SessionMode
  title: string
  companyDomain: string
  segmentCount: number
  answerCount: number
  freeSession: boolean
  isMock: boolean
}

export interface AnswerRequest {
  sessionId: string
  question: string
  instruction: string
  segments: TranscriptSegment[]
  meta: SessionBrief
  /** Resolved in the main process from the document store. */
  documents?: Array<{ name: string; text: string }>
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
  speechmaticsUrl: string
  localUrl: string
  speakerDiarization: boolean
}

export interface AppStatus {
  version: string
  platform: string
  overlayVisible: boolean
  recording: boolean
}

export interface DocumentRecord {
  id: string
  kind: DocumentKind
  name: string
  text: string
  createdAt: number
}

export interface BillingState {
  credits: number
  freeSessionsUsed: number
  /** Epoch ms when the free-session cooldown ends, or null when a free run is available. */
  freeSessionAvailableAt: number | null
  lastEndedSessionId: string | null
  lastEndedAt: number | null
  /** Epoch ms until which the last session can be rejoined for free. */
  resumeAvailableUntil: number | null
  purchaseCount: number
}

export interface StartQuote {
  allowed: boolean
  reason: string | null
  free: boolean
  cost: number
  durationMinutes: number
  cooldownEndsAt: number | null
  credits: number
}

export interface MeetingDetection {
  app: MeetingApp | null
  since: number | null
  title: string | null
}

export interface DeepLinkAuth {
  callSessionId: string | null
  authToken: string
  receivedAt: number
}

export const DEFAULT_SETTINGS: Settings = {
  stt: {
    provider: 'speechmatics',
    openaiKey: '',
    openaiModel: 'gpt-4o-transcribe',
    speechmaticsKey: '',
    speechmaticsUrl: 'wss://eu2.rt.speechmatics.com/v2',
    localUrl: 'http://127.0.0.1:8080/inference',
    language: 'en',
    speakerDiarization: true
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
    trialMinutes: PRODUCT_LIMITS.maxTrialDurationMinutes,
    callMinutes: PRODUCT_LIMITS.maxCallDurationMinutes,
    extensionMinutes: PRODUCT_LIMITS.freeSessionExtensionMinutes,
    cooldownMinutes: PRODUCT_LIMITS.freeSessionCooldownMinutes
  },
  defaults: {
    sessionMode: 'regular_call',
    language: 'en',
    aiModel: DEFAULT_AI_MODEL,
    autoAnswer: false,
    saveTranscription: true,
    documentSelectionMode: 'all',
    responseLength: 'balanced',
    responseFormat: 'balanced',
    responseTone: 'simple',
    useStarMethod: false,
    useFillerWords: false
  },
  autoAnswer: false,
  autoExtend: true,
  autoDetectMeetings: true,
  captureSystemAudio: true,
  captureMic: true,
  hotkeys: {
    answerNow: 'CommandOrControl+Enter',
    toggleChat: 'CommandOrControl+Shift+Space',
    prevAnswer: 'CommandOrControl+Left',
    nextAnswer: 'CommandOrControl+Right',
    clearAnswer: 'CommandOrControl+Backspace',
    clearTranscript: 'CommandOrControl+Shift+Backspace',
    scrollUp: 'CommandOrControl+Shift+Up',
    scrollDown: 'CommandOrControl+Shift+Down',
    endSession: 'CommandOrControl+Shift+Enter'
  },
  onboarded: false
}

/** Catalogue recovered from AI_MODEL_VALUES with display labels. */
export const MODELS: Array<{ id: string; label: string; group: 'recommended' | 'advanced' | 'legacy' }> = [
  { id: 'gemini-3-5-flash-lite', label: 'Gemini 3.5 Flash Lite', group: 'recommended' },
  { id: 'gpt-5-6-luna', label: 'GPT-5.6 Luna', group: 'recommended' },
  { id: 'gemini-3-6-flash', label: 'Gemini 3.6 Flash', group: 'advanced' },
  { id: 'gpt-5-6-terra', label: 'GPT-5.6 Terra', group: 'advanced' },
  { id: 'claude-haiku-4-5', label: 'Claude 4.5 Haiku', group: 'advanced' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', group: 'advanced' },
  { id: 'gpt-4.1', label: 'GPT-4.1', group: 'legacy' },
  { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini', group: 'legacy' },
  { id: 'gpt-5', label: 'GPT-5', group: 'legacy' },
  { id: 'gpt-5-mini', label: 'GPT-5 Mini', group: 'legacy' },
  { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', group: 'legacy' },
  { id: 'cerebras-gpt-oss-120b', label: 'GPT OSS 120B (Cerebras)', group: 'legacy' },
  { id: 'gemini-3-1-flash-lite', label: 'Gemini 3.1 Flash Lite', group: 'legacy' },
  { id: 'gemini-3-5-flash', label: 'Gemini 3.5 Flash', group: 'legacy' },
  { id: 'claude-opus-5', label: 'Claude Opus 5', group: 'legacy' },
  { id: 'gpt-5-6-sol', label: 'GPT-5.6 Sol', group: 'legacy' }
]

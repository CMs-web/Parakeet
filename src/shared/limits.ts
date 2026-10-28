// Server-side constants recovered from ParakeetAI desktop 3.9.135 (renderer bundle 46852).
// See docs/reverse-engineering.md §4. They are kept here so the clone behaves like the
// shipped product instead of exposing them as user-tunable settings.

export const PRODUCT_LIMITS = {
  freeSessionCooldownMinutes: 12,
  maxTrialDurationMinutes: 10,
  maxCallDurationMinutes: 30,
  freeSessionExtensionMinutes: 20,
  sessionCreditCost: 0.5,
  shortEndReturnMinutes: 5,
  sessionRecentlyEndedWindowMinutes: 5,
  autoExtendHeadroomSeconds: 15,
  autoExtendPromptThresholdMs: 60_000,
  autoExtendPromptDismissMs: 15_000,
  callSessionListPollMs: 5_000,
  freeSessionsPerCreditPurchase: 10
} as const

export const SESSION_MODE_VALUES = ['interview', 'regular_call'] as const
export const RESPONSE_LENGTH_VALUES = ['concise', 'balanced', 'detailed'] as const
export const RESPONSE_FORMAT_VALUES = ['bullets', 'balanced', 'paragraph'] as const
export const RESPONSE_TONE_VALUES = ['formal', 'casual', 'simple'] as const
export const DOCUMENT_SELECTION_MODE_VALUES = ['all', 'none', 'custom'] as const

export const RESPONSE_FORMAT_PRESENTATION_ORDER = ['paragraph', 'balanced', 'bullets'] as const
export const RESPONSE_TONE_SELECTABLE_VALUES = ['simple', 'formal'] as const

export const DEFAULT_AI_MODEL = 'gemini-3-5-flash-lite'
export const ADVANCED_MODELS_PICKER_OPTION = 'advanced-models'

export const AI_MODEL_VALUES = [
  'gpt-4.1',
  'gpt-4.1-mini',
  'gpt-5',
  'gpt-5-mini',
  'claude-sonnet-4-5',
  'claude-haiku-4-5',
  'cerebras-gpt-oss-120b',
  'gemini-3-1-flash-lite',
  'gemini-3-5-flash',
  'gemini-3-5-flash-lite',
  'gemini-3-6-flash',
  'gpt-5-6-luna',
  'gpt-5-6-terra',
  'claude-sonnet-5',
  'claude-opus-5',
  'gpt-5-6-sol'
] as const

export const AI_MODEL_RECOMMENDED_VALUES = ['gemini-3-5-flash-lite', 'gpt-5-6-luna'] as const
export const AI_MODEL_ADVANCED_VALUES = [
  'gemini-3-6-flash',
  'gpt-5-6-terra',
  'claude-haiku-4-5',
  'claude-sonnet-5'
] as const

/** Sessions created on older API versions are migrated forward. */
export const AI_MODEL_MIGRATIONS: Record<string, string> = {
  'claude-sonnet-4-5': 'claude-sonnet-5',
  'gpt-5-6-sol': 'gpt-5-6-terra'
}

export function migrateAiModel(model: string | null | undefined): string {
  if (!model) return DEFAULT_AI_MODEL
  const next = AI_MODEL_MIGRATIONS[model] ?? model
  return (AI_MODEL_VALUES as readonly string[]).includes(next) ? next : DEFAULT_AI_MODEL
}

/** Meeting apps and browsers the shipped app watches for (renderer bundle 92004). */
export interface MeetingApp {
  slug: string
  appName: string
  processNames: string[]
  titlePatterns?: RegExp[]
  isBrowser?: boolean
  /** Web-only entries only match by window title, not by process. */
  webOnly?: boolean
}

export const MEETING_APPS: MeetingApp[] = [
  { slug: 'chrome', appName: 'Chrome', processNames: ['chrome.exe'], isBrowser: true },
  { slug: 'firefox', appName: 'Firefox', processNames: ['firefox.exe'], isBrowser: true },
  { slug: 'arc', appName: 'Arc', processNames: ['arc.exe'], isBrowser: true },
  { slug: 'safari', appName: 'Safari', processNames: ['safari.exe'], isBrowser: true },
  { slug: 'microsoft_edge', appName: 'Microsoft Edge', processNames: ['msedge.exe'], isBrowser: true },
  { slug: 'zoom', appName: 'Zoom', processNames: ['zoom.exe'], titlePatterns: [/\bzoom meeting\b/i, /\bzoom workplace\b/i] },
  { slug: 'slack', appName: 'Slack', processNames: ['slack.exe'], titlePatterns: [/\bslack\b/i] },
  { slug: 'webex', appName: 'Webex', processNames: ['webex.exe'], titlePatterns: [/\bwebex\b/i] },
  {
    slug: 'microsoft_teams',
    appName: 'Microsoft Teams',
    processNames: ['ms-teams.exe', 'teams.exe'],
    titlePatterns: [/\bmicrosoft teams\b/i]
  },
  { slug: 'whatsapp', appName: 'WhatsApp', processNames: ['whatsapp.exe'], titlePatterns: [/\bwhatsapp\b/i] },
  {
    slug: 'google_meet_web',
    appName: 'Google Meet (web)',
    processNames: [],
    titlePatterns: [/\bgoogle meet\b/i, /\bmeet\.google\.com\b/i],
    webOnly: true
  },
  {
    slug: 'zoom_web',
    appName: 'Zoom (web)',
    processNames: [],
    titlePatterns: [/^zoom meeting\b/i, /\bzoom workplace\b/i],
    webOnly: true
  },
  {
    slug: 'microsoft_teams_web',
    appName: 'Microsoft Teams (web)',
    processNames: [],
    titlePatterns: [/\bmicrosoft teams\b/i],
    webOnly: true
  }
]

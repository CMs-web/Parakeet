import type { AnswerRequest, Settings } from '../shared/types'

const FORMAT_RULES: Record<string, string> = {
  bullets: 'Answer with 2-5 short bullet points. No preamble.',
  balanced: 'Answer in a short paragraph, using bullets only where a list is genuinely clearer.',
  paragraph: 'Answer in one tight paragraph of at most 60 words.'
}

const LENGTH_RULES: Record<string, string> = {
  concise: 'Keep the whole answer under 40 words.',
  balanced: 'Aim for 60 to 90 words.',
  detailed: 'Aim for 120 to 180 words.'
}

const TONE_RULES: Record<string, string> = {
  simple: 'Use plain, everyday wording that is easy to say out loud.',
  formal: 'Use a polished, professional tone.',
  casual: 'Use a relaxed, conversational tone.'
}

const MODE_RULES: Record<string, string> = {
  interview: 'This is a job interview. The user is the candidate answering the interviewer.',
  regular_call: 'This is a general call or meeting. The user is the person who needs to reply.'
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
  it: 'Italian',
  nl: 'Dutch',
  pl: 'Polish',
  ru: 'Russian',
  tr: 'Turkish',
  hi: 'Hindi',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  ar: 'Arabic',
  vi: 'Vietnamese',
  id: 'Indonesian',
  th: 'Thai',
  sv: 'Swedish',
  da: 'Danish',
  no: 'Norwegian',
  fi: 'Finnish',
  cs: 'Czech',
  el: 'Greek',
  he: 'Hebrew',
  uk: 'Ukrainian',
  ro: 'Romanian'
}

export function buildSystemPrompt(settings: Settings, req: AnswerRequest): string {
  const lines = [
    'You are ParakeetAI, a real-time conversation copilot for a live call.',
    'The user is the person wearing the microphone, labelled "You". The other party is labelled "Them".',
    'Answer what the user needs to say right now. The answer must be directly usable out loud.',
    MODE_RULES[req.meta.mode] ?? MODE_RULES.regular_call,
    FORMAT_RULES[req.meta.answerPrefs.responseFormat] ?? FORMAT_RULES.balanced,
    LENGTH_RULES[req.meta.answerPrefs.responseLength] ?? LENGTH_RULES.balanced,
    TONE_RULES[req.meta.answerPrefs.responseTone] ?? TONE_RULES.simple,
    'Ground every claim in the supplied context. If the context does not support an answer, say what to ask or clarify instead of inventing details.',
    'Never mention that you are an AI, and never add meta commentary.'
  ]
  if (req.meta.answerPrefs.useStarMethod) {
    lines.push(
      'Structure interview answers with the STAR method: Situation, Task, Action, Result, in that order and without labelling the parts.'
    )
  }
  if (req.meta.answerPrefs.useFillerWords) {
    lines.push(
      'Add one or two natural spoken fillers or self-corrections so the answer sounds spoken rather than read.'
    )
  }
  const language = req.meta.language || settings.stt.language || 'en'
  if (language !== 'en') {
    lines.push(`Write the answer in ${LANGUAGE_NAMES[language] ?? language}.`)
  }
  lines.push(`Current date: ${new Date().toISOString().slice(0, 10)}.`)
  return lines.join(' ')
}

export function buildUserPrompt(req: AnswerRequest): string {
  const brief: string[] = []
  if (req.meta.title) brief.push(`Session: ${req.meta.title}`)
  if (req.meta.companyDomain) brief.push(`Company: ${req.meta.companyDomain}`)
  if (req.meta.jobPostUrl) brief.push(`Job post: ${req.meta.jobPostUrl}`)
  if (req.meta.description) brief.push(`Description: ${req.meta.description}`)
  if (req.meta.extraContext) brief.push(`Extra context: ${req.meta.extraContext}`)

  const recent = req.segments.slice(-30)
  const transcript = recent
    .map((s) => `${s.speaker === 'you' ? 'You' : 'Them'}: ${s.text}`)
    .join('\n')

  const documents = (req.documents ?? [])
    .map((doc) => `### ${doc.name}\n${doc.text}`)
    .join('\n\n')

  const parts: string[] = []
  if (brief.length) parts.push(`SESSION BRIEF\n${brief.join('\n')}`)
  if (documents) parts.push(`REFERENCE DOCUMENTS\n${documents}`)
  if (transcript) parts.push(`RECENT TRANSCRIPT\n${transcript}`)
  if (req.question) parts.push(`QUESTION TO ANSWER\n${req.question}`)
  if (req.instruction) parts.push(`USER INSTRUCTION\n${req.instruction}`)
  parts.push('Respond with only the answer.')
  return parts.join('\n\n')
}

interface StreamResult {
  text: string
  model: string
}

function readSseLines(
  body: ReadableStream<Uint8Array>,
  onLine: (line: string) => void
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const pump = async (): Promise<void> => {
    const { value, done } = await reader.read()
    if (done) {
      if (buffer.trim()) onLine(buffer.trim())
      return
    }
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n')
    buffer = parts.pop() ?? ''
    for (const part of parts) {
      const line = part.trim()
      if (line) onLine(line)
    }
    return pump()
  }
  return pump()
}

async function streamOpenAi(
  settings: Settings,
  req: AnswerRequest,
  onDelta: (text: string) => void,
  signal: AbortSignal
): Promise<StreamResult> {
  const base = settings.llm.baseUrl.replace(/\/+$/, '')
  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.llm.apiKey}`
    },
    body: JSON.stringify({
      model: settings.llm.model,
      stream: true,
      temperature: settings.llm.temperature,
      max_tokens: settings.llm.maxTokens,
      messages: [
        { role: 'system', content: buildSystemPrompt(settings, req) },
        { role: 'user', content: buildUserPrompt(req) }
      ]
    }),
    signal
  })
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`LLM ${response.status}: ${detail.slice(0, 400)}`)
  }
  if (!response.body) throw new Error('LLM returned no body')
  let text = ''
  await readSseLines(response.body, (line) => {
    if (!line.startsWith('data:')) return
    const payload = line.slice(5).trim()
    if (!payload || payload === '[DONE]') return
    try {
      const json = JSON.parse(payload)
      const delta = json.choices?.[0]?.delta?.content
      if (typeof delta === 'string' && delta) {
        text += delta
        onDelta(delta)
      }
    } catch {
      return
    }
  })
  return { text, model: settings.llm.model }
}

async function streamAnthropic(
  settings: Settings,
  req: AnswerRequest,
  onDelta: (text: string) => void,
  signal: AbortSignal
): Promise<StreamResult> {
  const base = settings.llm.baseUrl.includes('anthropic')
    ? settings.llm.baseUrl.replace(/\/+$/, '')
    : 'https://api.anthropic.com'
  const response = await fetch(`${base}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': settings.llm.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: settings.llm.model,
      max_tokens: settings.llm.maxTokens,
      temperature: settings.llm.temperature,
      system: buildSystemPrompt(settings, req),
      messages: [{ role: 'user', content: buildUserPrompt(req) }],
      stream: true
    }),
    signal
  })
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`LLM ${response.status}: ${detail.slice(0, 400)}`)
  }
  if (!response.body) throw new Error('LLM returned no body')
  let text = ''
  await readSseLines(response.body, (line) => {
    if (!line.startsWith('data:')) return
    const payload = line.slice(5).trim()
    if (!payload) return
    try {
      const json = JSON.parse(payload)
      if (json.type === 'content_block_delta' && typeof json.delta?.text === 'string') {
        text += json.delta.text
        onDelta(json.delta.text)
      }
    } catch {
      return
    }
  })
  return { text, model: settings.llm.model }
}

export async function streamAnswer(
  settings: Settings,
  req: AnswerRequest,
  onDelta: (text: string) => void,
  signal: AbortSignal
): Promise<StreamResult> {
  if (!settings.llm.apiKey) throw new Error('No LLM API key configured')
  if (settings.llm.provider === 'anthropic') {
    return streamAnthropic(settings, req, onDelta, signal)
  }
  return streamOpenAi(settings, req, onDelta, signal)
}

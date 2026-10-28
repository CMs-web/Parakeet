import type { AnswerRequest, Settings } from '../shared/types'

const FORMAT_RULES: Record<string, string> = {
  bullets: 'Answer with 2-5 short bullet points. No preamble.',
  'short-paragraph': 'Answer in one tight paragraph of at most 60 words.',
  structured: 'Give the direct answer first, then two short supporting points.'
}

const LENGTH_RULES: Record<string, string> = {
  brief: 'Keep the whole answer under 40 words.',
  balanced: 'Aim for 60 to 90 words.',
  detailed: 'Aim for 120 to 180 words.'
}

const TONE_RULES: Record<string, string> = {
  professional: 'Use a professional, precise tone.',
  friendly: 'Use a warm, conversational tone.',
  confident: 'Sound confident and decisive; avoid hedging.',
  concise: 'Be maximally concise; no filler.'
}

const MODE_RULES: Record<string, string> = {
  general: 'This is a general conversation or meeting.',
  interview: 'This is a job interview. The user is the candidate.',
  sales: 'This is a sales call. The user is the seller.',
  support: 'This is a customer support call. The user is the agent.'
}

export function buildSystemPrompt(settings: Settings, req: AnswerRequest): string {
  const lines = [
    'You are a real-time conversation copilot for a live call.',
    'The user is the person wearing the microphone, labelled "You". The other party is labelled "Them".',
    'Answer what the user needs to say right now. Be directly usable out loud.',
    MODE_RULES[req.meta.mode] ?? MODE_RULES.general,
    FORMAT_RULES[req.meta.answerPrefs.responseFormat] ?? FORMAT_RULES.bullets,
    LENGTH_RULES[req.meta.answerPrefs.responseLength] ?? LENGTH_RULES.balanced,
    TONE_RULES[req.meta.answerPrefs.responseTone] ?? TONE_RULES.professional,
    'Ground every claim in the supplied context. If the context does not support an answer, say what to ask or clarify instead of inventing details.',
    'Never mention that you are an AI, and never add meta commentary.',
    `Current date: ${new Date().toISOString().slice(0, 10)}.`
  ]
  if (settings.llm.provider === 'anthropic') lines.push('Keep formatting light; plain text reads best on the overlay.')
  return lines.join(' ')
}

export function buildUserPrompt(req: AnswerRequest): string {
  const brief: string[] = []
  if (req.meta.title) brief.push(`Session: ${req.meta.title}`)
  if (req.meta.company) brief.push(`Company: ${req.meta.company}`)
  if (req.meta.description) brief.push(`Description: ${req.meta.description}`)
  if (req.meta.extraContext) brief.push(`Extra context: ${req.meta.extraContext}`)

  const recent = req.segments.slice(-30)
  const transcript = recent
    .map((s) => `${s.speaker === 'you' ? 'You' : 'Them'}: ${s.text}`)
    .join('\n')

  const parts: string[] = []
  if (brief.length) parts.push(`SESSION BRIEF\n${brief.join('\n')}`)
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

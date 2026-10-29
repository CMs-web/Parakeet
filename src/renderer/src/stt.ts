import type { Speaker, SttRuntimeConfig } from '../../shared/types'
import { encodeWav, resamplePcm, toBase64 } from './audio'

const SAMPLE_RATE = 16000

export interface SttEvents {
  onPartial: (speaker: Speaker, text: string) => void
  onFinal: (speaker: Speaker, text: string) => void
  onError: (speaker: Speaker, message: string) => void
}

export interface SttClient {
  readonly speaker: Speaker
  start: () => Promise<void>
  push: (pcm: Int16Array) => void
  stop: () => void
}

function cleanTranscript(text: string): string {
  return text
    .replace(/\[blank_audio\]/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .trim()
}

class OpenAiRealtimeClient implements SttClient {
  readonly speaker: Speaker
  private config: SttRuntimeConfig
  private events: SttEvents
  private socket: WebSocket | null = null
  private ready = false
  private queue: Int16Array[] = []
  private batch: Int16Array[] = []
  private batchSamples = 0

  constructor(speaker: Speaker, config: SttRuntimeConfig, events: SttEvents) {
    this.speaker = speaker
    this.config = config
    this.events = events
  }

  async start(): Promise<void> {
    if (!this.config.openaiKey) throw new Error('OpenAI API key missing')
    const url = 'wss://api.openai.com/v1/realtime?intent=transcription'
    const protocols = [
      'realtime',
      `openai-insecure-api-key.${this.config.openaiKey}`,
      'openai-beta.realtime-v1'
    ]
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url, protocols)
      this.socket = socket
      socket.binaryType = 'arraybuffer'
      const timer = window.setTimeout(() => reject(new Error('OpenAI realtime connect timeout')), 12000)
      socket.onopen = () => {
        window.clearTimeout(timer)
        socket.send(
          JSON.stringify({
            type: 'session.update',
            session: {
              type: 'transcription',
              audio: {
                input: {
                  format: { type: 'audio/pcm', rate: 24000 },
                  transcription: {
                    model: this.config.openaiModel || 'gpt-4o-transcribe',
                    language: this.config.language || 'en'
                  },
                  turn_detection: {
                    type: 'server_vad',
                    threshold: 0.5,
                    prefix_padding_ms: 300,
                    silence_duration_ms: 500
                  }
                }
              }
            }
          })
        )
        this.ready = true
        for (const pcm of this.queue) this.sendFrame(pcm)
        this.queue = []
        resolve()
      }
      socket.onerror = () => {
        window.clearTimeout(timer)
        reject(new Error('OpenAI realtime connection failed'))
      }
      socket.onclose = () => {
        this.ready = false
      }
      socket.onmessage = (event: MessageEvent<string>) => {
        try {
          const payload = JSON.parse(event.data)
          if (payload.type === 'conversation.item.input_audio_transcription.delta') {
            const text = cleanTranscript(String(payload.delta ?? ''))
            if (text) this.events.onPartial(this.speaker, text)
          } else if (payload.type === 'conversation.item.input_audio_transcription.completed') {
            const text = cleanTranscript(String(payload.transcript ?? ''))
            if (text) this.events.onFinal(this.speaker, text)
          } else if (payload.type === 'error') {
            this.events.onError(this.speaker, String(payload.error?.message ?? 'OpenAI error'))
          }
        } catch {
          return
        }
      }
    })
  }

  private flushBatch(): void {
    if (this.batch.length === 0) return
    const total = this.batchSamples
    const merged = new Int16Array(total)
    let offset = 0
    for (const chunk of this.batch) {
      merged.set(chunk, offset)
      offset += chunk.length
    }
    this.batch = []
    this.batchSamples = 0
    this.sendFrame(merged)
  }

  private sendFrame(pcm: Int16Array): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return
    const upsampled = resamplePcm(pcm, SAMPLE_RATE, 24000)
    this.socket.send(
      JSON.stringify({ type: 'input_audio_buffer.append', audio: toBase64(upsampled) })
    )
  }

  push(pcm: Int16Array): void {
    if (!this.ready) {
      this.queue.push(pcm)
      if (this.queue.length > 200) this.queue.shift()
      return
    }
    this.batch.push(pcm)
    this.batchSamples += pcm.length
    if (this.batchSamples >= 3200) {
      this.flushBatch()
    }
  }

  stop(): void {
    this.flushBatch()
    this.ready = false
    this.queue = []
    this.batch = []
    this.batchSamples = 0
    if (this.socket) {
      try {
        this.socket.close()
      } catch {
        this.socket = null
      }
      this.socket = null
    }
  }
}

class SpeechmaticsClient implements SttClient {
  readonly speaker: Speaker
  private config: SttRuntimeConfig
  private events: SttEvents
  private socket: WebSocket | null = null
  private ready = false
  private seq = 0
  private queue: Int16Array[] = []

  constructor(speaker: Speaker, config: SttRuntimeConfig, events: SttEvents) {
    this.speaker = speaker
    this.config = config
    this.events = events
  }

  private async fetchToken(): Promise<string> {
    const response = await fetch('https://mp.speechmatics.com/v1/api_keys?type=rt', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.speechmaticsKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ type: 'rt', ttl: 3600 })
    })
    if (!response.ok) throw new Error(`Speechmatics token failed: ${response.status}`)
    const json = (await response.json()) as { key_value?: string }
    if (!json.key_value) throw new Error('Speechmatics token missing')
    return json.key_value
  }

  async start(): Promise<void> {
    if (!this.config.speechmaticsKey) throw new Error('Speechmatics API key missing')
    const token = await this.fetchToken()
    const url = `wss://global.rt.speechmatics.com/v2?jwt=${encodeURIComponent(token)}`
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url)
      this.socket = socket
      socket.binaryType = 'arraybuffer'
      const timer = window.setTimeout(
        () => reject(new Error('Speechmatics connect timeout')),
        12000
      )
      socket.onopen = () => {
        socket.send(
          JSON.stringify({
            message: 'StartRecognition',
            audio_format: {
              type: 'raw',
              encoding: 'pcm_s16le',
              sample_rate: SAMPLE_RATE
            },
            transcription_config: {
              language: this.config.language || 'en',
              enable_partials: true,
              operating_point: 'enhanced',
              max_delay: 0.7
            }
          })
        )
      }
      socket.onerror = () => {
        window.clearTimeout(timer)
        reject(new Error('Speechmatics connection failed'))
      }
      socket.onclose = () => {
        this.ready = false
      }
      socket.onmessage = (event: MessageEvent<string>) => {
        try {
          const payload = JSON.parse(event.data)
          if (payload.message === 'RecognitionStarted') {
            window.clearTimeout(timer)
            this.ready = true
            for (const pcm of this.queue) this.sendFrame(pcm)
            this.queue = []
            resolve()
            return
          }
          if (payload.message === 'AddPartialTranscript') {
            const text = cleanTranscript(
              (payload.metadata?.transcript ?? '')
            )
            if (text) this.events.onPartial(this.speaker, text)
            return
          }
          if (payload.message === 'AddTranscript') {
            const text = cleanTranscript(payload.metadata?.transcript ?? '')
            if (text) this.events.onFinal(this.speaker, text)
            return
          }
          if (payload.message === 'Error') {
            this.events.onError(this.speaker, String(payload.reason ?? 'Speechmatics error'))
          }
        } catch {
          return
        }
      }
    })
  }

  private sendFrame(pcm: Int16Array): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return
    this.socket.send(pcm.slice().buffer as ArrayBuffer)
    this.seq += 1
  }

  push(pcm: Int16Array): void {
    if (!this.ready) {
      this.queue.push(pcm)
      if (this.queue.length > 200) this.queue.shift()
      return
    }
    this.sendFrame(pcm)
  }

  stop(): void {
    this.ready = false
    this.queue = []
    const socket = this.socket
    this.socket = null
    if (!socket) return
    try {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({ message: 'EndOfStream', last_seq_no: Math.max(0, this.seq - 1) })
        )
        window.setTimeout(() => socket.close(), 1500)
      } else {
        socket.close()
      }
    } catch {
      return
    }
  }
}

class LocalWhisperClient implements SttClient {
  readonly speaker: Speaker
  private config: SttRuntimeConfig
  private events: SttEvents
  private buffer: Int16Array[] = []
  private buffered = 0
  private timer: number | null = null
  private busy = false
  private stopped = false

  constructor(speaker: Speaker, config: SttRuntimeConfig, events: SttEvents) {
    this.speaker = speaker
    this.config = config
    this.events = events
  }

  async start(): Promise<void> {
    this.stopped = false
    this.timer = window.setInterval(() => {
      void this.flush()
    }, 4500)
  }

  push(pcm: Int16Array): void {
    if (this.stopped) return
    this.buffer.push(pcm)
    this.buffered += pcm.length
    if (this.buffered >= SAMPLE_RATE * 8) void this.flush()
  }

  private async flush(): Promise<void> {
    if (this.busy || this.buffered < SAMPLE_RATE * 1.2) return
    this.busy = true
    const chunks = this.buffer
    this.buffer = []
    this.buffered = 0
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
    const merged = new Int16Array(total)
    let offset = 0
    for (const chunk of chunks) {
      merged.set(chunk, offset)
      offset += chunk.length
    }
    try {
      const wav = encodeWav(merged, SAMPLE_RATE)
      const form = new FormData()
      form.append('file', new Blob([wav], { type: 'audio/wav' }), 'chunk.wav')
      form.append('response_format', 'json')
      if (this.config.language) {
        form.append('language', this.config.language)
      }
      const response = await fetch(this.config.localUrl, { method: 'POST', body: form })
      if (!response.ok) throw new Error(`local STT ${response.status}`)
      const json = (await response.json()) as { text?: string }
      const text = cleanTranscript(json.text ?? '')
      if (text) this.events.onFinal(this.speaker, text)
    } catch (error) {
      this.events.onError(
        this.speaker,
        error instanceof Error ? error.message : 'local STT failed'
      )
    } finally {
      this.busy = false
    }
  }

  stop(): void {
    this.stopped = true
    if (this.timer !== null) {
      window.clearInterval(this.timer)
      this.timer = null
    }
    void this.flush()
  }
}

export function createSttClient(
  speaker: Speaker,
  config: SttRuntimeConfig,
  events: SttEvents
): SttClient {
  if (config.provider === 'speechmatics') {
    return new SpeechmaticsClient(speaker, config, events)
  }
  if (config.provider === 'local') {
    return new LocalWhisperClient(speaker, config, events)
  }
  return new OpenAiRealtimeClient(speaker, config, events)
}

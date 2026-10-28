import type { Speaker } from '../../shared/types'

const SAMPLE_RATE = 16000
const FRAME_SAMPLES = 1600

const WORKLET_SOURCE = `
class PcmFramer extends AudioWorkletProcessor {
  constructor(options) {
    super()
    this.frame = new Float32Array(options.processorOptions.frameSize)
    this.offset = 0
  }
  process(inputs) {
    const input = inputs[0]
    if (!input || !input[0]) return true
    const channel = input[0]
    for (let i = 0; i < channel.length; i += 1) {
      this.frame[this.offset] = channel[i]
      this.offset += 1
      if (this.offset === this.frame.length) {
        const pcm = new Int16Array(this.frame.length)
        for (let j = 0; j < this.frame.length; j += 1) {
          const sample = Math.max(-1, Math.min(1, this.frame[j]))
          pcm[j] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
        }
        this.port.postMessage(pcm.buffer, [pcm.buffer])
        this.offset = 0
      }
    }
    return true
  }
}
registerProcessor('pcm-framer', PcmFramer)
`

export type FrameHandler = (speaker: Speaker, pcm: Int16Array) => void

export interface CaptureResult {
  mic: boolean
  system: boolean
}

export class AudioCapture {
  private context: AudioContext | null = null
  private workletUrl: string | null = null
  private streams = new Map<Speaker, MediaStream>()
  private nodes: AudioWorkletNode[] = []
  private handlers: FrameHandler[] = []
  private enabled = new Map<Speaker, boolean>()
  private active = false

  onFrame(handler: FrameHandler): () => void {
    this.handlers.push(handler)
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler)
    }
  }

  setEnabled(speaker: Speaker, value: boolean): void {
    this.enabled.set(speaker, value)
  }

  hasSource(speaker: Speaker): boolean {
    return this.streams.has(speaker)
  }

  private emit(speaker: Speaker, pcm: Int16Array): void {
    if (!this.enabled.get(speaker)) return
    for (const handler of this.handlers) handler(speaker, pcm)
  }

  private async ensureContext(): Promise<AudioContext> {
    if (this.context && this.context.state !== 'closed') return this.context
    const context = new AudioContext({ sampleRate: SAMPLE_RATE, latencyHint: 'interactive' })
    const blob = new Blob([WORKLET_SOURCE], { type: 'application/javascript' })
    this.workletUrl = URL.createObjectURL(blob)
    await context.audioWorklet.addModule(this.workletUrl)
    this.context = context
    return context
  }

  private attach(context: AudioContext, stream: MediaStream, speaker: Speaker): void {
    const source = context.createMediaStreamSource(stream)
    const node = new AudioWorkletNode(context, 'pcm-framer', {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      processorOptions: { frameSize: FRAME_SAMPLES }
    })
    node.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      this.emit(speaker, new Int16Array(event.data))
    }
    source.connect(node)
    this.nodes.push(node)
    this.streams.set(speaker, stream)
    this.enabled.set(speaker, true)
  }

  async start(options: { mic: boolean; system: boolean }): Promise<CaptureResult> {
    this.stop()
    const context = await this.ensureContext()
    if (context.state === 'suspended') await context.resume()
    const result: CaptureResult = { mic: false, system: false }

    if (options.mic) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        })
        this.attach(context, stream, 'you')
        result.mic = true
      } catch (error) {
        console.warn('microphone capture failed', error)
      }
    }

    if (options.system) {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true
        })
        for (const track of stream.getVideoTracks()) track.stop()
        const audioTracks = stream.getAudioTracks()
        if (audioTracks.length > 0) {
          audioTracks[0].onended = () => {
            this.enabled.set('them', false)
            this.streams.delete('them')
          }
          this.attach(context, stream, 'them')
          result.system = true
        } else {
          for (const track of stream.getTracks()) track.stop()
          console.warn('system audio capture returned no audio track')
        }
      } catch (error) {
        console.warn('system audio capture failed', error)
      }
    }

    this.active = result.mic || result.system
    return result
  }

  stop(): void {
    this.active = false
    for (const node of this.nodes) {
      try {
        node.port.onmessage = null
        node.disconnect()
      } catch {
        continue
      }
    }
    this.nodes = []
    for (const stream of this.streams.values()) {
      for (const track of stream.getTracks()) track.stop()
    }
    this.streams.clear()
    if (this.context && this.context.state !== 'closed') {
      void this.context.close()
    }
    this.context = null
    if (this.workletUrl) {
      URL.revokeObjectURL(this.workletUrl)
      this.workletUrl = null
    }
  }

  isActive(): boolean {
    return this.active
  }
}

export async function listInputDevices(): Promise<MediaDeviceInfo[]> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices.filter((device) => device.kind === 'audioinput')
  } catch {
    return []
  }
}

export function toBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function resamplePcm(pcm: Int16Array, fromRate: number, toRate: number): Int16Array {
  if (fromRate === toRate) return pcm
  const ratio = toRate / fromRate
  const length = Math.floor(pcm.length * ratio)
  const out = new Int16Array(length)
  for (let i = 0; i < length; i += 1) {
    const position = i / ratio
    const index = Math.floor(position)
    const fraction = position - index
    const a = pcm[index] ?? 0
    const b = pcm[index + 1] ?? a
    out[i] = Math.round(a + (b - a) * fraction)
  }
  return out
}

export function encodeWav(pcm: Int16Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + pcm.byteLength)
  const view = new DataView(buffer)
  const writeString = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i))
  }
  writeString(0, 'RIFF')
  view.setUint32(4, 36 + pcm.byteLength, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, pcm.byteLength, true)
  new Int16Array(buffer, 44).set(pcm)
  return buffer
}

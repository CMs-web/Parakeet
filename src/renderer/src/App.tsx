import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import type { OverlayCommand } from '../../preload'
import type {
  AnswerRequest,
  OverlayState,
  SessionMeta,
  SessionMode,
  SessionRecord,
  Settings,
  Speaker,
  TranscriptSegment
} from '../../shared/types'
import { AudioCapture } from './audio'
import { looksLikeQuestion } from './question'
import { createSttClient, type SttClient, type SttEvents } from './stt'
import { formatClock } from './utils'
import { HistoryPanel } from './components/HistoryPanel'
import { SettingsPanel } from './components/SettingsPanel'

type View = 'session' | 'history' | 'settings'
type Status = 'idle' | 'listening' | 'answering' | 'error'

const SPEAKERS: Speaker[] = ['you', 'them']

interface SessionForm {
  title: string
  company: string
  description: string
  extraContext: string
  mode: SessionMode
}

export default function App(): ReactElement {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [view, setView] = useState<View>('session')
  const [session, setSession] = useState<SessionRecord | null>(null)
  const [segments, setSegments] = useState<TranscriptSegment[]>([])
  const [partial, setPartial] = useState<Record<Speaker, string>>({ you: '', them: '' })
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [model, setModel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [extended, setExtended] = useState(0)
  const [micOn, setMicOn] = useState(false)
  const [systemOn, setSystemOn] = useState(false)
  const [overlayVisible, setOverlayVisible] = useState(false)
  const [starting, setStarting] = useState(false)
  const [form, setForm] = useState<SessionForm>({
    title: '',
    company: '',
    description: '',
    extraContext: '',
    mode: 'general'
  })

  const audioRef = useRef<AudioCapture | null>(null)
  const clientsRef = useRef(new Map<Speaker, SttClient>())
  const sessionRef = useRef<SessionRecord | null>(null)
  const segmentsRef = useRef<TranscriptSegment[]>([])
  const settingsRef = useRef<Settings | null>(null)
  const statusRef = useRef<Status>('idle')
  const micOnRef = useRef(false)
  const systemOnRef = useRef(false)
  const requestRef = useRef<string | null>(null)
  const lastAutoRef = useRef(0)
  const eventsRef = useRef<SttEvents>({ onPartial: () => undefined, onFinal: () => undefined, onError: () => undefined })
  const commandsRef = useRef<(command: OverlayCommand) => void>(() => undefined)

  useEffect(() => {
    void (async () => {
      const loaded = await window.api.settings.get()
      setSettings(loaded)
      setForm((current) => ({ ...current, mode: loaded.defaults.sessionMode }))
      setOverlayVisible(await window.api.overlay.isVisible())
    })()
  }, [])

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  useEffect(() => {
    statusRef.current = status
  }, [status])

  useEffect(() => {
    micOnRef.current = micOn
  }, [micOn])

  useEffect(() => {
    systemOnRef.current = systemOn
  }, [systemOn])

  useEffect(() => {
    return window.api.onAnswerDelta((delta) => {
      if (!delta.requestId) return
      if (delta.error) {
        setError(delta.error)
        setStatus('error')
        requestRef.current = null
        return
      }
      if (delta.done) {
        if (delta.model) setModel(delta.model)
        requestRef.current = null
        setStatus(sessionRef.current ? 'listening' : 'idle')
        return
      }
      setAnswer((current) => current + delta.text)
    })
  }, [])

  useEffect(() => {
    if (!session) return
    const startedAt = session.createdAt
    setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [session])

  const allowedSeconds = useMemo(() => {
    if (!settings) return 0
    return settings.limits.callMinutes * 60 + extended * settings.limits.extensionMinutes * 60
  }, [settings, extended])

  const remaining = Math.max(0, allowedSeconds - elapsed)

  const ask = useCallback(async (explicit?: string, instruction = ''): Promise<void> => {
    const record = sessionRef.current
    if (!record) {
      setError('Start a session first.')
      return
    }
    if (statusRef.current === 'answering') return
    const all = segmentsRef.current
    const lastThem = [...all].reverse().find((segment) => segment.speaker === 'them')
    const prompt = (explicit ?? lastThem?.text ?? '').trim()
    setQuestion(prompt)
    setAnswer('')
    setError(null)
    setStatus('answering')
    const request: AnswerRequest = {
      sessionId: record.id,
      question: prompt,
      instruction,
      segments: all,
      meta: {
        mode: record.mode,
        title: record.title,
        company: record.company,
        description: record.description,
        extraContext: record.extraContext,
        answerPrefs: record.answerPrefs
      }
    }
    try {
      const result = await window.api.answer.generate(request)
      requestRef.current = result.requestId
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Answer request failed')
      setStatus('error')
    }
  }, [])

  const handlePartial = useCallback((speaker: Speaker, text: string): void => {
    setPartial((current) => ({ ...current, [speaker]: text }))
  }, [])

  const handleFinal = useCallback(
    (speaker: Speaker, text: string): void => {
      const record = sessionRef.current
      if (!record) return
      const now = Date.now()
      const segment: TranscriptSegment = {
        id: `seg-${now}-${Math.random().toString(36).slice(2, 8)}`,
        speaker,
        text,
        startedAt: now,
        endedAt: now,
        final: true
      }
      setPartial((current) => ({ ...current, [speaker]: '' }))
      const next = [...segmentsRef.current, segment]
      segmentsRef.current = next
      setSegments(next)
      void window.api.transcript.append(record.id, segment)
      if (speaker === 'them') {
        setQuestion(text)
        const auto = settingsRef.current?.autoAnswer ?? false
        if (auto && looksLikeQuestion(text) && Date.now() - lastAutoRef.current > 6000) {
          lastAutoRef.current = Date.now()
          void ask(text)
        }
      }
    },
    [ask]
  )

  const handleError = useCallback((speaker: Speaker, message: string): void => {
    setError(`${speaker === 'you' ? 'Mic' : 'System'} stream: ${message}`)
  }, [])

  useEffect(() => {
    eventsRef.current = { onPartial: handlePartial, onFinal: handleFinal, onError: handleError }
  }, [handlePartial, handleFinal, handleError])

  const startSession = async (): Promise<void> => {
    if (!settings) return
    if (sessionRef.current) return
    setStarting(true)
    setError(null)
    const capture = new AudioCapture()
    let result
    try {
      result = await capture.start({ mic: settings.captureMic, system: settings.captureSystemAudio })
    } catch (caught) {
      capture.stop()
      setError(caught instanceof Error ? caught.message : 'Audio capture failed')
      setStarting(false)
      return
    }
    if (!result.mic && !result.system) {
      capture.stop()
      setError('No audio source available. Allow microphone and screen-audio access and retry.')
      setStarting(false)
      return
    }
    const sttConfig = await window.api.stt.config()
    const missingKey =
      (sttConfig.provider === 'openai' && !sttConfig.openaiKey) ||
      (sttConfig.provider === 'speechmatics' && !sttConfig.speechmaticsKey)
    if (missingKey) {
      capture.stop()
      setError('Add a speech-to-text API key in Settings before starting.')
      setStarting(false)
      return
    }

    const meta: SessionMeta = {
      mode: form.mode,
      title: form.title.trim(),
      company: form.company.trim(),
      description: form.description.trim(),
      extraContext: form.extraContext.trim(),
      answerPrefs: {
        responseFormat: settings.defaults.responseFormat,
        responseLength: settings.defaults.responseLength,
        responseTone: settings.defaults.responseTone
      }
    }

    let record: SessionRecord
    try {
      record = await window.api.session.start(meta)
    } catch (caught) {
      capture.stop()
      setError(caught instanceof Error ? caught.message : 'Could not create session')
      setStarting(false)
      return
    }

    sessionRef.current = record
    segmentsRef.current = []
    const clients = new Map<Speaker, SttClient>()
    for (const speaker of SPEAKERS) {
      const active = speaker === 'you' ? result.mic : result.system
      if (!active) continue
      try {
        const client = createSttClient(speaker, sttConfig, eventsRef.current)
        await client.start()
        clients.set(speaker, client)
      } catch (caught) {
        setError(
          `${speaker === 'you' ? 'Mic' : 'System'} transcription: ${
            caught instanceof Error ? caught.message : 'failed to connect'
          }`
        )
      }
    }
    if (clients.size === 0) {
      capture.stop()
      void window.api.session.end(record.id)
      sessionRef.current = null
      setError('Transcription could not connect. Check the API key and provider.')
      setStarting(false)
      return
    }

    clientsRef.current = clients
    audioRef.current = capture
    capture.onFrame((speaker, pcm) => {
      clientsRef.current.get(speaker)?.push(pcm)
    })

    setSession(record)
    setSegments([])
    setPartial({ you: '', them: '' })
    setStatus('listening')
    setElapsed(0)
    setExtended(0)
    setMicOn(result.mic)
    setSystemOn(result.system)
    setAnswer('')
    setQuestion('')
    setModel('')
    setStarting(false)
  }

  const stopSession = useCallback(async (): Promise<void> => {
    const record = sessionRef.current
    const capture = audioRef.current
    audioRef.current = null
    for (const client of clientsRef.current.values()) client.stop()
    clientsRef.current.clear()
    capture?.stop()
    if (record) await window.api.session.end(record.id)
    sessionRef.current = null
    setSession(null)
    setStatus('idle')
    setMicOn(false)
    setSystemOn(false)
    setQuestion('')
    setAnswer('')
    setPartial({ you: '', them: '' })
    setSegments([])
    segmentsRef.current = []
  }, [])

  const toggleSpeaker = useCallback(async (speaker: Speaker): Promise<void> => {
    const capture = audioRef.current
    if (!capture || !sessionRef.current) return
    const current = speaker === 'you' ? micOnRef.current : systemOnRef.current
    const next = !current
    if (!capture.hasSource(speaker)) {
      setError(`No ${speaker === 'you' ? 'microphone' : 'system audio'} stream in this session.`)
      return
    }
    if (next && !clientsRef.current.has(speaker)) {
      try {
        const config = await window.api.stt.config()
        const client = createSttClient(speaker, config, eventsRef.current)
        await client.start()
        clientsRef.current.set(speaker, client)
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not start transcription')
        return
      }
    }
    capture.setEnabled(speaker, next)
    if (speaker === 'you') setMicOn(next)
    else setSystemOn(next)
  }, [])

  const toggleOverlay = useCallback(async (): Promise<void> => {
    setOverlayVisible(await window.api.overlay.toggle())
  }, [])

  useEffect(() => {
    commandsRef.current = (command: OverlayCommand): void => {
      if (command.type === 'answer') void ask()
      if (command.type === 'clear') {
        setAnswer('')
        setQuestion('')
      }
      if (command.type === 'toggle-mic') void toggleSpeaker('you')
      if (command.type === 'toggle-system') void toggleSpeaker('them')
      if (command.type === 'end-session') void stopSession()
    }
  })

  useEffect(() => {
    return window.api.onOverlayCommand((command) => commandsRef.current(command))
  }, [])

  useEffect(() => window.api.onOverlayVisibility(setOverlayVisible), [])

  useEffect(() => {
    if (!session || allowedSeconds <= 0) return
    if (remaining <= 0) void stopSession()
  }, [remaining, allowedSeconds, session, stopSession])

  useEffect(() => {
    const state: OverlayState = {
      status,
      timer: formatClock(elapsed),
      question,
      answer,
      micActive: micOn,
      systemActive: systemOn,
      model,
      error
    }
    window.api.overlay.sync(state)
  }, [status, elapsed, question, answer, micOn, systemOn, model, error])

  const saveSettings = async (next: Settings): Promise<void> => {
    const saved = await window.api.settings.save(next)
    setSettings(saved)
  }

  const resetSettings = async (): Promise<void> => {
    const reset = await window.api.settings.reset()
    setSettings(reset)
  }

  if (!settings) {
    return (
      <div className="app">
        <aside className="sidebar">
          <div className="logo">
            <span className="logo-mark" />
            Parakeet
          </div>
        </aside>
        <main className="main">
          <p style={{ color: 'var(--muted)' }}>Loading settings…</p>
        </main>
      </div>
    )
  }

  const transcriptItems: Array<TranscriptSegment & { partial?: boolean }> = [
    ...segments,
    ...SPEAKERS.filter((speaker) => partial[speaker]).map((speaker) => ({
      id: `partial-${speaker}`,
      speaker,
      text: partial[speaker],
      startedAt: Date.now(),
      endedAt: Date.now(),
      final: false,
      partial: true
    }))
  ]

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">
          <span className="logo-mark" />
          Parakeet
        </div>
        <button
          className={`nav-button ${view === 'session' ? 'active' : ''}`}
          type="button"
          onClick={() => setView('session')}
        >
          Live session
        </button>
        <button
          className={`nav-button ${view === 'history' ? 'active' : ''}`}
          type="button"
          onClick={() => setView('history')}
        >
          History
        </button>
        <button
          className={`nav-button ${view === 'settings' ? 'active' : ''}`}
          type="button"
          onClick={() => setView('settings')}
        >
          Settings
        </button>
        <div className="sidebar-footer">
          <div>{overlayVisible ? 'Overlay visible' : 'Overlay hidden'}</div>
          <div>v0.1.0</div>
        </div>
      </aside>

      <main className="main">
        {view === 'session' ? (
          <>
            <div className="page-header">
              <div>
                <h1>{session ? session.title || 'Live session' : 'New session'}</h1>
                <p>
                  {session
                    ? `${session.mode} · ${formatClock(elapsed)} elapsed`
                    : 'Capture call audio, transcribe both sides, and answer on demand.'}
                </p>
              </div>
              <div className="toolbar">
                <span className={`badge ${session ? 'live' : ''}`}>
                  <span className={`dot dot-${status}`} />
                  {status === 'listening'
                    ? 'Listening'
                    : status === 'answering'
                      ? 'Answering'
                      : status === 'error'
                        ? 'Error'
                        : 'Idle'}
                </span>
                <button type="button" onClick={() => void toggleOverlay()}>
                  {overlayVisible ? 'Hide overlay' : 'Show overlay'}
                </button>
                {session ? (
                  <button type="button" className="danger" onClick={() => void stopSession()}>
                    End session
                  </button>
                ) : null}
              </div>
            </div>

            {session && remaining <= 60 ? (
              <div className="banner">
                <span>Session time is almost up ({formatClock(remaining)} left).</span>
                <span className="spacer" />
                <button
                  type="button"
                  onClick={() => setExtended((value) => Math.min(3, value + 1))}
                  disabled={extended >= 3}
                >
                  Extend +{settings.limits.extensionMinutes}m
                </button>
              </div>
            ) : null}

            {error ? (
              <div className="banner" style={{ borderColor: 'rgba(248,113,113,0.4)', background: 'rgba(248,113,113,0.08)', color: '#fca5a5' }}>
                <span>{error}</span>
                <span className="spacer" />
                <button type="button" onClick={() => setError(null)}>
                  Dismiss
                </button>
              </div>
            ) : null}

            {!session ? (
              <div className="columns">
                <section className="card">
                  <h2>Session brief</h2>
                  <div className="stack">
                    <div className="row">
                      <label className="field">
                        Title
                        <input
                          value={form.title}
                          onChange={(event) => setForm({ ...form, title: event.target.value })}
                          placeholder="Product manager interview"
                        />
                      </label>
                      <label className="field">
                        Company
                        <input
                          value={form.company}
                          onChange={(event) => setForm({ ...form, company: event.target.value })}
                          placeholder="Acme"
                        />
                      </label>
                    </div>
                    <label className="field">
                      Mode
                      <select
                        value={form.mode}
                        onChange={(event) =>
                          setForm({ ...form, mode: event.target.value as SessionMode })
                        }
                      >
                        <option value="general">General</option>
                        <option value="interview">Interview</option>
                        <option value="sales">Sales call</option>
                        <option value="support">Support call</option>
                      </select>
                    </label>
                    <label className="field">
                      What is this call about
                      <textarea
                        value={form.description}
                        onChange={(event) => setForm({ ...form, description: event.target.value })}
                        placeholder="Role scope, interviewer background, pipeline stage…"
                      />
                    </label>
                    <label className="field">
                      Extra context
                      <textarea
                        value={form.extraContext}
                        onChange={(event) =>
                          setForm({ ...form, extraContext: event.target.value })
                        }
                        placeholder="Resume highlights, pricing, product facts…"
                      />
                    </label>
                    <div className="toolbar">
                      <button
                        className="primary"
                        type="button"
                        disabled={starting}
                        onClick={() => void startSession()}
                      >
                        {starting ? 'Starting…' : 'Start session'}
                      </button>
                      <button type="button" onClick={() => setView('settings')}>
                        Configure providers
                      </button>
                    </div>
                    <p style={{ color: 'var(--muted)', fontSize: 12, margin: 0 }}>
                      Microphone captures you; system audio captures the call. Windows will ask for
                      screen-share permission to enable loopback audio.
                    </p>
                  </div>
                </section>

                <section className="card">
                  <h2>Shortcuts</h2>
                  <div className="stack">
                    {Object.entries(settings.hotkeys).map(([name, accelerator]) => (
                      <div className="toggle" key={name}>
                        <span className="label-text">{name}</span>
                        <span className="badge">{accelerator}</span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            ) : (
              <div className="columns">
                <section className="card">
                  <h2>Transcript</h2>
                  <div className="transcript">
                    {transcriptItems.length === 0 ? (
                      <p style={{ color: 'var(--muted)', margin: 0 }}>
                        Waiting for audio. Speak or play call audio to begin.
                      </p>
                    ) : (
                      transcriptItems.map((segment) => (
                        <div
                          className={`segment ${segment.speaker} ${segment.partial ? 'partial' : ''}`}
                          key={segment.id}
                        >
                          <span className="who">
                            {segment.speaker === 'you' ? 'You' : 'Them'}
                            {segment.partial ? ' · live' : ''}
                          </span>
                          <p>{segment.text}</p>
                        </div>
                      ))
                    )}
                  </div>
                </section>

                <section className="card">
                  <h2>Answer</h2>
                  <div className="stack">
                    <div className="toolbar">
                      <button
                        className="primary"
                        type="button"
                        onClick={() => void ask()}
                        disabled={status === 'answering'}
                      >
                        {status === 'answering' ? 'Answering…' : 'Answer now'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAnswer('')
                          setQuestion('')
                        }}
                      >
                        Clear
                      </button>
                      <span className="badge">{model || 'model idle'}</span>
                    </div>
                    {question ? (
                      <div style={{ color: 'var(--muted)', fontSize: 12 }}>{question}</div>
                    ) : null}
                    <div className={`answer-box ${answer ? '' : 'empty'}`}>
                      {answer || 'Answers stream here. Auto-answer is optional in Settings.'}
                    </div>
                  </div>
                </section>
              </div>
            )}
          </>
        ) : null}

        {view === 'history' ? (
          <>
            <div className="page-header">
              <div>
                <h1>History</h1>
                <p>Saved transcripts and answers.</p>
              </div>
            </div>
            <HistoryPanel />
          </>
        ) : null}

        {view === 'settings' ? (
          <>
            <div className="page-header">
              <div>
                <h1>Settings</h1>
                <p>Providers, overlay behavior, defaults and limits.</p>
              </div>
            </div>
            <SettingsPanel
              settings={settings}
              onSave={saveSettings}
              onReset={resetSettings}
            />
          </>
        ) : null}
      </main>
    </div>
  )
}

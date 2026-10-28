import { useEffect, useState, type ReactElement } from 'react'
import { MODELS, type Settings } from '../../../shared/types'
import { Toggle } from './Toggle'

interface SettingsPanelProps {
  settings: Settings
  onSave: (settings: Settings) => Promise<void>
  onReset: () => Promise<void>
}

export function SettingsPanel({ settings, onSave, onReset }: SettingsPanelProps): ReactElement {
  const [draft, setDraft] = useState<Settings>(() => structuredClone(settings))
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setDraft(structuredClone(settings))
  }, [settings])

  const update = <K extends keyof Settings>(key: K, value: Settings[K]): void => {
    setDraft((current) => ({ ...current, [key]: value }))
    setSaved(false)
  }

  const save = async (): Promise<void> => {
    await onSave(draft)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1600)
  }

  return (
    <div className="stack">
      <section className="card">
        <h2>Speech to text</h2>
        <div className="stack">
          <div className="row">
            <label className="field">
              Provider
              <select
                value={draft.stt.provider}
                onChange={(event) =>
                  update('stt', { ...draft.stt, provider: event.target.value as Settings['stt']['provider'] })
                }
              >
                <option value="openai">OpenAI Realtime</option>
                <option value="speechmatics">Speechmatics Realtime</option>
                <option value="local">Local Whisper HTTP</option>
              </select>
            </label>
            <label className="field">
              Language
              <input
                value={draft.stt.language}
                onChange={(event) => update('stt', { ...draft.stt, language: event.target.value })}
                placeholder="en"
              />
            </label>
          </div>
          {draft.stt.provider === 'openai' ? (
            <div className="row">
              <label className="field">
                OpenAI API key
                <input
                  type="password"
                  value={draft.stt.openaiKey}
                  onChange={(event) => update('stt', { ...draft.stt, openaiKey: event.target.value })}
                  placeholder="sk-..."
                />
              </label>
              <label className="field">
                Transcription model
                <input
                  value={draft.stt.openaiModel}
                  onChange={(event) =>
                    update('stt', { ...draft.stt, openaiModel: event.target.value })
                  }
                  placeholder="gpt-4o-transcribe"
                />
              </label>
            </div>
          ) : null}
          {draft.stt.provider === 'speechmatics' ? (
            <label className="field">
              Speechmatics API key
              <input
                type="password"
                value={draft.stt.speechmaticsKey}
                onChange={(event) =>
                  update('stt', { ...draft.stt, speechmaticsKey: event.target.value })
                }
              />
            </label>
          ) : null}
          {draft.stt.provider === 'local' ? (
            <label className="field">
              Local endpoint (whisper.cpp /inference)
              <input
                value={draft.stt.localUrl}
                onChange={(event) => update('stt', { ...draft.stt, localUrl: event.target.value })}
              />
            </label>
          ) : null}
        </div>
      </section>

      <section className="card">
        <h2>Answer model</h2>
        <div className="stack">
          <div className="row">
            <label className="field">
              Provider
              <select
                value={draft.llm.provider}
                onChange={(event) =>
                  update('llm', {
                    ...draft.llm,
                    provider: event.target.value as Settings['llm']['provider']
                  })
                }
              >
                <option value="openai">OpenAI compatible</option>
                <option value="anthropic">Anthropic</option>
              </select>
            </label>
            <label className="field">
              Model
              <input
                list="model-options"
                value={draft.llm.model}
                onChange={(event) => update('llm', { ...draft.llm, model: event.target.value })}
              />
              <datalist id="model-options">
                {MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </datalist>
            </label>
          </div>
          <label className="field">
            Base URL
            <input
              value={draft.llm.baseUrl}
              onChange={(event) => update('llm', { ...draft.llm, baseUrl: event.target.value })}
            />
          </label>
          <label className="field">
            API key
            <input
              type="password"
              value={draft.llm.apiKey}
              onChange={(event) => update('llm', { ...draft.llm, apiKey: event.target.value })}
            />
          </label>
          <div className="row">
            <label className="field">
              Temperature ({draft.llm.temperature.toFixed(2)})
              <input
                type="range"
                min={0}
                max={1.5}
                step={0.05}
                value={draft.llm.temperature}
                onChange={(event) =>
                  update('llm', { ...draft.llm, temperature: Number(event.target.value) })
                }
              />
            </label>
            <label className="field">
              Max tokens
              <input
                type="number"
                min={100}
                max={4000}
                step={50}
                value={draft.llm.maxTokens}
                onChange={(event) =>
                  update('llm', { ...draft.llm, maxTokens: Number(event.target.value) })
                }
              />
            </label>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Overlay</h2>
        <div className="stack">
          <div className="row">
            <label className="field">
              Opacity ({Math.round(draft.overlay.opacity * 100)}%)
              <input
                type="range"
                min={0.3}
                max={1}
                step={0.02}
                value={draft.overlay.opacity}
                onChange={(event) =>
                  update('overlay', { ...draft.overlay, opacity: Number(event.target.value) })
                }
              />
            </label>
            <label className="field">
              Width ({draft.overlay.width}px)
              <input
                type="range"
                min={360}
                max={720}
                step={10}
                value={draft.overlay.width}
                onChange={(event) =>
                  update('overlay', { ...draft.overlay, width: Number(event.target.value) })
                }
              />
            </label>
          </div>
          <label className="field">
            Position
            <select
              value={draft.overlay.position}
              onChange={(event) =>
                update('overlay', {
                  ...draft.overlay,
                  position: event.target.value as 'left' | 'right'
                })
              }
            >
              <option value="right">Right of screen</option>
              <option value="left">Left of screen</option>
            </select>
          </label>
          <Toggle
            label="Click through overlay"
            hint="Mouse events pass through to the app below."
            checked={draft.overlay.clickThrough}
            onChange={(value) => update('overlay', { ...draft.overlay, clickThrough: value })}
          />
        </div>
      </section>

      <section className="card">
        <h2>Defaults and limits</h2>
        <div className="stack">
          <div className="row">
            <label className="field">
              Session mode
              <select
                value={draft.defaults.sessionMode}
                onChange={(event) =>
                  update('defaults', {
                    ...draft.defaults,
                    sessionMode: event.target.value as Settings['defaults']['sessionMode']
                  })
                }
              >
                <option value="general">General</option>
                <option value="interview">Interview</option>
                <option value="sales">Sales call</option>
                <option value="support">Support call</option>
              </select>
            </label>
            <label className="field">
              Response format
              <select
                value={draft.defaults.responseFormat}
                onChange={(event) =>
                  update('defaults', {
                    ...draft.defaults,
                    responseFormat: event.target.value as Settings['defaults']['responseFormat']
                  })
                }
              >
                <option value="bullets">Bullets</option>
                <option value="short-paragraph">Short paragraph</option>
                <option value="structured">Structured</option>
              </select>
            </label>
          </div>
          <div className="row">
            <label className="field">
              Response length
              <select
                value={draft.defaults.responseLength}
                onChange={(event) =>
                  update('defaults', {
                    ...draft.defaults,
                    responseLength: event.target.value as Settings['defaults']['responseLength']
                  })
                }
              >
                <option value="brief">Brief</option>
                <option value="balanced">Balanced</option>
                <option value="detailed">Detailed</option>
              </select>
            </label>
            <label className="field">
              Tone
              <select
                value={draft.defaults.responseTone}
                onChange={(event) =>
                  update('defaults', {
                    ...draft.defaults,
                    responseTone: event.target.value as Settings['defaults']['responseTone']
                  })
                }
              >
                <option value="professional">Professional</option>
                <option value="friendly">Friendly</option>
                <option value="confident">Confident</option>
                <option value="concise">Concise</option>
              </select>
            </label>
          </div>
          <div className="row">
            <label className="field">
              Trial minutes
              <input
                type="number"
                min={1}
                max={120}
                value={draft.limits.trialMinutes}
                onChange={(event) =>
                  update('limits', { ...draft.limits, trialMinutes: Number(event.target.value) })
                }
              />
            </label>
            <label className="field">
              Call minutes
              <input
                type="number"
                min={5}
                max={240}
                value={draft.limits.callMinutes}
                onChange={(event) =>
                  update('limits', { ...draft.limits, callMinutes: Number(event.target.value) })
                }
              />
            </label>
          </div>
          <div className="row">
            <label className="field">
              Extension minutes
              <input
                type="number"
                min={5}
                max={120}
                value={draft.limits.extensionMinutes}
                onChange={(event) =>
                  update('limits', {
                    ...draft.limits,
                    extensionMinutes: Number(event.target.value)
                  })
                }
              />
            </label>
            <label className="field">
              Cooldown minutes
              <input
                type="number"
                min={0}
                max={120}
                value={draft.limits.cooldownMinutes}
                onChange={(event) =>
                  update('limits', { ...draft.limits, cooldownMinutes: Number(event.target.value) })
                }
              />
            </label>
          </div>
          <Toggle
            label="Auto answer"
            hint="Answer automatically when the other party finishes a question."
            checked={draft.autoAnswer}
            onChange={(value) => update('autoAnswer', value)}
          />
          <Toggle
            label="Capture microphone"
            hint="Your voice is labelled You."
            checked={draft.captureMic}
            onChange={(value) => update('captureMic', value)}
          />
          <Toggle
            label="Capture system audio"
            hint="Call audio is labelled Them. Uses loopback capture."
            checked={draft.captureSystemAudio}
            onChange={(value) => update('captureSystemAudio', value)}
          />
        </div>
      </section>

      <div className="toolbar">
        <button className="primary" type="button" onClick={() => void save()}>
          {saved ? 'Saved' : 'Save settings'}
        </button>
        <button
          className="danger"
          type="button"
          onClick={() => {
            void onReset()
          }}
        >
          Reset to defaults
        </button>
      </div>
    </div>
  )
}

import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { OverlayState } from '../../shared/types'
import './styles.css'

const EMPTY_STATE: OverlayState = {
  status: 'idle',
  timer: '00:00',
  question: '',
  answer: '',
  micActive: false,
  systemActive: false,
  model: '',
  error: null
}

function Overlay(): React.ReactElement {
  const [state, setState] = useState<OverlayState>(EMPTY_STATE)
  const answerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => window.api.onOverlayState(setState), [])

  useEffect(() => {
    const node = answerRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [state.answer])

  useEffect(() => {
    const unsubscribe = window.api.onOverlayCommand((command) => {
      if (command.type === 'scroll') {
        const node = answerRef.current
        if (node) node.scrollBy({ top: command.direction === 'up' ? -160 : 160, behavior: 'smooth' })
      }
      if (command.type === 'clear') setState((current) => ({ ...current, answer: '', question: '' }))
    })
    return unsubscribe
  }, [])

  const statusLabel =
    state.status === 'answering' ? 'Answering' : state.status === 'listening' ? 'Listening' : 'Idle'

  return (
    <div className="overlay-shell">
      <header className="overlay-header">
        <div className="brand">
          <span className={`dot dot-${state.status}`} />
          <span className="brand-name">Talkwise</span>
          <span className="overlay-status">{statusLabel}</span>
        </div>
        <div className="overlay-meta">
          <span className="timer">{state.timer}</span>
          <span className={`pill ${state.micActive ? 'pill-on' : ''}`}>Mic</span>
          <span className={`pill ${state.systemActive ? 'pill-on' : ''}`}>System</span>
        </div>
        <div className="overlay-actions">
          <button
            className="ghost"
            type="button"
            onClick={() => window.api.overlay.emit({ type: 'answer' })}
            title="Answer now"
          >
            Answer
          </button>
          <button
            className="ghost"
            type="button"
            onClick={() => window.api.overlay.emit({ type: 'clear' })}
            title="Clear"
          >
            Clear
          </button>
          <button
            className="ghost"
            type="button"
            onClick={() => void window.api.overlay.hide()}
            title="Hide overlay"
          >
            Hide
          </button>
        </div>
      </header>

      {state.error ? <div className="overlay-error">{state.error}</div> : null}

      {state.question ? (
        <div className="overlay-question">
          <span className="label">Question</span>
          <p>{state.question}</p>
        </div>
      ) : null}

      <div className="overlay-answer" ref={answerRef}>
        {state.answer ? (
          <p>{state.answer}</p>
        ) : (
          <p className="placeholder">
            {state.status === 'listening'
              ? 'Listening for a question. Press Answer now or wait for auto-answer.'
              : 'Start a session in the dashboard to begin.'}
          </p>
        )}
      </div>

      <footer className="overlay-footer">
        <span>{state.model || 'no model'}</span>
        <span className="spacer" />
        <span className="hint">Ctrl+Shift+Space toggles overlay</span>
      </footer>
    </div>
  )
}

const container = document.getElementById('root')
if (!container) throw new Error('Missing root element')

createRoot(container).render(
  <React.StrictMode>
    <Overlay />
  </React.StrictMode>
)

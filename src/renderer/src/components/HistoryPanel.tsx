import { useCallback, useEffect, useState, type ReactElement } from 'react'
import type { SessionRecord, SessionSummary } from '../../../shared/types'
import { formatDateTime, formatDuration } from '../utils'

export function HistoryPanel(): ReactElement {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [selected, setSelected] = useState<SessionRecord | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setSessions(await window.api.session.list())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not list sessions')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const open = async (id: string): Promise<void> => {
    const record = await window.api.session.get(id)
    setSelected(record)
  }

  const remove = async (id: string): Promise<void> => {
    await window.api.session.remove(id)
    if (selected?.id === id) setSelected(null)
    await load()
  }

  const exportFile = async (id: string): Promise<void> => {
    const path = await window.api.session.saveFile(id)
    if (!path) return
    setError(null)
  }

  return (
    <div className="stack">
      <div className="toolbar">
        <button type="button" onClick={() => void load()}>
          Refresh
        </button>
        {selected ? (
          <>
            <button type="button" onClick={() => void exportFile(selected.id)}>
              Export .md
            </button>
            <button type="button" className="danger" onClick={() => void remove(selected.id)}>
              Delete
            </button>
            <button type="button" onClick={() => setSelected(null)}>
              Close
            </button>
          </>
        ) : null}
      </div>

      {error ? <div className="error-text">{error}</div> : null}

      {sessions.length === 0 ? (
        <div className="card">
          <h2>History</h2>
          <p style={{ color: 'var(--muted)', margin: 0 }}>No saved sessions yet.</p>
        </div>
      ) : (
        <div className="list">
          {sessions.map((session) => (
            <div className="list-item" key={session.id}>
              <div className="grow">
                <h3>{session.title || 'Untitled session'}</h3>
                <div className="meta">
                  {formatDateTime(session.createdAt)} · {formatDuration(session.durationMs)} ·{' '}
                  {session.mode} · {session.segmentCount} lines · {session.answerCount} answers
                </div>
              </div>
              <button type="button" onClick={() => void open(session.id)}>
                Open
              </button>
            </div>
          ))}
        </div>
      )}

      {selected ? (
        <>
          <section className="card">
            <h2>Transcript</h2>
            <div className="transcript">
              {selected.segments.length === 0 ? (
                <p style={{ color: 'var(--muted)', margin: 0 }}>No transcript captured.</p>
              ) : (
                selected.segments.map((segment) => (
                  <div className={`segment ${segment.speaker}`} key={segment.id}>
                    <span className="who">{segment.speaker === 'you' ? 'You' : 'Them'}</span>
                    <p>{segment.text}</p>
                  </div>
                ))
              )}
            </div>
          </section>
          <section className="card">
            <h2>Answers</h2>
            <div className="stack">
              {selected.answers.length === 0 ? (
                <p style={{ color: 'var(--muted)', margin: 0 }}>No answers generated.</p>
              ) : (
                selected.answers.map((answer) => (
                  <div key={answer.id}>
                    <div className="badge">{answer.model}</div>
                    {answer.question ? (
                      <p style={{ color: 'var(--muted)', margin: '8px 0 6px' }}>{answer.question}</p>
                    ) : null}
                    <div className="answer-box">{answer.text}</div>
                  </div>
                ))
              )}
            </div>
          </section>
        </>
      ) : null}
    </div>
  )
}

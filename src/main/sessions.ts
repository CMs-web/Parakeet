import { app } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import type {
  AnswerRecord,
  SessionBilling,
  SessionBrief,
  SessionRecord,
  SessionSummary,
  TranscriptSegment
} from '../shared/types'

const activeSessions = new Map<string, SessionRecord>()

function sessionsDir(): string {
  return path.join(app.getPath('userData'), 'sessions')
}

function sessionPath(id: string): string {
  return path.join(sessionsDir(), `${id}.json`)
}

async function persist(record: SessionRecord): Promise<void> {
  await fs.mkdir(sessionsDir(), { recursive: true })
  await fs.writeFile(sessionPath(record.id), JSON.stringify(record, null, 2), 'utf8')
}

export async function startSession(
  brief: SessionBrief,
  billing: SessionBilling,
  id: string = randomUUID()
): Promise<SessionRecord> {
  const record: SessionRecord = {
    ...brief,
    id,
    createdAt: Date.now(),
    endedAt: null,
    durationMs: 0,
    segments: [],
    answers: [],
    billing
  }
  activeSessions.set(record.id, record)
  await persist(record)
  return record
}

export function getActive(id: string): SessionRecord | null {
  return activeSessions.get(id) ?? null
}

export function getActiveAny(): SessionRecord | null {
  return [...activeSessions.values()].find((s) => s.endedAt === null) ?? null
}

export async function appendSegment(
  id: string,
  segment: TranscriptSegment
): Promise<TranscriptSegment | null> {
  const record = activeSessions.get(id) ?? (await getSession(id))
  if (!record) return null
  if (!activeSessions.has(record.id)) activeSessions.set(record.id, record)
  const existing = record.segments.findIndex((s) => s.id === segment.id)
  if (existing >= 0) record.segments[existing] = segment
  else record.segments.push(segment)
  record.endedAt = null
  await persist(record)
  return segment
}

export async function addAnswer(id: string, answer: AnswerRecord): Promise<void> {
  const record = activeSessions.get(id) ?? (await getSession(id))
  if (!record) return
  if (!activeSessions.has(record.id)) activeSessions.set(record.id, record)
  const index = record.answers.findIndex((a) => a.id === answer.id)
  if (index >= 0) record.answers[index] = answer
  else record.answers.push(answer)
  await persist(record)
}

/** feedback.rateResponse equivalent. */
export async function rateAnswer(
  sessionId: string,
  answerId: string,
  rating: 'up' | 'down' | null
): Promise<void> {
  const record = activeSessions.get(sessionId) ?? (await getSession(sessionId))
  if (!record) return
  const answer = record.answers.find((candidate) => candidate.id === answerId)
  if (!answer) return
  answer.rating = rating
  if (!activeSessions.has(record.id)) activeSessions.set(record.id, record)
  await persist(record)
}

export async function recordExtend(id: string, minutes: number): Promise<SessionRecord | null> {
  const record = activeSessions.get(id) ?? (await getSession(id))
  if (!record) return null
  record.billing.extensions += 1
  record.billing.extendedMinutes += minutes
  record.billing.creditsCharged = Number((record.billing.creditsCharged + 0.5).toFixed(2))
  if (!activeSessions.has(record.id)) activeSessions.set(record.id, record)
  await persist(record)
  return record
}

export async function endSession(id: string, refunded = false): Promise<SessionRecord | null> {
  const record = activeSessions.get(id) ?? (await getSession(id))
  if (!record) return null
  record.endedAt = Date.now()
  record.durationMs = record.endedAt - record.createdAt
  record.billing.refunded = refunded
  activeSessions.delete(record.id)
  await persist(record)
  return record
}

export async function getSession(id: string): Promise<SessionRecord | null> {
  try {
    return JSON.parse(await fs.readFile(sessionPath(id), 'utf8')) as SessionRecord
  } catch {
    return null
  }
}

export async function listSessions(): Promise<SessionSummary[]> {
  await fs.mkdir(sessionsDir(), { recursive: true })
  const entries = await fs.readdir(sessionsDir())
  const sessions: SessionSummary[] = []
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue
    try {
      const record = JSON.parse(
        await fs.readFile(path.join(sessionsDir(), entry), 'utf8')
      ) as SessionRecord
      sessions.push({
        id: record.id,
        createdAt: record.createdAt,
        endedAt: record.endedAt,
        durationMs: record.durationMs,
        mode: record.mode,
        title: record.title,
        companyDomain: record.companyDomain,
        segmentCount: record.segments.length,
        answerCount: record.answers.length,
        freeSession: record.billing?.freeSession ?? false,
        isMock: record.isMock
      })
    } catch {
      continue
    }
  }
  return sessions.sort((a, b) => b.createdAt - a.createdAt)
}

export async function deleteSession(id: string): Promise<void> {
  activeSessions.delete(id)
  await fs.rm(sessionPath(id), { force: true })
}

export async function exportSession(
  id: string
): Promise<{ markdown: string; record: SessionRecord | null }> {
  const record = (await getSession(id)) ?? activeSessions.get(id) ?? null
  if (!record) return { markdown: '', record: null }
  const lines: string[] = []
  lines.push(`# ${record.title || 'Untitled session'}`)
  if (record.companyDomain) lines.push(`Company: ${record.companyDomain}`)
  lines.push(`Mode: ${record.mode === 'interview' ? 'Interview' : 'Regular call'}`)
  lines.push(`AI model: ${record.aiModel}`)
  lines.push(`Started: ${new Date(record.createdAt).toISOString()}`)
  if (record.endedAt) lines.push(`Ended: ${new Date(record.endedAt).toISOString()}`)
  lines.push('', '## Transcript', '')
  for (const segment of record.segments) {
    lines.push(`**${segment.speaker === 'you' ? 'You' : 'Them'}:** ${segment.text}`)
  }
  lines.push('', '## Answers', '')
  for (const answer of record.answers) {
    lines.push(`**Q:** ${answer.question}`, '', answer.text, '')
  }
  return { markdown: lines.join('\n'), record }
}

import { app } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import type { DeepLinkAuth } from '../shared/types'

/**
 * `parakeetai://auth?payload=<base64 json>` where the JSON carries
 * `{ callSessionId, authToken }`, plus `parakeetai://callSession/<id>`.
 * Matches the shipped protocol handler (docs/reverse-engineering.md §3).
 */

export const PROTOCOL = 'parakeetai'

export type DeepLink =
  | { kind: 'auth'; auth: DeepLinkAuth }
  | { kind: 'callSession'; callSessionId: string }
  | { kind: 'unknown'; url: string }

function decodePayload(payload: string): unknown | null {
  const attempts: string[] = []
  try {
    attempts.push(decodeURIComponent(payload))
  } catch {
    attempts.push(payload)
  }
  for (const candidate of attempts) {
    if (candidate.trim().startsWith('{')) {
      try {
        return JSON.parse(candidate)
      } catch {
        continue
      }
    }
    const normalized = candidate.replace(/-/g, '+').replace(/_/g, '/')
    try {
      return JSON.parse(Buffer.from(normalized, 'base64').toString('utf8'))
    } catch {
      continue
    }
  }
  return null
}

export function parseDeepLink(rawUrl: string): DeepLink {
  try {
    const url = new URL(rawUrl)
    if (url.protocol.replace(':', '') !== PROTOCOL) return { kind: 'unknown', url: rawUrl }
    const host = url.hostname
    if (host === 'callSession') {
      const id = url.pathname.replace(/^\/+/, '')
      if (id) return { kind: 'callSession', callSessionId: id }
      return { kind: 'unknown', url: rawUrl }
    }
    if (host === 'auth') {
      const payload = url.searchParams.get('payload')
      if (!payload) return { kind: 'unknown', url: rawUrl }
      const decoded = decodePayload(payload)
      if (decoded && typeof decoded === 'object') {
        const record = decoded as Record<string, unknown>
        const authToken = typeof record.authToken === 'string' ? record.authToken : ''
        const callSessionId = typeof record.callSessionId === 'string' ? record.callSessionId : null
        if (authToken) {
          return { kind: 'auth', auth: { callSessionId, authToken, receivedAt: Date.now() } }
        }
      }
    }
  } catch {
    // fall through
  }
  return { kind: 'unknown', url: rawUrl }
}

let cachedAuth: DeepLinkAuth | null = null

function authPath(): string {
  return path.join(app.getPath('userData'), 'auth.json')
}

export async function loadAuth(): Promise<DeepLinkAuth | null> {
  if (cachedAuth) return cachedAuth
  try {
    cachedAuth = JSON.parse(await fs.readFile(authPath(), 'utf8')) as DeepLinkAuth
  } catch {
    cachedAuth = null
  }
  return cachedAuth
}

export async function saveAuth(auth: DeepLinkAuth): Promise<void> {
  cachedAuth = auth
  await fs.mkdir(path.dirname(authPath()), { recursive: true })
  await fs.writeFile(authPath(), JSON.stringify(auth, null, 2), 'utf8')
}

export function registerProtocol(): void {
  app.setAsDefaultProtocolClient(PROTOCOL)
}

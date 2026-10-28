import { execFile } from 'child_process'
import { MEETING_APPS, type MeetingApp } from '../shared/limits'
import type { MeetingDetection } from '../shared/types'

/**
 * Process + window-title meeting detector, mirroring the shipped app's
 * reduceMeetingDetection flow (docs/reverse-engineering.md §7).
 *
 * The real build gets this from the Rust addon and mic-monitor-worker; the clone
 * samples the OS process list instead. Detection is best-effort and never
 * implies a meeting actually has audio flowing.
 */

interface Snapshot {
  processName: string
  title: string
}

const POLL_MS = 10_000

let timer: NodeJS.Timeout | null = null
let current: MeetingDetection = { app: null, since: null, title: null }
let busy = false
let listeners: Array<(detection: MeetingDetection, change: 'started' | 'ended' | null) => void> = []

function normalizeProcess(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name
  return base.trim().toLowerCase()
}

function readSnapshot(): Promise<Snapshot[]> {
  if (process.platform === 'win32') {
    const script =
      'Get-Process | Where-Object { $_.MainWindowTitle } | ForEach-Object { $_.ProcessName + "|" + $_.MainWindowTitle }'
    return new Promise((resolve, reject) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', script],
        { windowsHide: true, timeout: 8000, maxBuffer: 1024 * 1024 },
        (error, stdout) => {
          if (error) {
            reject(error)
            return
          }
          resolve(
            stdout
              .split(/\r?\n/)
              .map((line) => line.trim())
              .filter(Boolean)
              .map((line) => {
                const [processName, ...rest] = line.split('|')
                return { processName, title: rest.join('|') }
              })
          )
        }
      )
    })
  }
  return new Promise((resolve, reject) => {
    execFile('ps', ['-Ao', 'comm='], { timeout: 8000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error) {
        reject(error)
        return
      }
      resolve(
        stdout
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((processName) => ({ processName, title: '' }))
      )
    })
  })
}

function matchesTitle(app: MeetingApp, titles: string[]): string | null {
  if (!app.titlePatterns) return null
  for (const title of titles) {
    if (app.titlePatterns.some((pattern) => pattern.test(title))) return title
  }
  return null
}

export function detectFromSnapshot(snapshot: Snapshot[]): MeetingDetection {
  const titles = snapshot.map((entry) => entry.title).filter(Boolean)
  const processes = new Set(snapshot.map((entry) => normalizeProcess(entry.processName)))

  // Web service titles are the most specific signal, so they win.
  for (const app of MEETING_APPS) {
    if (!app.webOnly) continue
    const title = matchesTitle(app, titles)
    if (title) return { app, since: current.app?.slug === app.slug ? current.since : Date.now(), title }
  }

  for (const app of MEETING_APPS) {
    if (app.webOnly) continue
    const running = app.processNames.some((name) => processes.has(normalizeProcess(name)))
    if (!running) continue
    const title = matchesTitle(app, titles)
    if (app.isBrowser && !title) continue
    if (title) return { app, since: current.app?.slug === app.slug ? current.since : Date.now(), title }
    // Native client with no matching title still counts (Zoom/Teams main window).
    if (!app.isBrowser) return { app, since: current.app?.slug === app.slug ? current.since : Date.now(), title: null }
  }

  return { app: null, since: null, title: null }
}

async function tick(): Promise<void> {
  if (busy) return
  busy = true
  try {
    const snapshot = await readSnapshot()
    const next = detectFromSnapshot(snapshot)
    const previous = current.app
    current = next
    const change = previous?.slug === next.app?.slug ? null : next.app ? 'started' : previous ? 'ended' : null
    if (change) for (const listener of listeners) listener(next, change)
  } catch {
    // Detector failures are non-fatal, same as "Meeting detector error" in the app.
  } finally {
    busy = false
  }
}

export function getMeetingDetection(): MeetingDetection {
  return current
}

export function onMeetingChange(
  listener: (detection: MeetingDetection, change: 'started' | 'ended' | null) => void
): () => void {
  listeners.push(listener)
  return () => {
    listeners = listeners.filter((candidate) => candidate !== listener)
  }
}

export function startMeetingDetector(): void {
  if (timer) return
  void tick()
  timer = setInterval(() => void tick(), POLL_MS)
}

export function stopMeetingDetector(): void {
  if (!timer) return
  clearInterval(timer)
  timer = null
  current = { app: null, since: null, title: null }
}

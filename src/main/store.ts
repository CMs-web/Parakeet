import 'dotenv/config'
import { app } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import { DEFAULT_SETTINGS, type Settings } from '../shared/types'

let cache: Settings | null = null

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function merge<T>(base: T, patch: unknown): T {
  if (!isRecord(base) || !isRecord(patch)) {
    return (patch === undefined ? base : (patch as T))
  }
  const out: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    const current = (base as Record<string, unknown>)[key]
    out[key] = isRecord(current) && isRecord(value) ? merge(current, value) : value
  }
  return out as T
}

export async function loadSettings(): Promise<Settings> {
  if (cache) return cache
  try {
    const raw = await fs.readFile(settingsPath(), 'utf8')
    cache = merge(DEFAULT_SETTINGS, JSON.parse(raw))
  } catch {
    cache = structuredClone(DEFAULT_SETTINGS)
  }
  if (!cache.stt.sarvamKey && process.env.SARVAM_API_KEY) {
    cache.stt.sarvamKey = process.env.SARVAM_API_KEY
  }
  if (cache.stt.provider === 'sarvam' && cache.stt.language === 'en') {
    cache.stt.language = 'en-IN'
  }
  if (cache.llm.provider === 'sarvam' && !cache.llm.apiKey && process.env.SARVAM_API_KEY) {
    cache.llm.apiKey = process.env.SARVAM_API_KEY
  }
  if (cache.llm.model.startsWith('sarvam-')) {
    cache.llm.provider = 'sarvam'
    if (!cache.llm.apiKey && process.env.SARVAM_API_KEY) {
      cache.llm.apiKey = process.env.SARVAM_API_KEY
    }
  }
  return cache
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await loadSettings()
  cache = merge(current, patch)
  await fs.mkdir(path.dirname(settingsPath()), { recursive: true })
  await fs.writeFile(settingsPath(), JSON.stringify(cache, null, 2), 'utf8')
  return cache
}

export async function resetSettings(): Promise<Settings> {
  cache = structuredClone(DEFAULT_SETTINGS)
  await fs.writeFile(settingsPath(), JSON.stringify(cache, null, 2), 'utf8')
  return cache
}

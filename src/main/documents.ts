import { app, BrowserWindow, dialog } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import type { DocumentRecord, SessionBrief } from '../shared/types'

/**
 * Local stand-in for `callDocument.getMany` + `resume.getMany`.
 * The shipped app stores documents server-side; here they are JSON in userData.
 */

const MAX_DOCUMENT_CHARS = 40_000
const MAX_PROMPT_CHARS = 120_000
const TEXT_EXTENSIONS = ['txt', 'md', 'markdown', 'json', 'csv']

let cache: DocumentRecord[] | null = null

function documentsPath(): string {
  return path.join(app.getPath('userData'), 'documents.json')
}

async function persist(): Promise<void> {
  if (!cache) return
  await fs.mkdir(path.dirname(documentsPath()), { recursive: true })
  await fs.writeFile(documentsPath(), JSON.stringify(cache, null, 2), 'utf8')
}

async function load(): Promise<DocumentRecord[]> {
  if (cache) return cache
  try {
    const parsed = JSON.parse(await fs.readFile(documentsPath(), 'utf8'))
    cache = Array.isArray(parsed) ? (parsed as DocumentRecord[]) : []
  } catch {
    cache = []
  }
  return cache
}

export async function listDocuments(): Promise<DocumentRecord[]> {
  return [...(await load())].sort((a, b) => b.createdAt - a.createdAt)
}

export async function addDocument(input: {
  kind: DocumentRecord['kind']
  name: string
  text: string
}): Promise<DocumentRecord> {
  const docs = await load()
  const record: DocumentRecord = {
    id: randomUUID(),
    kind: input.kind,
    name: input.name.trim() || 'Untitled',
    text: input.text.slice(0, MAX_DOCUMENT_CHARS),
    createdAt: Date.now()
  }
  docs.unshift(record)
  await persist()
  return record
}

export async function addDocumentFromFile(
  window: BrowserWindow | null,
  kind: DocumentRecord['kind']
): Promise<DocumentRecord | null> {
  const options: Electron.OpenDialogOptions = {
    title: kind === 'resume' ? 'Add CV / Resume' : 'Add document',
    properties: ['openFile'],
    filters: [
      { name: 'Text documents', extensions: TEXT_EXTENSIONS },
      { name: 'All files', extensions: ['*'] }
    ]
  }
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) return null
  const filePath = result.filePaths[0]
  const ext = path.extname(filePath).slice(1).toLowerCase()
  if (!TEXT_EXTENSIONS.includes(ext)) {
    throw new Error(`Unsupported file type .${ext}. Add text, markdown, JSON or CSV.`)
  }
  const text = await fs.readFile(filePath, 'utf8')
  return addDocument({ kind, name: path.basename(filePath), text })
}

export async function removeDocument(id: string): Promise<void> {
  const docs = await load()
  cache = docs.filter((doc) => doc.id !== id)
  await persist()
}

/** Selection mirrors draft.documentSelectionMode / selectedDocumentIds. */
export async function resolveSessionDocuments(
  brief: SessionBrief
): Promise<Array<{ name: string; text: string }>> {
  const docs = await load()
  const selected = new Set(brief.selectedDocumentIds)
  const picked: DocumentRecord[] = []

  if (brief.mode === 'interview' && brief.resumeId) {
    const resume = docs.find((doc) => doc.id === brief.resumeId)
    if (resume) picked.push(resume)
  }

  if (brief.documentSelectionMode === 'all') {
    for (const doc of docs) {
      if (doc.kind === 'resume' && brief.mode === 'interview') continue
      picked.push(doc)
    }
  } else if (brief.documentSelectionMode === 'custom') {
    for (const doc of docs) {
      if (!selected.has(doc.id)) continue
      if (picked.some((existing) => existing.id === doc.id)) continue
      picked.push(doc)
    }
  }

  const out: Array<{ name: string; text: string }> = []
  let budget = MAX_PROMPT_CHARS
  for (const doc of picked) {
    if (budget <= 0) break
    const text = doc.text.slice(0, Math.min(MAX_DOCUMENT_CHARS, budget))
    budget -= text.length
    out.push({ name: doc.name, text })
  }
  return out
}

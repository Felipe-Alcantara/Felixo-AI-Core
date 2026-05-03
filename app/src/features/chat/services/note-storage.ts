import type { ChatMessage, Model, ProjectNote } from '../types'

const NOTES_STORAGE_KEY = 'felixo-ai-core.notes'
const NOTES_BACKEND_MIGRATION_KEY = 'felixo-ai-core.notes.sqlite-migrated'

export function loadNotes(): ProjectNote[] {
  try {
    const rawNotes = window.localStorage.getItem(NOTES_STORAGE_KEY)

    if (!rawNotes) {
      return []
    }

    const parsedNotes = JSON.parse(rawNotes)

    if (!Array.isArray(parsedNotes)) {
      return []
    }

    return parsedNotes.flatMap((value) => {
      const note = normalizeNote(value)
      return note ? [note] : []
    })
  } catch {
    return []
  }
}

export function saveNotes(notes: ProjectNote[]) {
  window.localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes))
}

export async function loadNotesFromBackend(): Promise<ProjectNote[] | null> {
  if (!window.felixo?.notes?.list) {
    return null
  }

  try {
    const result = await window.felixo.notes.list()

    if (!result.ok || !Array.isArray(result.notes)) {
      return null
    }

    return result.notes.flatMap((value) => {
      const note = normalizeNote(value)
      return note ? [note] : []
    })
  } catch {
    return null
  }
}

export async function saveNoteToBackend(note: ProjectNote): Promise<boolean> {
  if (!window.felixo?.notes?.save) {
    return false
  }

  const normalizedNote = normalizeNote(note)

  if (!normalizedNote) {
    return false
  }

  try {
    const result = await window.felixo.notes.save(normalizedNote)
    return result.ok
  } catch {
    return false
  }
}

export async function saveNotesToBackend(notes: ProjectNote[]): Promise<boolean> {
  if (!window.felixo?.notes?.save) {
    return false
  }

  const results = await Promise.all(notes.map((note) => saveNoteToBackend(note)))
  return results.every(Boolean)
}

export async function deleteNoteFromBackend(noteId: string): Promise<boolean> {
  if (!window.felixo?.notes?.delete) {
    return false
  }

  try {
    const result = await window.felixo.notes.delete(noteId)
    return result.ok
  } catch {
    return false
  }
}

export function hasNotesBackendMigrationRun() {
  try {
    return window.localStorage.getItem(NOTES_BACKEND_MIGRATION_KEY) === '1'
  } catch {
    return false
  }
}

export function markNotesBackendMigrationRun() {
  try {
    window.localStorage.setItem(NOTES_BACKEND_MIGRATION_KEY, '1')
  } catch {
    // localStorage can be unavailable in non-browser test environments.
  }
}

export function createEmptyNote(): ProjectNote {
  const now = new Date().toISOString()

  return {
    id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    title: 'Nova nota',
    content: '',
    projectIds: [],
    createdAt: now,
    updatedAt: now,
  }
}

export function createNoteFromMessages(
  messages: ChatMessage[],
  models: Model[],
): ProjectNote {
  const now = new Date().toISOString()
  const meaningfulMessages = messages.filter((message) => message.content.trim())
  const firstUserMessage = meaningfulMessages.find(
    (message) => message.role === 'user',
  )
  const title = firstUserMessage
    ? firstUserMessage.content.slice(0, 70)
    : `Conversa ${new Date().toLocaleDateString('pt-BR')}`

  return {
    id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    title,
    content: meaningfulMessages.map((message) => formatMessage(message, models)).join('\n\n'),
    projectIds: [],
    createdAt: now,
    updatedAt: now,
  }
}

function formatMessage(message: ChatMessage, models: Model[]) {
  const role = message.role === 'user' ? 'Usuario' : 'Assistente'
  const model = message.model
    ? models.find((item) => item.id === message.model)?.name ?? message.model
    : null
  const header = model ? `${role} (${model})` : role

  return `## ${header}\n\n${message.content.trim()}`
}

function normalizeNote(value: unknown): ProjectNote | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const note = value as Record<string, unknown>

  if (
    typeof note.id !== 'string' ||
    typeof note.title !== 'string' ||
    typeof note.content !== 'string' ||
    typeof note.createdAt !== 'string' ||
    typeof note.updatedAt !== 'string'
  ) {
    return null
  }

  return {
    id: note.id,
    title: note.title,
    content: note.content,
    projectIds: Array.isArray(note.projectIds)
      ? note.projectIds.filter((item): item is string => typeof item === 'string')
      : [],
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  }
}

import type { ChatMessage, Model, ProjectNote } from '../types'

const NOTES_STORAGE_KEY = 'felixo-ai-core.notes'

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

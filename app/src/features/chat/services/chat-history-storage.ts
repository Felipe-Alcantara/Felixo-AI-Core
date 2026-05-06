import type { ChatMessage, ChatSession, ContextAttachment } from '../types'

export async function loadChatSessionsFromBackend(): Promise<ChatSession[] | null> {
  if (!window.felixo?.chats?.list) {
    return null
  }

  try {
    const result = await window.felixo.chats.list({ limit: 100 })

    if (!result.ok || !Array.isArray(result.sessions)) {
      return null
    }

    return normalizeChatSessions(result.sessions)
  } catch {
    return null
  }
}

export async function saveChatSessionToBackend(
  session: ChatSession,
): Promise<ChatSession | null> {
  if (!window.felixo?.chats?.save) {
    return null
  }

  try {
    const result = await window.felixo.chats.save(session)

    if (!result.ok || !result.session) {
      return null
    }

    return normalizeChatSession(result.session)
  } catch {
    return null
  }
}

export async function deleteChatSessionFromBackend(chatId: string): Promise<boolean> {
  if (!window.felixo?.chats?.delete) {
    return false
  }

  try {
    const result = await window.felixo.chats.delete(chatId)
    return result.ok && result.deleted === true
  } catch {
    return false
  }
}

export function createChatSessionFromMessages(
  id: string,
  messages: ChatMessage[],
  existingSession?: ChatSession | null,
): ChatSession | null {
  const meaningfulMessages = messages
    .filter((message) => message.content.trim())
    .map((message) => {
      const normalizedMessage = {
        ...message,
        isStreaming: false,
      }

      delete normalizedMessage.streamItemId

      return normalizedMessage
    })

  if (meaningfulMessages.length === 0) {
    return null
  }

  const now = new Date().toISOString()

  return {
    id,
    title: createChatTitle(meaningfulMessages),
    messages: meaningfulMessages,
    createdAt: existingSession?.createdAt ?? now,
    updatedAt: now,
  }
}

export function createChatSessionId() {
  return crypto.randomUUID?.() ?? `${Date.now()}`
}

function normalizeChatSessions(rawSessions: unknown[]): ChatSession[] {
  return rawSessions.flatMap((session) => {
    const normalizedSession = normalizeChatSession(session)
    return normalizedSession ? [normalizedSession] : []
  })
}

function normalizeChatSession(session: unknown): ChatSession | null {
  if (!session || typeof session !== 'object') {
    return null
  }

  const rawSession = session as Record<string, unknown>
  const id = normalizeString(rawSession.id)
  const title = normalizeString(rawSession.title)
  const createdAt = normalizeString(rawSession.createdAt)
  const updatedAt = normalizeString(rawSession.updatedAt)
  const rawMessages = Array.isArray(rawSession.messages)
    ? rawSession.messages
    : []

  if (!id || !title || !createdAt || !updatedAt) {
    return null
  }

  return {
    id,
    title,
    messages: normalizeChatMessages(rawMessages),
    createdAt,
    updatedAt,
  }
}

function normalizeChatMessages(rawMessages: unknown[]): ChatMessage[] {
  return rawMessages.flatMap((message) => {
    const normalizedMessage = normalizeChatMessage(message)
    return normalizedMessage ? [normalizedMessage] : []
  })
}

function normalizeChatMessage(message: unknown): ChatMessage | null {
  if (!message || typeof message !== 'object') {
    return null
  }

  const rawMessage = message as Record<string, unknown>
  const id = typeof rawMessage.id === 'number' && Number.isFinite(rawMessage.id)
    ? rawMessage.id
    : Date.now()
  const role = rawMessage.role === 'assistant' ? 'assistant' : 'user'
  const content = normalizeString(rawMessage.content)
  const createdAt = normalizeString(rawMessage.createdAt)

  if (!createdAt) {
    return null
  }

  const attachments = normalizeContextAttachments(rawMessage.attachments)
  const normalizedMessage: ChatMessage = {
    id,
    role,
    content,
    model: normalizeString(rawMessage.model) || undefined,
    sessionId: normalizeString(rawMessage.sessionId) || undefined,
    isStreaming: false,
    createdAt,
  }

  if (attachments.length > 0) {
    normalizedMessage.attachments = attachments
  }

  return normalizedMessage
}

function createChatTitle(messages: ChatMessage[]) {
  const firstUser = messages.find((message) => message.role === 'user')
  const titleSource = firstUser?.content ?? messages[0]?.content ?? 'Chat sem titulo'
  const title = titleSource.trim().replace(/\s+/g, ' ')

  return title.slice(0, 60) + (title.length > 60 ? '...' : '')
}

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function normalizeContextAttachments(value: unknown): ContextAttachment[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((attachment) => {
    const normalizedAttachment = normalizeContextAttachment(attachment)
    return normalizedAttachment ? [normalizedAttachment] : []
  })
}

function normalizeContextAttachment(value: unknown): ContextAttachment | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const rawAttachment = value as Record<string, unknown>
  const id = normalizeString(rawAttachment.id) || createChatSessionId()
  const name = normalizeString(rawAttachment.name)
  const type = normalizeString(rawAttachment.type) || 'application/octet-stream'
  const size =
    typeof rawAttachment.size === 'number' && Number.isFinite(rawAttachment.size)
      ? Math.max(0, rawAttachment.size)
      : 0

  if (!name) {
    return null
  }

  const attachment: ContextAttachment = {
    id,
    name,
    type,
    size,
  }
  const path = normalizeString(rawAttachment.path)
  const previewUrl = normalizePreviewUrl(rawAttachment.previewUrl)
  const contentPreview = normalizeString(rawAttachment.contentPreview)

  if (path) {
    attachment.path = path
  }

  if (previewUrl) {
    attachment.previewUrl = previewUrl
  }

  if (contentPreview) {
    attachment.contentPreview = contentPreview
  }

  return attachment
}

function normalizePreviewUrl(value: unknown) {
  const previewUrl = normalizeString(value)

  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(previewUrl) ||
    previewUrl.startsWith('blob:')
    ? previewUrl
    : ''
}

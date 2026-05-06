import type { ChatMessage, ContextAttachment, Model } from '../types'

export const initialMessages: ChatMessage[] = []

export function formatTime() {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date())
}

export function createUserMessage(
  content: string,
  attachments: ContextAttachment[] = [],
): ChatMessage {
  const message: ChatMessage = {
    id: Date.now(),
    role: 'user',
    content,
    createdAt: formatTime(),
  }

  if (attachments.length > 0) {
    message.attachments = attachments.map((attachment) => ({ ...attachment }))
  }

  return message
}

export function createAssistantMessage(
  model: Model | null,
  sessionId: string,
): ChatMessage {
  return {
    id: Date.now() + 1,
    role: 'assistant',
    content: '',
    model: model?.id,
    sessionId,
    isStreaming: true,
    createdAt: formatTime(),
  }
}

import type { ChatMessage, Model } from '../types'

export const initialMessages: ChatMessage[] = []

export function formatTime() {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date())
}

export function createUserMessage(content: string): ChatMessage {
  return {
    id: Date.now(),
    role: 'user',
    content,
    createdAt: formatTime(),
  }
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

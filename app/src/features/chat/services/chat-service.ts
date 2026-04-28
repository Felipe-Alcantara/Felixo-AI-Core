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
  prompt: string,
  model: Model | null,
): ChatMessage {
  return {
    id: Date.now() + 1,
    role: 'assistant',
    content: createLocalReply(prompt, model),
    model: model?.id,
    createdAt: formatTime(),
  }
}

function createLocalReply(prompt: string, model: Model | null) {
  const idea = compactIdea(prompt)
  const modelName = model?.name ?? 'Felixo Core'

  return [
    `${modelName}: "${idea}"`,
    '',
    'Objetivo',
    'Encontrar a menor versão que já possa ser testada.',
    '',
    'Começo',
    'Descrever uma tela, uma ação principal e o resultado esperado.',
    '',
    'Pergunta',
    'O que precisa existir hoje para essa ideia sair do abstrato?',
  ].join('\n')
}

function compactIdea(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > 72 ? `${normalized.slice(0, 72)}...` : normalized
}

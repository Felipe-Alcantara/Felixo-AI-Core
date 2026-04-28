import type { Agent, ChatMessage } from '../types'

export const initialMessages: ChatMessage[] = [
  {
    id: 1,
    role: 'assistant',
    content:
      'Me dá a ideia crua. Eu devolvo uma primeira forma para ela começar a existir.',
    agent: 'codex',
    createdAt: 'agora',
  },
]

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

export function createAssistantMessage(prompt: string, agent: Agent): ChatMessage {
  return {
    id: Date.now() + 1,
    role: 'assistant',
    content: createLocalReply(prompt, agent),
    agent: agent.id,
    createdAt: formatTime(),
  }
}

function createLocalReply(prompt: string, agent: Agent) {
  const idea = compactIdea(prompt)

  return [
    `${agent.name}: "${idea}"`,
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

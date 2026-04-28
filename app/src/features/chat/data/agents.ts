import type { Agent } from '../types'

export const agents: Agent[] = [
  {
    id: 'codex',
    name: 'Codex',
    command: './ai-clis/codex.sh',
    tone: 'execução',
    accentClass: 'bg-violet-300 text-violet-950',
  },
  {
    id: 'claude',
    name: 'Claude',
    command: './ai-clis/claude.sh',
    tone: 'revisão',
    accentClass: 'bg-amber-200 text-amber-950',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    command: './ai-clis/gemini.sh',
    tone: 'variações',
    accentClass: 'bg-sky-200 text-sky-950',
  },
  {
    id: 'openclaude',
    name: 'OpenClaude',
    command: './ai-clis/openclaude-claude.sh',
    tone: 'ponte',
    accentClass: 'bg-emerald-200 text-emerald-950',
  },
]

export const ideaStarters = [
  'Código',
  'Aprender',
  'Estratégias',
  'Escrever',
  'Assuntos pessoais',
]

export const quickPrompts = [
  'Criar um plano para conectar as CLIs ao app',
  'Organizar as próximas tarefas do Felixo AI Core',
  'Revisar a estrutura contra os padrões Felixo',
  'Transformar uma ideia solta em MVP',
]

export const recentItems = [
  'Exemplo de conversa 1',
  'Exemplo de conversa 2',
  'Exemplo de conversa 3',
  'Exemplo de conversa 4',
  'Exemplo de conversa 5',
  'Exemplo de conversa 6',
  'Exemplo de conversa 7',
  'Exemplo de conversa 8',
  'Exemplo de conversa 9',
  'Exemplo de conversa 10',
  'Exemplo de conversa 11',
  'Exemplo de conversa 12',
]

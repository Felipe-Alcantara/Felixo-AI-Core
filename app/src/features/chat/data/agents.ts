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
  'MVP pequeno para:',
  'Tarefas iniciais:',
  'Primeiro experimento:',
  'Roadmap simples:',
]

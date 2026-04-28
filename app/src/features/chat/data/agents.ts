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
  'Lançamento do Codex pro no Linux Mint',
  'Estrutura para relatório de hoje',
  'Pagamento de dívida não libera acesso',
  'Dúvida sobre ingressos de shows',
  'Organização do relatório de hoje',
  'Análise de atividade profissional',
  'Horário da prova de dependência',
  'Opus em contextos de baixo custo',
  'Transformar conteúdo em relatório',
  'Explicação incompleta',
  'GitHub Desktop no Linux Mint',
  'Excessive usage concern',
]

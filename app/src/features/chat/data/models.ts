import type { Model } from '../types'

export const initialModels: Model[] = [
  {
    id: 'codex-cli',
    name: 'Codex CLI',
    command: 'codex',
    source: 'CLI instalada no sistema',
    cliType: 'codex',
    reasoningEffort: 'medium',
  },
  {
    id: 'claude-code-cli',
    name: 'Claude Code CLI',
    command: 'claude',
    source: 'CLI instalada no sistema',
    cliType: 'claude',
  },
  {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    command: 'gemini',
    source: 'CLI instalada no sistema',
    cliType: 'gemini',
  },
  {
    id: 'codex-app-server-cli',
    name: 'Codex App Server',
    command: 'codex app-server',
    source: 'CLI instalada no sistema',
    cliType: 'codex-app-server',
    reasoningEffort: 'medium',
  },
  {
    id: 'gemini-acp-cli',
    name: 'Gemini ACP',
    command: 'gemini --experimental-acp',
    source: 'CLI instalada no sistema',
    cliType: 'gemini-acp',
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

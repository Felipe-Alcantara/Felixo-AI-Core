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
  'Planejar',
  'Analisar',
  'Explicar',
  'Revisar',
]

/**
 * Sugestões da tela inicial: título curto + o que a ação entrega.
 *
 * Continuam sendo só texto inserido no composer — nenhuma função nova por
 * trás. O `prompt` é o que vai para a conversa; título e descrição existem
 * para a pessoa escolher sem precisar ler a frase inteira.
 */
export type ChatSuggestion = {
  id: string
  title: string
  description: string
  prompt: string
}

export const chatSuggestions: ChatSuggestion[] = [
  {
    id: 'plano',
    title: 'Criar um plano de implementação',
    description: 'Transforme uma ideia em tarefas claras',
    prompt: 'Crie um plano de implementação, quebrando a ideia em tarefas claras.',
  },
  {
    id: 'analisar',
    title: 'Analisar meu código',
    description: 'Identifique melhorias e possíveis problemas',
    prompt: 'Analise o código do projeto e aponte melhorias e possíveis problemas.',
  },
  {
    id: 'organizar',
    title: 'Organizar próximas tarefas',
    description: 'Estruture o que vem pela frente',
    prompt: 'Organize as próximas tarefas do projeto, na ordem em que fazem sentido.',
  },
  {
    id: 'explicar',
    title: 'Explicar um conceito',
    description: 'Receba uma explicação clara e objetiva',
    prompt: 'Explique este conceito de forma clara e objetiva.',
  },
]

/** Mantido: outras telas ainda leem a lista simples de prompts. */
export const quickPrompts = chatSuggestions.map((suggestion) => suggestion.prompt)

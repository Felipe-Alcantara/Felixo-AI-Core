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

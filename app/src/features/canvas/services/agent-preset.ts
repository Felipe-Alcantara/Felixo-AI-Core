import {
  getAgent,
  isEffortValidForModel,
  supportsFastMode,
  type AgentId,
} from './agent-launch-options'
import { readFrameColor } from '../components/frame-colors'
import type { FrameColor } from '../types'

/**
 * Preset de agente: uma configuração salva (CLI, modelo, esforço, fast, yolo,
 * contexto inicial, skills e pasta). "Pré-treinado" aqui NÃO é treinar modelo —
 * é receita reaproveitável para subir um agente já no ponto.
 *
 * Este módulo é só o formato: validar, normalizar e (de)serializar. Nada aqui
 * toca disco ou UI, para o formato salvo e o de troca entre máquinas terem
 * teste de verdade.
 */

export const AGENT_PRESET_FORMAT = 'felixo-agent-preset'
/** Sobe quando o formato muda de forma incompatível; importar recusa versão maior. */
export const AGENT_PRESET_VERSION = 1

export const PRESET_NAME_MAX = 60
export const PRESET_CONTEXT_MAX = 20000
export const PRESET_SKILLS_MAX = 30
const PRESET_ICON_MAX = 4
const SKILL_ID_MAX = 120

/** Só CLIs nativas: launcher (Openia) tem contrato próprio e não vira preset. */
export type AgentPresetAgentId = Exclude<AgentId, 'openia'>

export type AgentPreset = {
  id: string
  name: string
  /** Frase curta do que o agente faz, mostrada na lista. */
  description: string
  /** Emoji/símbolo curto. */
  icon: string
  /** Moldura do terminal quando o agente nasce (mesma paleta do canvas). */
  color?: FrameColor
  agentId: AgentPresetAgentId
  /** Vazio = modelo padrão da CLI. */
  model: string
  /** Vazio = esforço padrão. */
  effort: string
  fast: boolean
  yolo: boolean
  /** Contexto inicial: entregue por arquivo, nunca digitado inteiro no PTY. */
  contextPrompt: string
  /** Ids do catálogo de skills (ex.: `builtin-notion-operacoes`). */
  skillIds: string[]
  /** Pasta padrão do agente; específica da máquina, não vai na exportação. */
  cwd: string
  /** Preset que acompanha o app: não se edita — duplica-se. */
  native?: boolean
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

/**
 * Valida o que veio do disco ou de um arquivo importado e devolve um preset
 * coerente — ou `null` quando não dá para reconstruir um agente válido.
 * Valores que a versão atual do app não conhece (modelo removido, esforço que
 * o modelo não aceita, fast em modelo sem o tier) viram o padrão, nunca um
 * argumento que a CLI recusaria na hora de subir.
 */
export function normalizePreset(value: unknown): AgentPreset | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>

  const id = text(raw.id, 120)
  const name = text(raw.name, PRESET_NAME_MAX)
  const agentId = raw.agentId
  if (!id || !name || typeof agentId !== 'string') return null

  const agent = getAgent(agentId as AgentId)
  if (!agent || agent.isLauncher) return null

  const requestedModel = text(raw.model, 120)
  const model = agent.models.includes(requestedModel) ? requestedModel : ''
  const requestedEffort = text(raw.effort, 20)
  const effort = isEffortValidForModel(agent, model, requestedEffort) ? requestedEffort : ''

  const skillIds = Array.isArray(raw.skillIds)
    ? [
        ...new Set(
          raw.skillIds
            .map((item) => text(item, SKILL_ID_MAX))
            .filter(Boolean),
        ),
      ].slice(0, PRESET_SKILLS_MAX)
    : []

  return {
    id,
    name,
    description: text(raw.description, 160),
    icon: text(raw.icon, PRESET_ICON_MAX),
    ...(readFrameColor(raw.color) ? { color: readFrameColor(raw.color) } : {}),
    agentId: agent.id as AgentPresetAgentId,
    model,
    effort,
    fast: raw.fast === true && supportsFastMode(agent, model),
    yolo: raw.yolo === true,
    contextPrompt:
      typeof raw.contextPrompt === 'string' ? raw.contextPrompt.trim().slice(0, PRESET_CONTEXT_MAX) : '',
    skillIds,
    cwd: text(raw.cwd, 1000),
    ...(raw.native === true ? { native: true } : {}),
  }
}

type PresetFile = {
  format: typeof AGENT_PRESET_FORMAT
  version: number
  exportedAt: string
  preset: Omit<AgentPreset, 'id' | 'native' | 'cwd'>
}

/**
 * Texto de troca entre máquinas. Fica de fora o que só faz sentido aqui: o
 * id (o importador gera outro), a pasta (caminho da máquina de origem) e a
 * marca de nativo.
 */
export function serializePreset(preset: AgentPreset, exportedAt: Date = new Date()): string {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, native, cwd, ...portable } = preset
  const file: PresetFile = {
    format: AGENT_PRESET_FORMAT,
    version: AGENT_PRESET_VERSION,
    exportedAt: exportedAt.toISOString(),
    preset: portable,
  }
  return `${JSON.stringify(file, null, 2)}\n`
}

export type ParsePresetResult =
  | { ok: true; preset: AgentPreset }
  | { ok: false; message: string }

/** Lê um arquivo de preset exportado; o preset importado ganha o id recebido. */
export function parsePresetFile(content: string, newId: string): ParsePresetResult {
  let data: unknown
  try {
    data = JSON.parse(content)
  } catch {
    return { ok: false, message: 'O arquivo não é um JSON válido.' }
  }

  if (typeof data !== 'object' || data === null || (data as { format?: unknown }).format !== AGENT_PRESET_FORMAT) {
    return { ok: false, message: 'O arquivo não é um preset de agente do Felixo.' }
  }

  const version = (data as { version?: unknown }).version
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, message: 'O preset não informa uma versão de formato válida.' }
  }
  if (version > AGENT_PRESET_VERSION) {
    return {
      ok: false,
      message: `Este preset usa o formato v${version}; esta versão do Felixo entende até v${AGENT_PRESET_VERSION}. Atualize o app.`,
    }
  }

  const preset = normalizePreset({ ...(data as { preset?: object }).preset, id: newId })
  if (!preset) {
    return { ok: false, message: 'O preset do arquivo está incompleto ou usa uma CLI desconhecida.' }
  }
  return { ok: true, preset: { ...preset, cwd: '' } }
}

/** Nome livre para uma cópia: "X (cópia)", "X (cópia 2)"… */
export function duplicatePresetName(name: string, existingNames: readonly string[]): string {
  const taken = new Set(existingNames.map((item) => item.toLowerCase()))
  const base = name.replace(/ \(cópia(?: \d+)?\)$/, '').slice(0, PRESET_NAME_MAX - 12)
  let candidate = `${base} (cópia)`
  for (let n = 2; taken.has(candidate.toLowerCase()); n += 1) {
    candidate = `${base} (cópia ${n})`
  }
  return candidate
}

const NATIVE_BASE = { fast: false, yolo: false, cwd: '', model: '', effort: '', native: true } as const

/**
 * Presets que acompanham o app. Ficam no código (não no banco): atualizam com
 * o app e não podem ser editados — para mexer, duplica-se. As skills são as
 * embutidas, referenciadas pelo mesmo id do catálogo.
 */
export const NATIVE_PRESETS: readonly AgentPreset[] = [
  {
    ...NATIVE_BASE,
    id: 'native:tasks-notion',
    name: 'Tasks do Notion',
    description: 'Trabalha uma task do Notion seguindo o fluxo completo, sem estragar o workspace.',
    icon: '📋',
    color: 'sky',
    agentId: 'codex',
    contextPrompt:
      'Você é o agente de tasks do Notion deste canvas. Ao receber uma task: leia o que o link é antes de escrever, confira o schema do database, registre o progresso na página da task e conclua marcando a etapa. Nunca apague o que a ferramenta não sabe repor, e relate o que mudou, onde e o que deixou de fazer.',
    skillIds: ['builtin-notion-operacoes', 'builtin-notion-anotacoes-para-tarefas', 'builtin-memoria-viva-ia-md'],
  },
  {
    ...NATIVE_BASE,
    id: 'native:revisor-pr',
    name: 'Revisor de PR',
    description: 'Revisa um pull request como revisor sênior: correção, segurança e testes.',
    icon: '🔍',
    color: 'violet',
    agentId: 'claude',
    contextPrompt:
      'Você é um revisor de pull request sênior. Leia o diff inteiro antes de opinar, priorize correção, segurança, perda de dados, contratos e testes, e declare a severidade de cada achado. Não altere código: aponte o problema, a evidência e a correção sugerida.',
    skillIds: ['builtin-revisar-pull-request', 'builtin-investigar-repo-desconhecido'],
  },
  {
    ...NATIVE_BASE,
    id: 'native:depurador',
    name: 'Depurador',
    description: 'Vai até a causa raiz: reproduz, isola, prova a hipótese e corrige na camada certa.',
    icon: '🐞',
    color: 'rose',
    agentId: 'claude',
    contextPrompt:
      'Você é um depurador. Reproduza o problema primeiro, isole a causa e prove a hipótese antes de corrigir; corrija na camada certa e deixe um teste que falha antes e passa depois. Se não conseguir reproduzir, diga isso em vez de adivinhar.',
    skillIds: ['builtin-depurar-causa-raiz', 'builtin-escrever-testes-que-valem'],
  },
]

import {
  getAgent,
  isEffortValidForModel,
  type AgentId,
} from './agent-launch-options'

/** Sentinel used by the launcher when the user explicitly selects a plain shell. */
export const SHELL_AGENT_VALUE = '__shell__'

const STORAGE_KEY = 'felixo:last-agent-launch-preferences'
const LEGACY_AGENT_STORAGE_KEY = 'felixo:last-agent'

export type AgentLaunchPreferences = {
  agentValue: AgentId | typeof SHELL_AGENT_VALUE
  model: string
  effort: string
  yolo: boolean
  projectId: string
  planningFile: string
  /** Interface e modelo do Openia; a chave nunca é persistida aqui. */
  openiaInterface: string
  openiaModel: string
  /**
   * Conta com login próprio escolhida por último. Só o id: a credencial mora
   * na pasta do perfil, e nada dela passa por aqui.
   *
   * Sem isto o campo voltava para "Login do sistema" a cada vez que o
   * configurador era reaberto, e quem trabalha numa conta secundária tinha de
   * reescolher a cada terminal.
   */
  accountId: string
}

type StorageReader = Pick<Storage, 'getItem'>
type StorageWriter = Pick<Storage, 'setItem'>

const DEFAULT_PREFERENCES: AgentLaunchPreferences = {
  agentValue: 'claude',
  model: '',
  effort: '',
  yolo: false,
  projectId: '',
  planningFile: '',
  openiaInterface: 'orchat',
  openiaModel: '',
  accountId: '',
}

function getBrowserStorage(): Storage | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

function isAgentValue(value: unknown): value is AgentLaunchPreferences['agentValue'] {
  return (
    value === SHELL_AGENT_VALUE ||
    (typeof value === 'string' && getAgent(value as AgentId) !== undefined)
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function normalizePreferences(
  value: unknown,
  fallback: AgentLaunchPreferences,
): AgentLaunchPreferences {
  if (!isRecord(value)) {
    return fallback
  }

  const agentValue = isAgentValue(value.agentValue)
    ? value.agentValue
    : fallback.agentValue
  const agent = agentValue === SHELL_AGENT_VALUE ? undefined : getAgent(agentValue)
  const requestedModel = stringValue(value.model)
  const model = agent?.models.includes(requestedModel) ? requestedModel : ''
  const requestedEffort = stringValue(value.effort)

  return {
    agentValue,
    model,
    effort:
      agent && isEffortValidForModel(agent, model, requestedEffort)
        ? requestedEffort
        : '',
    yolo: typeof value.yolo === 'boolean' ? value.yolo : fallback.yolo,
    projectId: stringValue(value.projectId),
    planningFile: stringValue(value.planningFile),
    openiaInterface: stringValue(value.openiaInterface) || fallback.openiaInterface,
    openiaModel: stringValue(value.openiaModel),
    accountId: stringValue(value.accountId),
  }
}

/** Reads and validates the last complete agent-launch configuration. */
export function readAgentLaunchPreferences(
  storage: StorageReader | undefined = getBrowserStorage(),
): AgentLaunchPreferences {
  let rawPreferences: string | null
  let legacyAgentValue: string | null

  try {
    rawPreferences = storage?.getItem(STORAGE_KEY) ?? null
    legacyAgentValue = storage?.getItem(LEGACY_AGENT_STORAGE_KEY) ?? null
  } catch {
    return DEFAULT_PREFERENCES
  }

  const fallback: AgentLaunchPreferences = isAgentValue(legacyAgentValue)
    ? { ...DEFAULT_PREFERENCES, agentValue: legacyAgentValue }
    : DEFAULT_PREFERENCES

  if (!rawPreferences) {
    return fallback
  }

  try {
    return normalizePreferences(JSON.parse(rawPreferences), fallback)
  } catch {
    return fallback
  }
}

/** Stores only reusable launch settings; the one-off terminal name stays empty. */
export function saveAgentLaunchPreferences(
  preferences: AgentLaunchPreferences,
  storage: StorageWriter | undefined = getBrowserStorage(),
): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(preferences))
  } catch {
    // Launching an agent must still work if browser storage is unavailable.
  }
}

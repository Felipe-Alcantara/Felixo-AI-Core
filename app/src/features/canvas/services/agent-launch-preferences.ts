import {
  getAgent,
  isEffortValidForModel,
  supportsFastMode,
  type AgentId,
} from './agent-launch-options'

/** Sentinel used by the launcher when the user explicitly selects a plain shell. */
export const SHELL_AGENT_VALUE = '__shell__'

/**
 * Opção "Agente na nuvem" do seletor. Fica fora de `AgentLaunchPreferences` de
 * propósito: o botão "Agente" abre a última configuração com um clique, e uma
 * nuvem sem tarefa não tem o que abrir. Por isso ela nunca é gravada.
 */
export const CLOUD_AGENT_VALUE = '__cloud__'

/**
 * Valor especial do campo Conta: "Automática (cadeia)". Só vale com a cadeia
 * ligada e um provedor com checagem de login; o main escolhe a conta e a
 * abertura confirma. Nunca cai no Login do sistema.
 */
export const CHAIN_ACCOUNT_VALUE = '@cadeia'

const STORAGE_KEY = 'felixo:last-agent-launch-preferences'
const LEGACY_AGENT_STORAGE_KEY = 'felixo:last-agent'

export type AgentLaunchPreferences = {
  agentValue: AgentId | typeof SHELL_AGENT_VALUE
  model: string
  effort: string
  yolo: boolean
  /** Modo fast do Codex (`service_tier=priority`). */
  fast: boolean
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
  /**
   * Nome dado pela pessoa à conta salva, guardado junto do id: se a conta
   * sumir, o aviso "a conta salva X não existe mais" ainda sabe dizer qual.
   */
  accountLabel?: string
  /**
   * Conta escolhida por último em cada provedor (id do provedor → conta), para
   * trocar de agente não perder a conta do outro. `accountId`/`accountLabel`
   * continuam sendo os do agente atual, que uma versão anterior ainda lê.
   * A leitura sempre devolve o mapa; quem grava pode omiti-lo.
   */
  accountByProvider?: Readonly<Record<string, SavedProviderAccount>>
}

/** Conta lembrada de um provedor. Só o id e o nome; nada da credencial. */
export type SavedProviderAccount = {
  accountId: string
  accountLabel?: string
}

/** O que o seletor de agente pode ter marcado: o que se grava, mais a nuvem. */
export type AgentConfigValue = AgentLaunchPreferences['agentValue'] | typeof CLOUD_AGENT_VALUE

/**
 * Provedor cujas contas valem para o que está marcado no seletor (vazio = nenhum,
 * como no shell). A nuvem roda o Claude Code, então usa as contas dele.
 */
export function providerIdOf(agentValue: AgentConfigValue): string {
  if (agentValue === SHELL_AGENT_VALUE) return ''
  return agentValue === CLOUD_AGENT_VALUE ? 'claude' : agentValue
}

type StorageReader = Pick<Storage, 'getItem'>
type StorageWriter = Pick<Storage, 'setItem'>

const DEFAULT_PREFERENCES: AgentLaunchPreferences = {
  agentValue: 'claude',
  model: '',
  effort: '',
  yolo: false,
  fast: false,
  projectId: '',
  planningFile: '',
  openiaInterface: 'orchat',
  openiaModel: '',
  accountId: '',
  accountByProvider: {},
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

function savedAccount(accountId: string, accountLabel: string): SavedProviderAccount {
  return accountLabel ? { accountId, accountLabel } : { accountId }
}

/**
 * Lê o mapa de contas por provedor, descartando provedor desconhecido e conta
 * sem id. Sem o mapa (preferência de antes dele), a conta única do agente
 * salvo vira a conta desse provedor: é a migração do valor antigo.
 */
function normalizeAccountByProvider(
  value: Record<string, unknown>,
  agentValue: AgentLaunchPreferences['agentValue'],
): Record<string, SavedProviderAccount> {
  const map: Record<string, SavedProviderAccount> = {}
  if (isRecord(value.accountByProvider)) {
    for (const [providerId, entry] of Object.entries(value.accountByProvider)) {
      if (!getAgent(providerId as AgentId) || !isRecord(entry)) continue
      const accountId = stringValue(entry.accountId)
      if (accountId) map[providerId] = savedAccount(accountId, stringValue(entry.accountLabel))
    }
  }
  const legacyAccountId = stringValue(value.accountId)
  if (agentValue !== SHELL_AGENT_VALUE && legacyAccountId && !map[agentValue]) {
    map[agentValue] = savedAccount(legacyAccountId, stringValue(value.accountLabel))
  }
  return map
}

/**
 * Mapa a gravar depois da escolha atual. Só a conta de um provedor cuja seleção
 * já foi decidida (pela lista dele ou pela pessoa) entra: logo depois de trocar
 * de agente o campo fica vazio até a lista chegar, e gravar esse vazio apagaria
 * a conta lembrada do provedor. Vazio decidido é o Login do sistema e sai do mapa.
 */
export function rememberProviderAccount(params: {
  saved: Readonly<Record<string, SavedProviderAccount>>
  providerId: string
  decidedProviderId: string
  accountId: string
  accountLabel?: string
}): Readonly<Record<string, SavedProviderAccount>> {
  const { saved, providerId, decidedProviderId, accountId, accountLabel = '' } = params
  if (!providerId || providerId !== decidedProviderId) return saved
  const current = saved[providerId]
  if (!accountId) {
    if (!current) return saved
    const next = { ...saved }
    delete next[providerId]
    return next
  }
  if (current?.accountId === accountId && (current.accountLabel ?? '') === accountLabel) return saved
  return { ...saved, [providerId]: savedAccount(accountId, accountLabel) }
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
    // Só vale para um agente/modelo que aceita fast; um valor salvo para outro
    // agente não pode ligar o tier escondido em quem não tem o campo.
    fast:
      typeof value.fast === 'boolean' && supportsFastMode(agent, model) ? value.fast : false,
    projectId: stringValue(value.projectId),
    planningFile: stringValue(value.planningFile),
    openiaInterface: stringValue(value.openiaInterface) || fallback.openiaInterface,
    openiaModel: stringValue(value.openiaModel),
    accountId: stringValue(value.accountId),
    ...(stringValue(value.accountLabel) ? { accountLabel: stringValue(value.accountLabel) } : {}),
    accountByProvider: normalizeAccountByProvider(value, agentValue),
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

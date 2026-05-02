import type {
  Model,
  ModelAvailabilityStatus,
  ModelCapabilityProfile,
  OrchestrationCliType,
  OrchestratorMode,
  OrchestratorSettings,
} from '../types'

const ORCHESTRATOR_SETTINGS_STORAGE_KEY =
  'felixo-ai-core.orchestrator-settings'

export const defaultOrchestratorSettings: OrchestratorSettings = {
  customContext: '',
  enabledSkills: ['planejamento', 'revisao', 'resumo'],
  preferredModelIds: [],
  blockedModelIds: [],
  defaultWorkflow: 'planejar-executar-validar',
  mode: 'semi_auto',
  maxAgentsPerTurn: 3,
  maxTurns: 5,
  maxTotalAgents: 10,
  maxRuntimeMinutes: 20,
  maxCostEstimate: 0,
  maxContextTokens: 0,
  requireConfirmationForSensitiveActions: true,
}

export function loadOrchestratorSettings(): OrchestratorSettings {
  try {
    const rawSettings = window.localStorage.getItem(
      ORCHESTRATOR_SETTINGS_STORAGE_KEY,
    )

    if (!rawSettings) {
      return defaultOrchestratorSettings
    }

    return normalizeOrchestratorSettings(JSON.parse(rawSettings))
  } catch {
    return defaultOrchestratorSettings
  }
}

export function saveOrchestratorSettings(settings: OrchestratorSettings) {
  window.localStorage.setItem(
    ORCHESTRATOR_SETTINGS_STORAGE_KEY,
    JSON.stringify(normalizeOrchestratorSettings(settings)),
  )
}

export function createModelCapabilityProfiles(
  models: Model[],
  settings: OrchestratorSettings,
  dynamicAvailability?: Record<string, ModelAvailabilityStatus>,
): ModelCapabilityProfile[] {
  const blockedModelIds = new Set(settings.blockedModelIds)

  return models
    .filter((model): model is Model & { cliType: OrchestrationCliType } =>
      model.cliType !== 'unknown',
    )
    .map((model) => ({
      id: model.id,
      name: model.name,
      cliType: model.cliType,
      providerModel: model.providerModel,
      reasoningEffort: model.reasoningEffort,
      execution: getExecutionModeLabel(model),
      supportsTools: supportsTools(model),
      supportsMcp: supportsMcp(model),
      supportsFileEdits: supportsFileEdits(model),
      supportsLongContext: supportsLongContext(model),
      supportsNativeSession: supportsNativeSession(model),
      strengths: getModelStrengths(model),
      limits: getModelLimitsLabel(model),
      cost: getModelCostLabel(model),
      status: resolveModelStatus(
        model.id,
        blockedModelIds,
        dynamicAvailability,
        model.cliType,
      ),
    }))
}

function resolveModelStatus(
  modelId: string,
  blockedModelIds: Set<string>,
  dynamicAvailability?: Record<string, ModelAvailabilityStatus>,
  cliType?: OrchestrationCliType,
): ModelAvailabilityStatus {
  if (blockedModelIds.has(modelId)) {
    return 'blocked'
  }

  const dynamic =
    dynamicAvailability?.[modelId] ??
    dynamicAvailability?.[`model:${modelId}`] ??
    (cliType
      ? dynamicAvailability?.[`cli:${cliType}`] ?? dynamicAvailability?.[cliType]
      : undefined)

  if (dynamic && dynamic !== 'available') {
    return dynamic
  }

  return 'available'
}

export function createOrchestratorContextBlock(
  profiles: ModelCapabilityProfile[],
  settings: OrchestratorSettings,
) {
  const lines: Array<string | null> = [
    'Contexto de modelos disponiveis para orquestracao:',
    `- Modo: ${formatOrchestratorMode(settings.mode)}.`,
    `- Workflow padrao: ${settings.defaultWorkflow || 'nao configurado'}.`,
    `- Limites: max ${settings.maxAgentsPerTurn} sub-agentes por turno, ${settings.maxTotalAgents} no total, ${settings.maxTurns} turnos, ${settings.maxRuntimeMinutes} min.`,
    settings.maxCostEstimate > 0 ? `- Limite de custo estimado: ${settings.maxCostEstimate}.` : null,
    settings.maxContextTokens > 0 ? `- Limite de contexto: ${settings.maxContextTokens} tokens.` : null,
    `- Confirmar acoes sensiveis: ${settings.requireConfirmationForSensitiveActions ? 'sim' : 'nao'}.`,
  ]

  if (settings.customContext.trim()) {
    lines.push('', 'Contexto personalizado do usuario:', settings.customContext.trim())
  }

  if (settings.enabledSkills.length > 0) {
    lines.push('', `Skills habilitadas: ${settings.enabledSkills.join(', ')}.`)
  }

  if (profiles.length === 0) {
    lines.push('', '- Nenhum modelo spawnavel cadastrado no app.')
  } else {
    lines.push('', 'Modelos spawnaveis:')

    for (const profile of profiles) {
      lines.push(
        `- ${profile.name} [${profile.cliType}] status=${profile.status}; execucao=${profile.execution}; modelo=${profile.providerModel ?? 'padrao'}; effort=${profile.reasoningEffort ?? 'padrao'}; ferramentas=${profile.supportsTools ? 'sim' : 'nao'}; mcp=${profile.supportsMcp ? 'sim' : 'planejado'}; edicao=${profile.supportsFileEdits ? 'sim' : 'limitada'}; contexto_longo=${profile.supportsLongContext ? 'sim' : 'desconhecido'}; limites=${profile.limits}; custo=${profile.cost}; indicado_para=${profile.strengths.join(', ')}.`,
      )
    }
  }

  if (settings.preferredModelIds.length > 0) {
    lines.push(
      '',
      `Preferencia do usuario por modelos: ${settings.preferredModelIds.join(', ')}.`,
    )
  }

  if (settings.blockedModelIds.length > 0) {
    lines.push(
      `Modelos bloqueados e proibidos para spawn: ${settings.blockedModelIds.join(', ')}.`,
    )
  }

  lines.push(
    '',
    'Regras de escolha:',
    '- Escolha somente cliType existente e com status available.',
    '- Se um modelo estiver bloqueado, nao solicite spawn dele.',
    '- Modelos com status error, no_login, limit_reached ou unavailable nao devem ser spawnados.',
    '- Para tarefas baratas ou simples, prefira modelos rapidos/menores quando disponiveis.',
    '- Para edicao de arquivos ou codigo, prefira modelos marcados como bons para codigo e edicao.',
    '- Explique a escolha no prompt do sub-agente quando isso ajudar rastreabilidade.',
  )

  return lines.filter((line): line is string => line !== null).join('\n')
}

export function normalizeOrchestratorSettings(
  value: unknown,
): OrchestratorSettings {
  if (!value || typeof value !== 'object') {
    return defaultOrchestratorSettings
  }

  const settings = value as Partial<OrchestratorSettings>

  return {
    customContext: getString(settings.customContext),
    enabledSkills: getStringList(settings.enabledSkills),
    preferredModelIds: getStringList(settings.preferredModelIds),
    blockedModelIds: getStringList(settings.blockedModelIds),
    defaultWorkflow:
      getString(settings.defaultWorkflow) ||
      defaultOrchestratorSettings.defaultWorkflow,
    mode: normalizeOrchestratorMode(settings.mode),
    maxAgentsPerTurn: normalizePositiveInteger(
      settings.maxAgentsPerTurn,
      defaultOrchestratorSettings.maxAgentsPerTurn,
    ),
    maxTurns: normalizePositiveInteger(
      settings.maxTurns,
      defaultOrchestratorSettings.maxTurns,
    ),
    maxTotalAgents: normalizePositiveInteger(
      settings.maxTotalAgents,
      defaultOrchestratorSettings.maxTotalAgents,
    ),
    maxRuntimeMinutes: normalizePositiveInteger(
      settings.maxRuntimeMinutes,
      defaultOrchestratorSettings.maxRuntimeMinutes,
    ),
    maxCostEstimate: normalizeNonNegativeNumber(
      settings.maxCostEstimate,
      defaultOrchestratorSettings.maxCostEstimate,
    ),
    maxContextTokens: normalizeNonNegativeNumber(
      settings.maxContextTokens,
      defaultOrchestratorSettings.maxContextTokens,
    ),
    requireConfirmationForSensitiveActions:
      typeof settings.requireConfirmationForSensitiveActions === 'boolean'
        ? settings.requireConfirmationForSensitiveActions
        : defaultOrchestratorSettings.requireConfirmationForSensitiveActions,
  }
}

function getExecutionModeLabel(model: Model) {
  if (model.cliType === 'claude') {
    return 'persistent-process'
  }

  if (model.cliType === 'codex-app-server') {
    return 'app-server'
  }

  if (model.cliType === 'gemini-acp') {
    return 'acp'
  }

  if (model.cliType === 'codex' || model.cliType === 'gemini') {
    return 'native-resume-or-one-shot'
  }

  return 'unknown'
}

function supportsTools(model: Model) {
  return model.cliType === 'claude' || model.cliType === 'codex'
}

function supportsMcp(model: Model) {
  return model.cliType === 'claude' || model.cliType === 'codex-app-server'
}

function supportsFileEdits(model: Model) {
  return (
    model.cliType === 'claude' ||
    model.cliType === 'codex' ||
    model.cliType === 'codex-app-server'
  )
}

function supportsLongContext(model: Model) {
  return model.cliType === 'gemini' || model.cliType === 'gemini-acp'
}

function supportsNativeSession(model: Model) {
  return model.cliType === 'claude' || model.cliType === 'codex' || model.cliType === 'gemini'
}

function getModelStrengths(model: Model) {
  if (model.cliType === 'claude') {
    return ['codigo', 'revisao', 'escrita', 'planejamento']
  }

  if (model.cliType === 'codex' || model.cliType === 'codex-app-server') {
    return ['codigo', 'edicao', 'testes', 'refactor']
  }

  if (model.cliType === 'gemini' || model.cliType === 'gemini-acp') {
    return ['resumo', 'pesquisa', 'contexto_longo', 'planejamento']
  }

  return ['desconhecido']
}

function getModelLimitsLabel(model: Model) {
  if (model.providerModel) {
    return `configurado pelo provedor para ${model.providerModel}`
  }

  return 'limite externo nao detectado'
}

function getModelCostLabel(model: Model) {
  if (model.cliType === 'gemini' || model.cliType === 'gemini-acp') {
    return 'tende a ser bom para custo em modelos Flash/Lite'
  }

  if (model.cliType === 'codex' || model.cliType === 'codex-app-server') {
    return 'depende do modelo OpenAI escolhido'
  }

  if (model.cliType === 'claude') {
    return 'depende do plano/modelo Anthropic escolhido'
  }

  return 'desconhecido'
}

function formatOrchestratorMode(mode: OrchestratorMode) {
  const labels: Record<OrchestratorMode, string> = {
    manual: 'manual',
    semi_auto: 'semiautomatico',
    automatic: 'automatico',
    read_only: 'somente leitura',
    experimental: 'experimental',
  }

  return labels[mode]
}

function normalizeOrchestratorMode(value: unknown): OrchestratorMode {
  return value === 'manual' ||
    value === 'semi_auto' ||
    value === 'automatic' ||
    value === 'read_only' ||
    value === 'experimental'
    ? value
    : defaultOrchestratorSettings.mode
}

function normalizePositiveInteger(value: unknown, fallback: number) {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback
}

function getString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function getStringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function normalizeNonNegativeNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : fallback
}

import type {
  Model,
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
      status: blockedModelIds.has(model.id) ? 'blocked' : 'available',
    }))
}

export function createOrchestratorContextBlock(
  profiles: ModelCapabilityProfile[],
  settings: OrchestratorSettings,
) {
  const lines = [
    'Contexto de modelos disponiveis para orquestracao:',
    `- Modo: ${formatOrchestratorMode(settings.mode)}.`,
    `- Workflow padrao: ${settings.defaultWorkflow || 'nao configurado'}.`,
    `- Limites: max ${settings.maxAgentsPerTurn} sub-agentes por turno, ${settings.maxTotalAgents} no total, ${settings.maxTurns} turnos, ${settings.maxRuntimeMinutes} min.`,
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
    '- Para tarefas baratas ou simples, prefira modelos rapidos/menores quando disponiveis.',
    '- Para edicao de arquivos ou codigo, prefira modelos marcados como bons para codigo e edicao.',
    '- Explique a escolha no prompt do sub-agente quando isso ajudar rastreabilidade.',
  )

  return lines.join('\n')
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

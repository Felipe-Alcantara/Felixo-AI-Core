/**
 * @module cli-request-policy
 * Regras puras de normalização das requisições `cli:send`.
 *
 * Extraído de `ipc-handlers.cjs`, onde vivia dentro de um closure de ~790
 * linhas e por isso só era alcançável através do IPC inteiro. Aqui as funções
 * são livres de estado e de I/O — recebem o que o renderer mandou e devolvem
 * a forma que o orquestrador espera —, o que as torna testáveis diretamente.
 *
 * A lógica é a mesma de antes da extração; os testes em
 * `cli-request-policy.test.cjs` foram escritos contra o comportamento original
 * para garantir isso.
 */

const os = require('node:os')

const { getRequiredString } = require('./cli-event-utils.cjs')

/** CLIs que o orquestrador sabe operar. */
function isValidOrchestrationCliType(value) {
  return (
    value === 'claude' ||
    value === 'codex' ||
    value === 'codex-app-server' ||
    value === 'gemini' ||
    value === 'gemini-acp'
  )
}

/**
 * Inteiro positivo ou `undefined`. "Ausente" e "inválido" colapsam no mesmo
 * resultado de propósito: em ambos os casos o limite correspondente não deve
 * ser aplicado, e o runner cai no seu padrão.
 */
function toPositiveIntegerOrUndefined(value) {
  return Number.isInteger(value) && value > 0 ? value : undefined
}

/** Lista de strings não vazias; qualquer outra entrada vira lista vazia. */
function normalizeStringList(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string' && item.trim())
    : []
}

/**
 * Normaliza um modelo vindo do renderer, ou `null` se ele não tiver os campos
 * obrigatórios / usar uma CLI não suportada.
 */
function normalizeAvailableModel(value) {
  if (!value || typeof value !== 'object') {
    return null
  }

  const model = value

  if (
    typeof model.id !== 'string' ||
    typeof model.name !== 'string' ||
    typeof model.command !== 'string' ||
    typeof model.source !== 'string' ||
    !isValidOrchestrationCliType(model.cliType)
  ) {
    return null
  }

  return {
    id: model.id,
    name: model.name,
    command: model.command,
    source: model.source,
    cliType: model.cliType,
    providerModel:
      typeof model.providerModel === 'string' && model.providerModel.trim()
        ? model.providerModel.trim()
        : undefined,
    reasoningEffort:
      typeof model.reasoningEffort === 'string' && model.reasoningEffort.trim()
        ? model.reasoningEffort.trim()
        : undefined,
    // Sem isto o campo morre aqui e o adapter nunca vê o pedido de fast.
    ...(model.fastMode === true ? { fastMode: true } : {}),
  }
}

/**
 * Lista de modelos utilizáveis, ou `null` quando o renderer não mandou uma
 * lista — distinto de `[]`, que significa "mandou, mas nenhum serve".
 */
function normalizeAvailableModels(value) {
  if (!Array.isArray(value)) {
    return null
  }

  return value
    .map(normalizeAvailableModel)
    .filter((model) => model && model.cliType !== 'unknown')
}

function normalizeOrchestrationSettings(value) {
  if (!value || typeof value !== 'object') {
    return null
  }

  return {
    preferredModelIds: normalizeStringList(value.preferredModelIds),
    blockedModelIds: normalizeStringList(value.blockedModelIds),
    maxAgentsPerTurn: toPositiveIntegerOrUndefined(value.maxAgentsPerTurn),
    maxTurns: toPositiveIntegerOrUndefined(value.maxTurns),
    maxTotalAgents: toPositiveIntegerOrUndefined(value.maxTotalAgents),
    maxRuntimeMinutes: toPositiveIntegerOrUndefined(value.maxRuntimeMinutes),
  }
}

/**
 * Extrai e valida os campos de uma requisição `cli:send`.
 *
 * Devolve `{ ok: false, message }` quando falta sessão ou prompt — os dois
 * únicos campos sem os quais não há o que executar. Os demais são normalizados
 * mas opcionais.
 *
 * @param {object} [params] - Payload cru vindo do renderer.
 */
function validateCliRequest(params) {
  const streamSessionId = getRequiredString(params?.sessionId)
  const threadId = getRequiredString(params?.threadId) || streamSessionId
  const prompt = getRequiredString(params?.prompt)

  if (!streamSessionId || !threadId || !prompt) {
    return { ok: false, message: 'Prompt ou sessão inválidos.' }
  }

  return {
    ok: true,
    streamSessionId,
    threadId,
    prompt,
    resumePrompt: getRequiredString(params?.resumePrompt),
    promptHint: getRequiredString(params?.promptHint),
    promptInsertion: normalizePromptInsertionMetadata(params?.promptInsertion),
    projectCwd:
      typeof params?.cwd === 'string' && params.cwd ? params.cwd : null,
  }
}

const PROMPT_INSERTION_SOURCES = new Set([
  'catalog',
  'skill',
  'manual',
  'file',
  'system',
  'handoff',
  'collaboration',
  'rename',
  'unknown',
])

function normalizePromptInsertionMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  const source = typeof value.source === 'string' ? value.source.trim() : ''
  const timestamp = typeof value.timestamp === 'string' ? value.timestamp : ''
  const timestampMs = Date.parse(timestamp)
  if (
    !PROMPT_INSERTION_SOURCES.has(source) ||
    typeof value.id !== 'string' ||
    typeof value.autoSubmit !== 'boolean' ||
    !Number.isFinite(timestampMs)
  ) {
    return undefined
  }

  const cleanText = (candidate, maxLength) =>
    typeof candidate === 'string' && candidate.trim()
      ? Array.from(candidate).slice(0, maxLength).join('')
      : undefined
  const combinedNames = Array.isArray(value.combinedNames)
    ? value.combinedNames
        .slice(0, 32)
        .map((name) => cleanText(name, 4096))
        .filter(Boolean)
    : []
  const metadata = {
    id: cleanText(value.id, 512) ?? '',
    source,
    combinedNames,
    autoSubmit: value.autoSubmit,
    timestamp: new Date(timestampMs).toISOString(),
  }
  const name = cleanText(value.name, 4096)
  if (name) metadata.name = name

  // Serialize only the allowlisted metadata. The insertion body can never
  // cross into terminal history, even if a caller supplies a `content` key.
  return JSON.stringify(metadata)
}

/**
 * Diretório onde uma CLI é executada quando o projeto não define um.
 *
 * Recebia um `cliType` num `if` cujos dois ramos retornavam exatamente o mesmo
 * valor desde o commit inicial do backend — nenhuma CLI jamais teve tratamento
 * distinto aqui. O parâmetro foi removido junto com o ramo morto; se algum dia
 * uma CLI precisar de diretório próprio, isso volta como decisão explícita.
 */
function resolveCliCwd() {
  return process.env.HOME || os.homedir() || process.cwd()
}

/** Só os limites das settings — o que o runner de orquestração consome. */
function createOrchestrationLimits(settings) {
  if (!settings) {
    return undefined
  }

  return {
    maxAgentsPerTurn: settings.maxAgentsPerTurn,
    maxTurns: settings.maxTurns,
    maxTotalAgents: settings.maxTotalAgents,
    maxRuntimeMinutes: settings.maxRuntimeMinutes,
  }
}

module.exports = {
  createOrchestrationLimits,
  isValidOrchestrationCliType,
  normalizeAvailableModel,
  normalizeAvailableModels,
  normalizeOrchestrationSettings,
  normalizePromptInsertionMetadata,
  normalizeStringList,
  resolveCliCwd,
  toPositiveIntegerOrUndefined,
  validateCliRequest,
}

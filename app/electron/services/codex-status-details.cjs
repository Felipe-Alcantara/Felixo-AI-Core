'use strict'

/**
 * Monta os detalhes do `/status` do Codex que o painel mostra em cada conta.
 *
 * Entrada: as respostas cruas do app-server (`account/read`, `config/read`,
 * `model/list`, `account/usage/read`, `account/rateLimits/read`) e a leitura
 * da tela do `/status` (ver codex-status-screen.cjs). Saída: um objeto raso,
 * com texto já em português, no formato que `normalizeStatusDetails`
 * (agent-usage-model.cjs) aceita — chaves de uma allowlist, profundidade até 3.
 *
 * O que fica de fora de propósito:
 * - e-mail e IDs da conta/workspace: a identidade já aparece no cabeçalho da
 *   conta, e ID de workspace não ajuda ninguém a ler o painel;
 * - caminhos e listas de projetos do `config.toml`, instruções e opções da
 *   interface do Codex: não são da conta e podem expor pastas da pessoa;
 * - dados que só existem numa conversa aberta (pasta, permissões da pasta,
 *   Agents.md, nome/modo/ID da conversa, janela de contexto usada): o painel
 *   mostra a conta, não uma sessão — o aviso fica no cartão do Codex.
 *
 * Valor ausente nunca vira zero: configuração não definida aparece como
 * "padrão da CLI" e um pedido que não respondeu vira uma linha em
 * `unavailable`, dizendo o que faltou.
 */

const CLI_DEFAULT = 'padrão da CLI'
const MODEL_DEFAULT = 'padrão do modelo'
const RECENT_DAYS = 14
const MAX_MODELS = 32

const PLAN_LABELS = {
  free: 'Free',
  go: 'Go',
  plus: 'Plus',
  pro: 'Pro',
  prolite: 'Pro Lite',
  team: 'Team',
  business: 'Business',
  enterprise: 'Enterprise',
  edu: 'Edu',
  edu_plus: 'Edu Plus',
  edu_pro: 'Edu Pro',
}

const AUTH_MODE_LABELS = {
  chatgpt: 'ChatGPT',
  apiKey: 'Chave da OpenAI',
  amazonBedrock: 'Amazon Bedrock',
}

const LIMIT_REACHED_LABELS = {
  rate_limit_reached: 'limite de uso atingido',
  workspace_owner_credits_depleted: 'créditos do dono do workspace esgotados',
  workspace_member_credits_depleted: 'créditos deste membro do workspace esgotados',
  workspace_owner_usage_limit_reached: 'limite de uso do dono do workspace atingido',
  workspace_member_usage_limit_reached: 'limite de uso deste membro do workspace atingido',
}

const PART_LABELS = {
  'account/read': 'Conta',
  'config/read': 'Configuração',
  'model/list': 'Modelos disponíveis',
  'account/usage/read': 'Histórico de tokens',
}

/**
 * @param {object} input
 * @param {object | null} [input.initialize] Resultado do `initialize`.
 * @param {string | null} [input.version] Versão já lida do `initialize`.
 * @param {Record<string, { status: string, result?: unknown, message?: string | null }>} [input.responses]
 * @param {object | null} [input.screen] Leitura da tela do `/status`.
 * @param {(value: string) => string} [input.formatTime] Hora local da leitura da tela.
 */
function buildCodexStatusDetails({
  version = null,
  responses = {},
  screen = null,
  formatTime = formatLocalTime,
} = {}) {
  const account = okResult(responses['account/read'])
  const config = okResult(responses['config/read'])?.config ?? null
  const models = toModelList(okResult(responses['model/list']))
  const usage = okResult(responses['account/usage/read'])
  const rateLimits = okResult(responses['account/rateLimits/read'])

  const details = {}
  const resolvedVersion = version ?? screen?.version ?? null
  if (resolvedVersion) {
    details.version = resolvedVersion
  }
  if (screen?.usagePage) {
    details.usagePage = screen.usagePage
  }

  const accountDetails = describeAccount(account?.account ?? null, rateLimits)
  if (accountDetails) {
    details.account = accountDetails
  }

  if (config) {
    details.configuration = describeConfiguration(config, models)
  }

  const accountState = describeAccountState(rateLimits)
  if (accountState) {
    details.accountState = accountState
  }
  const blockingWarning = describeBlockingWarning(rateLimits)
  if (blockingWarning) {
    details.blockingWarning = blockingWarning
  }

  if (models.length) {
    details.models = models
      .slice(0, MAX_MODELS)
      .map((model) => (model.isDefault ? `${model.label} (padrão)` : model.label))
  }

  const tokenUsage = describeTokenUsage(usage)
  if (tokenUsage) {
    details.tokenUsage = tokenUsage
  }

  if (Array.isArray(screen?.lines) && screen.lines.length) {
    details.lines = screen.lines
  }
  details.screen = describeScreen(screen, formatTime)

  const unavailable = Object.entries(PART_LABELS)
    .filter(([method]) => responses[method] && responses[method].status !== 'ok')
    .map(([method, label]) => `${label}: ${describeMissing(responses[method])}`)
  if (unavailable.length) {
    details.unavailable = unavailable
  }

  return details
}

function okResult(response) {
  return response?.status === 'ok' && response.result && typeof response.result === 'object'
    ? response.result
    : null
}

function describeMissing(response) {
  if (response?.status === 'timeout') {
    return 'o app-server não respondeu a tempo nesta rodada.'
  }
  return response?.message
    ? `o app-server recusou (${response.message}).`
    : 'o app-server recusou o pedido.'
}

function describeAccount(account, rateLimits) {
  const type = typeof account?.type === 'string' ? account.type : null
  const plan = account?.planType ?? rateLimits?.rateLimits?.planType ?? null
  if (!type && !plan) {
    return null
  }

  const details = {}
  if (type) {
    details.authMode = AUTH_MODE_LABELS[type] ?? type
  }
  if (typeof plan === 'string' && plan && plan !== 'unknown') {
    details.plan = PLAN_LABELS[plan] ?? plan
  }
  if (account?.type === 'amazonBedrock' && account.usesCodexManagedCredentials === true) {
    details.authMode = `${details.authMode} (credenciais gerenciadas pelo Codex)`
  }
  return details
}

/**
 * Só as chaves que descrevem como a conta roda modelos. Caminhos, projetos,
 * instruções e preferências de interface do `config.toml` nunca entram.
 */
function describeConfiguration(config, models) {
  const modelSlug = typeof config.model === 'string' ? config.model : null
  const configuredModel = modelSlug ? models.find((model) => model.id === modelSlug) : null
  const defaultModel = models.find((model) => model.isDefault) ?? null
  const activeModel = configuredModel ?? (modelSlug ? null : defaultModel)

  const model = modelSlug
    ? configuredModel
      ? `${configuredModel.label} (${modelSlug})`
      : modelSlug
    : defaultModel
      ? `${defaultModel.label} (${CLI_DEFAULT})`
      : CLI_DEFAULT

  const effort = typeof config.model_reasoning_effort === 'string'
    ? config.model_reasoning_effort
    : activeModel?.defaultReasoningEffort
      ? `${activeModel.defaultReasoningEffort} (${MODEL_DEFAULT})`
      : MODEL_DEFAULT

  return {
    model,
    reasoningEffort: effort,
    reasoningSummary: formatConfigValue(config.model_reasoning_summary),
    verbosity: formatConfigValue(config.model_verbosity),
    modelProvider: formatConfigValue(config.model_provider),
    serviceTier: describeServiceTier(config.service_tier, activeModel),
    approvalPolicy: formatConfigValue(config.approval_policy),
    sandboxMode: formatConfigValue(config.sandbox_mode),
    contextWindow: formatTokenLimit(config.model_context_window),
    autoCompactLimit: formatTokenLimit(config.model_auto_compact_token_limit),
    webSearch: formatConfigValue(config.web_search),
    // Perfil do config.toml escolhido com `--profile`/`profile = ...`.
    ...(typeof config.profile === 'string' && config.profile.trim() ? { profile: cleanText(config.profile) } : {}),
  }
}

function describeServiceTier(value, model) {
  if (typeof value !== 'string' || !value) {
    return CLI_DEFAULT
  }
  const tier = model?.serviceTiers.find((item) => item.id === value)
  return tier ? `${tier.name} (${value})` : value
}

function describeAccountState(rateLimits) {
  if (!rateLimits || typeof rateLimits !== 'object') {
    return null
  }

  const main = rateLimits.rateLimits ?? {}
  const state = {
    ordinaryUsage:
      rateLimits.ordinaryUsageAllowed === true
        ? 'liberado'
        : rateLimits.ordinaryUsageAllowed === false
          ? 'bloqueado pelo serviço'
          : 'não informado pela CLI',
    limitReached:
      typeof main.rateLimitReachedType === 'string'
        ? LIMIT_REACHED_LABELS[main.rateLimitReachedType] ?? main.rateLimitReachedType
        : 'nenhum',
    spendControl:
      main.spendControlReached === true
        ? 'atingido'
        : main.spendControlReached === false
          ? 'não atingido'
          : 'não informado pela CLI',
  }

  const individual = main.individualLimit
  if (individual && typeof individual === 'object') {
    const used = cleanText(individual.used)
    const limit = cleanText(individual.limit)
    const remaining = toFiniteNumber(individual.remainingPercent)
    if (used && limit) {
      state.individualLimit = remaining === null
        ? `usado ${used} de ${limit}`
        : `usado ${used} de ${limit} (${formatNumber(remaining)}% livre)`
    }
  }

  const credits = main.credits
  if (credits && typeof credits === 'object') {
    state.extraCredits = credits.unlimited === true
      ? 'ilimitados'
      : credits.hasCredits === true
        ? `saldo ${cleanText(credits.balance) ?? 'não informado'}`
        : 'sem créditos avulsos'
  }

  return state
}

/**
 * Frase curta para o resumo do provedor quando o serviço publica um bloqueio.
 * Só o que a CLI afirma: percentual zerado sozinho não vira aviso aqui (a
 * coluna da janela já mostra), e "não informado" não é bloqueio.
 */
function describeBlockingWarning(rateLimits) {
  if (!rateLimits || typeof rateLimits !== 'object') {
    return null
  }
  const main = rateLimits.rateLimits ?? {}
  const warnings = []
  if (rateLimits.ordinaryUsageAllowed === false) {
    warnings.push('O serviço bloqueou o uso comum desta conta.')
  }
  if (typeof main.rateLimitReachedType === 'string') {
    const label = LIMIT_REACHED_LABELS[main.rateLimitReachedType] ?? main.rateLimitReachedType
    warnings.push(`${label.charAt(0).toUpperCase()}${label.slice(1)}.`)
  }
  if (main.spendControlReached === true) {
    warnings.push('O controle de gasto da conta foi atingido.')
  }
  return warnings.length ? warnings.join(' ') : null
}

function describeTokenUsage(usage) {
  const summary = usage?.summary
  if (!summary || typeof summary !== 'object') {
    return null
  }

  const details = {}
  const lifetime = toFiniteNumber(summary.lifetimeTokens)
  if (lifetime !== null) {
    details.lifetimeTokens = `${formatNumber(lifetime)} tokens`
  }
  const peak = toFiniteNumber(summary.peakDailyTokens)
  if (peak !== null) {
    details.peakDailyTokens = `${formatNumber(peak)} tokens`
  }
  const longestTurn = toFiniteNumber(summary.longestRunningTurnSec)
  if (longestTurn !== null) {
    details.longestTurn = formatDuration(longestTurn)
  }
  const currentStreak = toFiniteNumber(summary.currentStreakDays)
  if (currentStreak !== null) {
    details.currentStreak = formatDays(currentStreak)
  }
  const longestStreak = toFiniteNumber(summary.longestStreakDays)
  if (longestStreak !== null) {
    details.longestStreak = formatDays(longestStreak)
  }

  const recentDays = (Array.isArray(usage.dailyUsageBuckets) ? usage.dailyUsageBuckets : [])
    .filter((bucket) => /^\d{4}-\d{2}-\d{2}$/.test(String(bucket?.startDate ?? '')))
    .filter((bucket) => toFiniteNumber(bucket.tokens) !== null)
    .sort((left, right) => (left.startDate < right.startDate ? 1 : -1))
    .slice(0, RECENT_DAYS)
    .map((bucket) => `${formatIsoDate(bucket.startDate)}: ${formatNumber(bucket.tokens)} tokens`)
  if (recentDays.length) {
    details.recentDays = recentDays
  }

  return Object.keys(details).length ? details : null
}

function describeScreen(screen, formatTime) {
  if (!screen) {
    return 'não consultada nesta rodada.'
  }
  if (screen.ok !== true) {
    return `não lida nesta rodada: ${screen.message ?? 'motivo não informado.'}`
  }
  const readAt = screen.readAt ? ` às ${formatTime(screen.readAt)}` : ''
  return screen.limitsPending
    ? `lida${readAt}, mas a CLI ainda não tinha os limites (pediu para rodar o /status de novo).`
    : `lida${readAt}.`
}

function toModelList(result) {
  const data = Array.isArray(result?.data) ? result.data : []
  return data
    .filter((model) => model && typeof model === 'object' && model.hidden !== true)
    .map((model) => {
      const id = cleanText(model.id) ?? cleanText(model.model)
      const label = cleanText(model.displayName) ?? id
      return {
        id,
        label,
        isDefault: model.isDefault === true,
        defaultReasoningEffort: cleanText(model.defaultReasoningEffort),
        serviceTiers: (Array.isArray(model.serviceTiers) ? model.serviceTiers : [])
          .map((tier) => ({ id: cleanText(tier?.id), name: cleanText(tier?.name) }))
          .filter((tier) => tier.id && tier.name),
      }
    })
    .filter((model) => model.id && model.label)
}

function formatConfigValue(value) {
  if (value === null || value === undefined || value === '') {
    return CLI_DEFAULT
  }
  if (typeof value === 'string') {
    return cleanText(value) ?? CLI_DEFAULT
  }
  if (typeof value === 'boolean') {
    return value ? 'ligado' : 'desligado'
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? formatNumber(value) : CLI_DEFAULT
  }
  // Política granular (objeto): o painel diz que existe, sem despejar regras.
  return 'personalizada no config.toml'
}

function formatTokenLimit(value) {
  const number = toFiniteNumber(value)
  return number === null ? MODEL_DEFAULT : `${formatNumber(number)} tokens`
}

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.round(totalSeconds))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  return [
    hours ? `${hours} h` : null,
    minutes ? `${minutes} min` : null,
    rest || (!hours && !minutes) ? `${rest} s` : null,
  ]
    .filter(Boolean)
    .join(' ')
}

function formatDays(value) {
  return value === 1 ? '1 dia' : `${formatNumber(value)} dias`
}

function formatIsoDate(value) {
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

function formatNumber(value) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value)
}

function formatLocalTime(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function cleanText(value) {
  if (typeof value !== 'string') {
    return null
  }
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 120)
  return cleaned || null
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null
  }
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : null
}

module.exports = {
  buildCodexStatusDetails,
}

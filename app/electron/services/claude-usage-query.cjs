'use strict'

const os = require('node:os')
const { createAccountCliEnv } = require('./cli-process-manager.cjs')
const { redactSecrets } = require('./official-cli-account-status.cjs')
const { runBufferedCommand } = require('./official-cli-service.cjs')
const { parseClaudeReset } = require('./accounts/reset-time.cjs')

const DEFAULT_TIMEOUT_MS = 30_000
// O executor corta o começo acima de 12 mil caracteres, e a saída em lista de
// eventos (`"verbose": true`) passa disso: medido 12.013.
const OUTPUT_LIMIT = 2 * 1024 * 1024

const CLAUDE_USAGE_ARGS = Object.freeze([
  '-p',
  '/usage',
  '--safe-mode',
  '--tools',
  '',
  '--setting-sources',
  'user',
  // A consulta não pode virar uma conversa retomável.
  '--no-session-persistence',
  '--output-format',
  'json',
])

// "Current week (all models): 46% used · resets Dec 2, 2am (America/Sao_Paulo)".
// Sem uso na janela, a CLI omite o trecho do reset.
const WINDOW_LINE_PATTERN =
  /^Current (session|week \(all models\)):\s*(\d+(?:[.,]\d+)?)\s*% used(?:\s*·\s*(resets\s+([^(]+?)(?:\s*\(([^)]+)\))?))?$/i

const WINDOWS = Object.freeze({
  session: { detail: 'currentSession', key: 'rate_limits.five_hour', label: 'Janela de 5 horas' },
  'week (all models)': { detail: 'currentWeek', key: 'rate_limits.seven_day', label: 'Janela de 7 dias' },
})

/**
 * Consulta os limites de uso do Claude com `claude -p /usage`.
 *
 * O comando é respondido pela própria CLI, sem pedido ao modelo e sem terminal
 * interativo. Isso importa: a sessão interativa pergunta "confia nesta pasta?"
 * antes de aceitar qualquer comando, e o Enter do `/status` respondia "não".
 *
 * @param {object} [dependencies]
 * @param {typeof runBufferedCommand} [dependencies.runCommand]
 * @param {() => number} [dependencies.now]
 * @returns {(options?: object) => Promise<object>}
 */
function createClaudeUsageQuery({ runCommand = runBufferedCommand, now = () => Date.now() } = {}) {
  return async function queryClaudeUsage({
    env: accountEnv = {},
    cwd = os.tmpdir(),
    timeoutMs = DEFAULT_TIMEOUT_MS,
    // Cancelamento de fora (teto da rodada ou "Reconectar" no painel).
    signal,
  } = {}) {
    const env = createAccountCliEnv({ providerId: 'claude', profileEnv: accountEnv })
    env.CLAUDE_CODE_SKIP_PROMPT_HISTORY = '1'

    let result
    try {
      result = await runCommand({
        command: 'claude',
        args: [...CLAUDE_USAGE_ARGS],
        cwd,
        env,
        timeoutMs,
        signal: signal ?? undefined,
        outputLimit: OUTPUT_LIMIT,
      })
    } catch {
      return failure('Não foi possível iniciar a consulta de uso do Claude.')
    }

    if (result?.cancelled) return failure('A consulta de uso do Claude foi cancelada.')
    if (result?.timedOut) return failure('A consulta de uso do Claude excedeu o tempo limite.')

    const reply = readJsonReply(result?.stdout)
    if (!reply) {
      return failure('O Claude não respondeu à consulta de uso. Confira se ele está atualizado.')
    }
    // Uma CLI que não conheça o comando o mandaria ao modelo: a resposta dele
    // não é leitura de limite, mesmo que pareça uma.
    if (reply.num_turns !== 0) {
      return failure('Esta versão do Claude não informa o uso sem abrir uma conversa. Atualize o Claude.')
    }

    const parsed = parseClaudeUsageText(reply.result, { now })
    if (result.ok !== true || reply.is_error || !parsed.metrics.length) {
      return failure('O Claude não informou os limites de uso desta conta. Confira se ela está conectada.')
    }

    const measuredAt = toIso(now())
    return { ok: true, collectedAt: measuredAt, measuredAt, ...parsed, message: null }
  }
}

const queryClaudeUsage = createClaudeUsageQuery()

/**
 * A saída é uma linha de JSON, e avisos da CLI podem vir antes dela. A linha é o
 * evento `result` ou, com `"verbose": true` nas configurações da pessoa, a lista
 * de todos os eventos.
 */
function readJsonReply(stdout) {
  for (const line of String(stdout ?? '').split('\n').reverse()) {
    if (!/^\s*[[{]/.test(line)) continue
    try {
      const reply = [JSON.parse(line)].flat().find((event) => typeof event?.result === 'string')
      if (reply) return reply
    } catch {
      // Linha cortada ou aviso que começa com chave: segue procurando.
    }
  }
  return null
}

function parseClaudeUsageText(output, { now = () => Date.now() } = {}) {
  // A saída vai até o banco e o renderer: redigir antes de extrair qualquer campo.
  const lines = redactSecrets(String(output ?? ''))
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((line) => line.slice(0, 500))
  const metrics = []
  const usage = {}

  for (const line of lines) {
    const match = line.match(WINDOW_LINE_PATTERN)
    if (!match) continue
    const [, name, rawPercent, resetText, resetValue, timeZone] = match
    const window = WINDOWS[name.toLowerCase()]
    const used = Number(rawPercent.replace(',', '.'))
    const resetAt = resetValue ? parseClaudeReset(resetValue, now(), timeZone ?? null) : null

    metrics.push({
      key: window.key,
      label: window.label,
      used,
      limit: 100,
      remaining: Math.max(0, 100 - used),
      unit: '%',
      precision: 'percentage',
      resetAt,
    })
    usage[window.detail] = {
      used,
      ...(resetAt ? { resetAt } : {}),
      ...(resetText ? { resetText } : {}),
    }
  }

  if (lines.length) usage.lines = lines.slice(0, 64)

  return { metrics, details: lines.length ? { usage } : null }
}

function failure(message) {
  return { ok: false, collectedAt: null, measuredAt: null, metrics: [], details: null, message }
}

function toIso(value) {
  const timestamp = Number(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date().toISOString()
}

module.exports = {
  CLAUDE_USAGE_ARGS,
  createClaudeUsageQuery,
  parseClaudeReset,
  parseClaudeUsageText,
  queryClaudeUsage,
}

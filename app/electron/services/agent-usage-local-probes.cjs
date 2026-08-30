'use strict'

const path = require('node:path')
const {
  readCodexIdentity,
  readCodexLocalUsage,
} = require('./agent-usage-codex-local.cjs')
const { getAppPaths } = require('../core/app-paths.cjs')
const { parseAgentUsage } = require('./agent-usage-report.cjs')
const {
  createClaudeStatuslineService,
} = require('./claude-statusline-service.cjs')

/**
 * Probes que leem quota de arquivos que a própria CLI já escreve na máquina.
 *
 * Existe porque nem toda CLI responde quota num comando: o Codex, por exemplo,
 * só publica `rate_limits` dentro do rollout da sessão. O registro é um mapa
 * para que ligar uma fonte nova seja declarar o probe em
 * `agent-usage-sources.cjs`, sem `if` de provider espalhado pelo serviço.
 *
 * Todo probe é somente leitura e devolve o mesmo formato:
 * `{ ok, collectedAt, metrics, identity, plan, message }`.
 */
const LOCAL_PROBES = Object.freeze({
  'codex-rollout': readCodexProbe,
  'claude-statusline': readClaudeStatuslineProbe,
})

/** Onde o script da status line grava o que captura. */
function claudeStatuslineDir() {
  return path.join(getAppPaths().userData, 'claude-statusline')
}

function readCodexProbe(options = {}) {
  // `codexHome` vem preenchido quando a leitura é de uma conta com login
  // próprio; vazio, cai no `~/.codex` do login do sistema.
  const usage = readCodexLocalUsage(options)
  const { identity, plan } = readCodexIdentity(options)

  return {
    ok: usage.ok,
    collectedAt: usage.collectedAt,
    metrics: usage.metrics,
    identity,
    plan: usage.plan ?? plan,
    message: usage.message,
  }
}

/**
 * Rate limit do Claude Code capturado pela status line. Sem a coleta ligada não
 * há arquivo e o probe simplesmente não tem métrica — o painel continua
 * mostrando a limitação, não um zero inventado.
 */
function readClaudeStatuslineProbe(options = {}) {
  const service = createClaudeStatuslineService({
    baseDir: options.claudeStatuslineDir ?? claudeStatuslineDir(),
    ...options,
  })
  const capture = service.readCapture()

  if (!capture) {
    return {
      ok: false,
      collectedAt: null,
      metrics: [],
      identity: null,
      plan: null,
      message: null,
    }
  }

  return {
    ok: true,
    collectedAt: capture.measuredAt,
    // O formato publicado pela status line já é o que o parser oficial lê.
    metrics: parseAgentUsage(
      'claude',
      JSON.stringify({ rate_limits: capture.rateLimits }),
    ).metrics,
    identity: null,
    plan: null,
    message: null,
  }
}

/**
 * Roda o probe declarado pela fonte. Um probe que falhe não derruba a rodada:
 * o painel continua com o estado de autenticação e informa a limitação.
 */
function runLocalProbe(probeId, options = {}) {
  const probe = LOCAL_PROBES[probeId]

  if (!probe) {
    return null
  }

  try {
    return probe(options)
  } catch {
    return {
      ok: false,
      collectedAt: null,
      metrics: [],
      identity: null,
      plan: null,
      message: 'A leitura local da quota falhou nesta rodada.',
    }
  }
}

module.exports = {
  LOCAL_PROBES,
  runLocalProbe,
}

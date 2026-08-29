'use strict'

const {
  readCodexIdentity,
  readCodexLocalUsage,
} = require('./agent-usage-codex-local.cjs')

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
})

function readCodexProbe(options = {}) {
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

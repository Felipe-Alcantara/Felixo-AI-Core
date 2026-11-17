/**
 * @module agent-models/agent-model-refresher
 * Uma rodada de descoberta: consulta as CLIs, junta com o cache por agente,
 * grava e diz a situação de cada um. Separado do IPC para ser testável.
 */

const { mergeDiscovered } = require('./agent-model-catalog.cjs')

const AGENT_IDS = ['claude', 'codex', 'gemini']

/**
 * Situação de cada agente depois de uma rodada: de onde vem a lista que o
 * seletor mostra e, quando não é da CLI, por quê.
 */
function describeAgents(catalogo, descoberto, motivos) {
  const agentes = {}

  for (const agentId of AGENT_IDS) {
    const entrada = catalogo?.[agentId]
    const origem = descoberto[agentId] ? 'descoberta' : entrada?.models?.length ? 'cache' : 'fixa'

    agentes[agentId] = {
      origem,
      motivo: origem === 'descoberta' ? null : (motivos[agentId] ?? null),
      discoveredAt: typeof entrada?.discoveredAt === 'string' ? entrada.discoveredAt : null,
    }
  }

  return agentes
}

function createAgentModelRefresher({ store, discover, runCli, readCodexCache, timeoutMs, log = () => {} }) {
  // Uma rodada por vez: quem pede durante uma rodada espera a mesma promessa
  // em vez de abrir outra leva de CLIs (cada diálogo pede uma ao montar).
  let emAndamento = null

  async function rodada() {
    const motivos = {}
    const descoberto = await discover({ runCli, readCodexCache, timeoutMs, motivos })

    const anterior = await store.read()
    const catalogo = mergeDiscovered(
      Object.entries(descoberto).map(([agentId, dados]) => ({ agentId, ...dados })),
      anterior,
    )
    const gravou = Object.keys(descoberto).length > 0 ? await store.save(catalogo) : false

    log({
      agentes: Object.keys(descoberto),
      falhas: Object.keys(motivos).filter((agentId) => motivos[agentId]),
      gravouCache: gravou,
    })

    return { ok: true, catalog: catalogo ?? {}, agents: describeAgents(catalogo, descoberto, motivos) }
  }

  return function refresh() {
    emAndamento ??= rodada().finally(() => {
      emAndamento = null
    })
    return emAndamento
  }
}

module.exports = { createAgentModelRefresher }

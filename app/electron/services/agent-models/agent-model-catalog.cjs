/**
 * @module agent-models/agent-model-catalog
 * Junta o que a descoberta trouxe com o cache em disco, agente por agente.
 *
 * A escolha entre cache e lista fixa do código acontece no renderer
 * (`agent-model-overlay.ts`): o que vale aqui é só não perder a lista boa de
 * um agente porque a consulta dele falhou numa rodada.
 */

/**
 * Junta os resultados da descoberta ao cache anterior, por agente.
 *
 * Cada agente guarda o próprio `discoveredAt`: quem respondeu agora leva a
 * data de agora; quem falhou mantém a entrada anterior, com a data da última
 * descoberta que deu certo. Devolve `null` quando não há nada a guardar —
 * distinto de `{}`, que sobrescreveria o cache.
 *
 * @param {Array<{ agentId: string, models: string[], labels?: unknown, effortLevels?: unknown }>} resultados
 * @param {Record<string, unknown> | null} [anterior] Cache em disco.
 * @param {string} [descobertoEm] ISO da rodada.
 */
function mergeDiscovered(resultados, anterior = null, descobertoEm = new Date().toISOString()) {
  const merged = {}

  for (const [agentId, entrada] of Object.entries(anterior ?? {})) {
    if (entrada && typeof entrada === 'object' && Array.isArray(entrada.models) && entrada.models.length > 0) {
      merged[agentId] = entrada
    }
  }

  for (const resultado of resultados ?? []) {
    if (!resultado?.agentId || !Array.isArray(resultado.models) || resultado.models.length === 0) {
      continue
    }

    merged[resultado.agentId] = {
      models: [...resultado.models],
      ...(resultado.labels && Object.keys(resultado.labels).length > 0 ? { labels: resultado.labels } : {}),
      ...(resultado.effortLevels ? { effortLevels: resultado.effortLevels } : {}),
      discoveredAt: descobertoEm,
    }
  }

  return Object.keys(merged).length > 0 ? merged : null
}

module.exports = {
  mergeDiscovered,
}

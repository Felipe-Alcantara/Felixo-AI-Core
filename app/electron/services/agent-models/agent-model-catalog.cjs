/**
 * @module agent-models/agent-model-catalog
 * Resolve qual lista de modelos cada agente oferece, entre três fontes.
 *
 * A ordem é decisão de produto: **cache primeiro**. Ele é a fonte principal —
 * o que faz o menu abrir instantâneo — e não um plano B. A descoberta roda em
 * background e assume assim que chega. A lista fixa do código é o último
 * recurso, existindo para que o menu nunca abra vazio: uma lista fixa que
 * envelhece é ruim, mas um agente sem nenhum modelo parece o app quebrado.
 *
 * A cadeia vale por agente, não para o catálogo inteiro. Isso importa: no
 * ambiente do dono do projeto o Gemini falha por elegibilidade da conta
 * enquanto Claude e Codex respondem, e um agente sem dados não pode arrastar
 * os outros de volta para a lista fixa.
 */

const AGENT_IDS = ['claude', 'codex', 'gemini']

/**
 * @param {object} params
 * @param {Record<string, { models: string[], effortLevels?: unknown }>} params.staticCatalog
 * @param {Record<string, { models: string[], effortLevels?: unknown }> | null} params.cached
 * @param {Record<string, { models: string[], effortLevels?: unknown }> | null} params.discovered
 * @returns {Record<string, { models: string[], effortLevels: unknown, source: 'discovered' | 'cache' | 'static' }>}
 */
function resolveAgentCatalog({ staticCatalog = {}, cached = null, discovered = null } = {}) {
  const catalogo = {}

  for (const agentId of AGENT_IDS) {
    const estatico = staticCatalog[agentId]
    if (!estatico) {
      continue
    }

    // Lista vazia significa "não descobri", não "não há modelos" — uma CLI que
    // respondeu com erro não pode zerar o menu.
    const fonte =
      pickWithModels(discovered?.[agentId], 'discovered') ??
      pickWithModels(cached?.[agentId], 'cache') ?? {
        entry: estatico,
        source: 'static',
      }

    catalogo[agentId] = {
      models: [...fonte.entry.models],
      effortLevels: fonte.entry.effortLevels ?? estatico.effortLevels ?? null,
      source: fonte.source,
    }
  }

  return catalogo
}

function pickWithModels(entry, source) {
  return Array.isArray(entry?.models) && entry.models.length > 0 ? { entry, source } : null
}

/**
 * Junta os resultados da descoberta no formato que vai para o cache em disco.
 *
 * Devolve `null` quando nada foi descoberto — distinto de `{}`, porque um
 * objeto vazio sobrescreveria o cache anterior e o app "aprenderia" a lista
 * vazia de uma CLI que estava temporariamente fora do ar.
 *
 * @param {Array<{ agentId: string, models: string[], effortLevels?: unknown }>} resultados
 */
function mergeDiscovered(resultados) {
  const merged = {}

  for (const resultado of resultados ?? []) {
    if (!resultado?.agentId || !Array.isArray(resultado.models) || resultado.models.length === 0) {
      continue
    }

    merged[resultado.agentId] = {
      models: [...resultado.models],
      ...(resultado.effortLevels ? { effortLevels: resultado.effortLevels } : {}),
    }
  }

  return Object.keys(merged).length > 0 ? merged : null
}

module.exports = {
  AGENT_IDS,
  mergeDiscovered,
  resolveAgentCatalog,
}

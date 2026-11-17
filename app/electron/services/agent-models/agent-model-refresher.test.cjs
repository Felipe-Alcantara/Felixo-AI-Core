const test = require('node:test')
const assert = require('node:assert/strict')
const { createAgentModelRefresher } = require('./agent-model-refresher.cjs')

function createMemoryStore(inicial = null) {
  const estado = { dados: inicial, gravacoes: 0 }
  return {
    estado,
    read: async () => estado.dados,
    save: async (catalogo) => {
      estado.dados = catalogo
      estado.gravacoes += 1
      return true
    },
  }
}

test('o Claude falha na segunda rodada e a lista dele continua, com a data da última que deu certo', async () => {
  const store = createMemoryStore()
  let rodada = 0
  const discover = async ({ motivos }) => {
    rodada += 1
    if (rodada === 1) {
      motivos.claude = null
      return { claude: { models: ['opus', 'fable'] } }
    }
    motivos.claude = 'claude não encontrado no PATH.'
    return { codex: { models: ['gpt-5.6'] } }
  }
  const refresh = createAgentModelRefresher({ store, discover })

  const primeira = await refresh()
  const segunda = await refresh()

  assert.equal(primeira.agents.claude.origem, 'descoberta')
  assert.deepEqual(segunda.catalog.claude.models, ['opus', 'fable'])
  assert.equal(segunda.agents.claude.origem, 'cache')
  assert.equal(segunda.agents.claude.motivo, 'claude não encontrado no PATH.')
  assert.equal(segunda.agents.claude.discoveredAt, primeira.agents.claude.discoveredAt)
  assert.deepEqual(store.estado.dados.claude.models, ['opus', 'fable'], 'o disco também guarda a lista')
  assert.equal(segunda.agents.codex.origem, 'descoberta')
  assert.equal(segunda.agents.gemini.origem, 'fixa')
})

test('rodada sem nada novo não regrava o cache', async () => {
  const store = createMemoryStore({ claude: { models: ['opus'], discoveredAt: '2026-11-01T00:00:00.000Z' } })
  const refresh = createAgentModelRefresher({ store, discover: async () => ({}) })

  const resultado = await refresh()

  assert.equal(store.estado.gravacoes, 0)
  assert.equal(resultado.agents.claude.origem, 'cache')
})

test('pedidos durante uma rodada esperam a mesma promessa', async () => {
  let chamadas = 0
  let liberar
  const discover = () => {
    chamadas += 1
    return new Promise((resolve) => {
      liberar = () => resolve({})
    })
  }
  const refresh = createAgentModelRefresher({ store: createMemoryStore(), discover })

  const a = refresh()
  const b = refresh()
  await new Promise((resolve) => setImmediate(resolve))
  liberar()
  await Promise.all([a, b])

  assert.equal(chamadas, 1, 'duas chamadas simultâneas viram uma rodada só')
})

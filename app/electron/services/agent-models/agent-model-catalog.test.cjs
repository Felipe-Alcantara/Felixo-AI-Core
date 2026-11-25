require('../../../scripts/test-support/pasta-do-teste.cjs') // isola o temporário deste arquivo (ver pasta-do-teste.cjs)
const test = require('node:test')
const assert = require('node:assert/strict')
const { mergeDiscovered } = require('./agent-model-catalog.cjs')

test('mergeDiscovered guarda só o que foi descoberto de fato', () => {
  // O que vai para o cache em disco: um agente que falhou não pode gravar
  // uma entrada vazia, senão o cache "aprende" a lista vazia.
  const resultado = mergeDiscovered([
    { agentId: 'claude', models: ['opus', 'fable'] },
    { agentId: 'gemini', models: [] },
    { agentId: 'codex', models: ['gpt-5.5'], effortLevels: { 'gpt-5.5': ['low'] } },
  ])

  assert.deepEqual(Object.keys(resultado).sort(), ['claude', 'codex'])
  assert.deepEqual(resultado.codex.effortLevels, { 'gpt-5.5': ['low'] })
})

test('mergeDiscovered devolve null quando nada foi descoberto', () => {
  // null é distinto de {}: sinaliza "não há o que gravar", então o cache
  // anterior sobrevive em vez de ser sobrescrito por um objeto vazio.
  assert.equal(mergeDiscovered([{ agentId: 'gemini', models: [] }]), null)
  assert.equal(mergeDiscovered([]), null)
})

test('mergeDiscovered mantém a lista anterior de quem falhou e carimba a de quem respondeu', () => {
  const anterior = {
    claude: { models: ['opus', 'fable'], discoveredAt: '2026-11-01T00:00:00.000Z' },
    codex: { models: ['gpt-5.5'], discoveredAt: '2026-11-01T00:00:00.000Z' },
    discoveredAt: '2026-11-01T00:00:00.000Z',
  }

  // O Claude falha nesta rodada; só o Codex responde, agora com rótulos.
  const resultado = mergeDiscovered(
    [{ agentId: 'codex', models: ['gpt-5.6'], labels: { 'gpt-5.6': 'GPT-5.6' } }],
    anterior,
    '2026-11-17T10:00:00.000Z',
  )

  assert.deepEqual(resultado.claude, anterior.claude)
  assert.deepEqual(resultado.codex, {
    models: ['gpt-5.6'],
    labels: { 'gpt-5.6': 'GPT-5.6' },
    discoveredAt: '2026-11-17T10:00:00.000Z',
  })
  assert.equal(resultado.discoveredAt, undefined, 'a data global não é uma entrada de agente')
})

test('mergeDiscovered sem nada novo devolve o cache anterior', () => {
  const anterior = { claude: { models: ['opus'], discoveredAt: '2026-11-01T00:00:00.000Z' } }

  assert.deepEqual(mergeDiscovered([], anterior), anterior)
})

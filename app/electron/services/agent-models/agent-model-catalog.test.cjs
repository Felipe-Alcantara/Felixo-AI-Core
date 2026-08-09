const test = require('node:test')
const assert = require('node:assert/strict')
const { resolveAgentCatalog, mergeDiscovered } = require('./agent-model-catalog.cjs')

const ESTATICO = {
  claude: { models: ['opus', 'sonnet', 'haiku'], effortLevels: ['low', 'medium', 'high', 'max'] },
  codex: { models: ['gpt-5.6-sol'], effortLevels: { 'gpt-5.6-sol': ['low', 'high'] } },
  gemini: { models: ['gemini-3-pro-preview'], effortLevels: null },
}

test('a lista descoberta substitui a estática quando existe', () => {
  const catalogo = resolveAgentCatalog({
    staticCatalog: ESTATICO,
    cached: null,
    discovered: { claude: { models: ['opus', 'sonnet', 'fable', 'best'] } },
  })

  assert.deepEqual(catalogo.claude.models, ['opus', 'sonnet', 'fable', 'best'])
  assert.equal(catalogo.claude.source, 'discovered')
})

test('sem descoberta, o cache é a fonte — e não a lista estática', () => {
  // O cache vem primeiro por decisão de produto: é o que faz o menu abrir
  // instantâneo. A lista do código é o último recurso, não o padrão.
  const catalogo = resolveAgentCatalog({
    staticCatalog: ESTATICO,
    cached: { claude: { models: ['opus', 'fable'] } },
    discovered: null,
  })

  assert.deepEqual(catalogo.claude.models, ['opus', 'fable'])
  assert.equal(catalogo.claude.source, 'cache')
})

test('a descoberta vence o cache quando ambos existem', () => {
  const catalogo = resolveAgentCatalog({
    staticCatalog: ESTATICO,
    cached: { claude: { models: ['antigo'] } },
    discovered: { claude: { models: ['novo'] } },
  })

  assert.deepEqual(catalogo.claude.models, ['novo'])
})

test('cai na lista estática só quando não há cache nem descoberta', () => {
  // É o que impede o menu de abrir vazio — a queixa que originou a feature:
  // se tudo falhar, o agente ainda tem o que oferecer.
  const catalogo = resolveAgentCatalog({
    staticCatalog: ESTATICO,
    cached: null,
    discovered: null,
  })

  assert.deepEqual(catalogo.claude.models, ['opus', 'sonnet', 'haiku'])
  assert.equal(catalogo.claude.source, 'static')
})

test('a cadeia é resolvida por agente, não para o catálogo inteiro', () => {
  // Cenário real do dono do projeto: o Gemini falha por tier da conta
  // enquanto Claude e Codex respondem. Um agente sem dados não pode
  // arrastar os outros para a lista estática.
  const catalogo = resolveAgentCatalog({
    staticCatalog: ESTATICO,
    cached: { codex: { models: ['gpt-5.5'] } },
    discovered: { claude: { models: ['fable'] } },
  })

  assert.equal(catalogo.claude.source, 'discovered')
  assert.equal(catalogo.codex.source, 'cache')
  assert.equal(catalogo.gemini.source, 'static')
})

test('uma descoberta vazia não apaga a lista que já existia', () => {
  // Uma CLI que respondeu sem listar nada (erro de auth, formato novo) não
  // pode zerar o menu: vazio significa "não descobri", não "não há modelos".
  const catalogo = resolveAgentCatalog({
    staticCatalog: ESTATICO,
    cached: { claude: { models: ['opus', 'fable'] } },
    discovered: { claude: { models: [] } },
  })

  assert.deepEqual(catalogo.claude.models, ['opus', 'fable'])
  assert.equal(catalogo.claude.source, 'cache')
})

test('preserva os níveis de esforço descobertos por modelo', () => {
  const catalogo = resolveAgentCatalog({
    staticCatalog: ESTATICO,
    cached: null,
    discovered: {
      codex: {
        models: ['gpt-5.6-sol', 'gpt-5.6-luna'],
        effortLevels: {
          'gpt-5.6-sol': ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
          'gpt-5.6-luna': ['low', 'medium', 'high', 'xhigh', 'max'],
        },
      },
    },
  })

  assert.deepEqual(catalogo.codex.effortLevels['gpt-5.6-luna'], [
    'low',
    'medium',
    'high',
    'xhigh',
    'max',
  ])
})

test('sem esforço descoberto, mantém o do agente estático', () => {
  const catalogo = resolveAgentCatalog({
    staticCatalog: ESTATICO,
    cached: null,
    discovered: { claude: { models: ['fable'] } },
  })

  assert.deepEqual(catalogo.claude.effortLevels, ['low', 'medium', 'high', 'max'])
})

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

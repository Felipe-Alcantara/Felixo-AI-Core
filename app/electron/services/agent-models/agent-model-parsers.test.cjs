const test = require('node:test')
const assert = require('node:assert/strict')
const {
  parseClaudeModelOutput,
  parseCodexModelsCache,
  parseGeminiModelOutput,
} = require('./agent-model-parsers.cjs')

// ---------------------------------------------------------------- Claude

test('lê os modelos da linha "Available:" do /model', () => {
  // Saída real de `claude -p "/model"` (capturada da CLI instalada).
  const saida = [
    'Current model: Opus 5 (effort: high)',
    'Usage: /model <name>. Available: sonnet, opus, haiku, fable, best, sonnet[1m], opus[1m], fable[1m], opusplan, default, or a full model ID.',
  ].join('\n')

  assert.deepEqual(parseClaudeModelOutput(saida), [
    'sonnet',
    'opus',
    'haiku',
    'fable',
    'best',
    'sonnet[1m]',
    'opus[1m]',
    'fable[1m]',
    'opusplan',
    'default',
  ])
})

test('descarta o texto de escape que fecha a lista do Claude', () => {
  // "or a full model ID." não é um modelo — é a frase que encerra a lista.
  const modelos = parseClaudeModelOutput(
    'Usage: /model <name>. Available: sonnet, opus, or a full model ID.',
  )

  assert.deepEqual(modelos, ['sonnet', 'opus'])
})

test('devolve lista vazia quando a saída do Claude não tem a lista', () => {
  // Erro de autenticação, mudança de formato, saída vazia: nenhum desses pode
  // virar um modelo inventado — quem chama decide o que fazer com o vazio.
  for (const saida of ['', 'Current model: Opus 5', 'Error: not logged in']) {
    assert.deepEqual(parseClaudeModelOutput(saida), [], `falhou para: ${saida}`)
  }
})

test('tolera espaçamento irregular e itens repetidos', () => {
  const modelos = parseClaudeModelOutput(
    'Available:   sonnet ,opus,  sonnet , haiku',
  )

  assert.deepEqual(modelos, ['sonnet', 'opus', 'haiku'], 'deveria deduplicar preservando a ordem')
})

// ----------------------------------------------------------------- Codex

/** Recorte do ~/.codex/models_cache.json real, com os campos que importam. */
function createCodexCache(overrides = {}) {
  return {
    fetched_at: '2026-08-09T14:27:52.340229856Z',
    models: [
      {
        slug: 'gpt-5.6-sol',
        display_name: 'GPT-5.6 Sol',
        visibility: 'list',
        default_reasoning_level: 'low',
        supported_reasoning_levels: [
          { effort: 'low' },
          { effort: 'medium' },
          { effort: 'high' },
          { effort: 'xhigh' },
          { effort: 'max' },
          { effort: 'ultra' },
        ],
      },
      {
        slug: 'gpt-5.6-sol-wm',
        display_name: 'GPT-5.6 Sol (interno)',
        visibility: 'hide',
        supported_reasoning_levels: [{ effort: 'low' }],
      },
      {
        slug: 'gpt-5.6-luna',
        display_name: 'GPT-5.6 Luna',
        visibility: 'list',
        default_reasoning_level: 'medium',
        supported_reasoning_levels: [
          { effort: 'low' },
          { effort: 'medium' },
          { effort: 'high' },
          { effort: 'xhigh' },
          { effort: 'max' },
        ],
      },
    ],
    ...overrides,
  }
}

test('lê modelos e níveis de esforço do cache do Codex', () => {
  const resultado = parseCodexModelsCache(createCodexCache())

  assert.deepEqual(
    resultado.models.map((modelo) => modelo.id),
    ['gpt-5.6-sol', 'gpt-5.6-luna'],
  )
  // O esforço varia por modelo — Luna não tem "ultra", Sol tem.
  assert.deepEqual(resultado.models[0].effortLevels, [
    'low',
    'medium',
    'high',
    'xhigh',
    'max',
    'ultra',
  ])
  assert.deepEqual(resultado.models[1].effortLevels, [
    'low',
    'medium',
    'high',
    'xhigh',
    'max',
  ])
})

test('esconde do menu os modelos marcados como visibility hide', () => {
  // `-wm` e `codex-auto-review` são internos da CLI; oferecê-los no menu de
  // agentes seria expor algo que o usuário não deveria escolher.
  const ids = parseCodexModelsCache(createCodexCache()).models.map((m) => m.id)

  assert.ok(!ids.includes('gpt-5.6-sol-wm'))
})

test('preserva o nome de exibição e o esforço padrão do Codex', () => {
  const [sol] = parseCodexModelsCache(createCodexCache()).models

  assert.equal(sol.label, 'GPT-5.6 Sol')
  assert.equal(sol.defaultEffort, 'low')
})

test('ignora níveis de esforço que o app não conhece', () => {
  // A CLI pode inventar um nível novo; o app só sabe montar a flag para os
  // que conhece, e um valor desconhecido viraria argumento inválido.
  const cache = createCodexCache({
    models: [
      {
        slug: 'gpt-novo',
        visibility: 'list',
        supported_reasoning_levels: [
          { effort: 'low' },
          { effort: 'turbo-quantico' },
          { effort: 'high' },
        ],
      },
    ],
  })

  assert.deepEqual(parseCodexModelsCache(cache).models[0].effortLevels, ['low', 'high'])
})

test('devolve vazio para cache do Codex ausente ou malformado', () => {
  for (const entrada of [null, undefined, {}, { models: 'nada' }, { models: [] }]) {
    assert.deepEqual(parseCodexModelsCache(entrada).models, [])
  }
})

test('descarta entradas do Codex sem slug', () => {
  const cache = createCodexCache({
    models: [{ visibility: 'list', display_name: 'sem slug' }, { slug: 'ok', visibility: 'list' }],
  })

  assert.deepEqual(
    parseCodexModelsCache(cache).models.map((m) => m.id),
    ['ok'],
  )
})

// ---------------------------------------------------------------- Gemini

test('lê os modelos de uma listagem do Gemini', () => {
  const saida = [
    'Available models:',
    '  gemini-3-pro-preview',
    '  gemini-3-flash',
    '  gemini-2.5-pro',
  ].join('\n')

  assert.deepEqual(parseGeminiModelOutput(saida), [
    'gemini-3-pro-preview',
    'gemini-3-flash',
    'gemini-2.5-pro',
  ])
})

test('não confunde mensagem de erro do Gemini com modelo', () => {
  // No ambiente do dono do projeto o Gemini falha por tier da conta: a saída
  // é um traceback, e nada ali pode virar opção de modelo no menu.
  const saida = [
    'Error authenticating: IneligibleTierError: This client is no longer supported',
    '    at throwIneligibleOrProjectIdError (file:///home/user/cli.js:1:1)',
    'Ripgrep is not available. Falling back to GrepTool.',
  ].join('\n')

  assert.deepEqual(parseGeminiModelOutput(saida), [])
})

test('aceita apenas identificadores com cara de modelo Gemini', () => {
  const saida = ['gemini-3-flash', 'Warning: 256-color support not detected.', 'gemini-2.5-pro'].join(
    '\n',
  )

  assert.deepEqual(parseGeminiModelOutput(saida), ['gemini-3-flash', 'gemini-2.5-pro'])
})

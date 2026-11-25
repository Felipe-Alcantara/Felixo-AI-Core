require('../../../scripts/test-support/pasta-do-teste.cjs') // isola o temporário deste arquivo (ver pasta-do-teste.cjs)
const test = require('node:test')
const assert = require('node:assert/strict')
const { discoverAgentModels } = require('./agent-model-discovery.cjs')

const SAIDA_CLAUDE =
  'Usage: /model <name>. Available: sonnet, opus, haiku, fable, or a full model ID.'

function createCodexCacheFile() {
  return JSON.stringify({
    models: [
      {
        slug: 'gpt-5.6-sol',
        display_name: 'GPT-5.6-Sol',
        visibility: 'list',
        supported_reasoning_levels: [{ effort: 'low' }, { effort: 'ultra' }],
      },
    ],
  })
}

/** Dependências injetadas, todas bem-sucedidas. */
function createDeps(overrides = {}) {
  return {
    runCli: async () => SAIDA_CLAUDE,
    readCodexCache: async () => createCodexCacheFile(),
    ...overrides,
  }
}

test('descobre os modelos do Claude e do Codex', async () => {
  const resultado = await discoverAgentModels(createDeps())

  assert.deepEqual(resultado.claude.models, ['sonnet', 'opus', 'haiku', 'fable'])
  assert.deepEqual(resultado.codex.models, ['gpt-5.6-sol'])
  assert.deepEqual(resultado.codex.effortLevels, { 'gpt-5.6-sol': ['low', 'ultra'] })
})

test('o Codex não gasta uma execução da CLI: lê o cache que ela mantém', async () => {
  // Spawnar o codex custa segundos e uma chamada; o models_cache.json é
  // atualizado pela própria CLI e já tem tudo, inclusive os esforços.
  const comandos = []
  await discoverAgentModels(
    createDeps({
      runCli: async (comando) => {
        comandos.push(comando)
        return SAIDA_CLAUDE
      },
    }),
  )

  assert.ok(!comandos.includes('codex'), 'não deveria executar a CLI do codex')
})

test('a falha de uma CLI não impede as outras, e o motivo fica registrado', async () => {
  // Claude falha (sem atalho no PATH, por exemplo) enquanto o Codex responde.
  const motivos = {}
  const resultado = await discoverAgentModels(
    createDeps({
      motivos,
      runCli: async () => {
        throw new Error('claude não encontrado no PATH.')
      },
    }),
  )

  assert.equal(resultado.claude, undefined, 'a CLI que falhou não entra no resultado')
  assert.deepEqual(resultado.codex.models, ['gpt-5.6-sol'])
  assert.equal(motivos.claude, 'claude não encontrado no PATH.')
  assert.equal(motivos.codex, null)
})

test('o Gemini não abre processo e explica por que usa a lista fixa', async () => {
  // `gemini -p "/model"` nunca devolve lista e ainda consulta a cota da conta.
  const comandos = []
  const motivos = {}
  const resultado = await discoverAgentModels(
    createDeps({
      motivos,
      runCli: async (comando) => {
        comandos.push(comando)
        return SAIDA_CLAUDE
      },
    }),
  )

  assert.deepEqual(comandos, ['claude'])
  assert.equal(resultado.gemini, undefined)
  assert.match(motivos.gemini, /não lista modelos fora do modo interativo/)
})

test('uma CLI travada não trava a descoberta inteira', async () => {
  // Sem timeout, um `claude` pendurado deixaria a atualização em background
  // presa para sempre — e o app pagaria isso em toda inicialização.
  const resultado = await discoverAgentModels(
    createDeps({
      runCli: async (comando) => {
        if (comando === 'claude') {
          await new Promise((resolve) => setTimeout(resolve, 50))
        }
        return SAIDA_CLAUDE
      },
      timeoutMs: 10,
    }),
  )

  assert.equal(resultado.claude, undefined, 'a CLI que estourou o tempo fica de fora')
})

test('cache do Codex ilegível não derruba a descoberta', async () => {
  const resultado = await discoverAgentModels(
    createDeps({
      readCodexCache: async () => {
        throw new Error('ENOENT')
      },
    }),
  )

  assert.equal(resultado.codex, undefined)
  assert.ok(resultado.claude, 'as outras CLIs continuam sendo descobertas')
})

test('cache do Codex com JSON inválido não derruba a descoberta', async () => {
  const resultado = await discoverAgentModels(
    createDeps({ readCodexCache: async () => '{ isto não é json' }),
  )

  assert.equal(resultado.codex, undefined)
  assert.ok(resultado.claude)
})

test('devolve objeto vazio quando nenhuma CLI responde', async () => {
  const resultado = await discoverAgentModels({
    runCli: async () => {
      throw new Error('sem CLI')
    },
    readCodexCache: async () => {
      throw new Error('sem cache')
    },
  })

  assert.deepEqual(resultado, {})
})

test('as CLIs são consultadas em paralelo', async () => {
  // Em série seriam ~3 timeouts somados na inicialização do app.
  let simultaneas = 0
  let pico = 0

  await discoverAgentModels(
    createDeps({
      runCli: async () => {
        simultaneas += 1
        pico = Math.max(pico, simultaneas)
        await new Promise((resolve) => setTimeout(resolve, 10))
        simultaneas -= 1
        return SAIDA_CLAUDE
      },
      readCodexCache: async () => {
        simultaneas += 1
        pico = Math.max(pico, simultaneas)
        await new Promise((resolve) => setTimeout(resolve, 10))
        simultaneas -= 1
        return createCodexCacheFile()
      },
    }),
  )

  assert.ok(pico > 1, `esperava execuções concorrentes, pico foi ${pico}`)
})

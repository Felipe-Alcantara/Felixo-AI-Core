'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  createCodexConfigOptionArgs,
  createCodexExecOptionArgs,
} = require('./model-options.cjs')

const contexto = (model) => ({ model })

test('sem fastMode nenhum service_tier é enviado (vale o config.toml da pessoa)', () => {
  const model = { providerModel: 'gpt-5.6-sol', reasoningEffort: 'high' }
  for (const criar of [createCodexExecOptionArgs, createCodexConfigOptionArgs]) {
    assert.equal(criar(contexto(model)).some((arg) => arg.includes('service_tier')), false)
  }
  assert.equal(
    createCodexExecOptionArgs(contexto({ ...model, fastMode: false })).some((arg) => arg.includes('service_tier')),
    false,
  )
})

test('fastMode passa service_tier="priority" nos dois caminhos (exec e app-server)', () => {
  const model = { providerModel: 'gpt-5.6-sol', reasoningEffort: 'high', fastMode: true }
  const exec = createCodexExecOptionArgs(contexto(model))
  const appServer = createCodexConfigOptionArgs(contexto(model))
  for (const args of [exec, appServer]) {
    const i = args.indexOf('service_tier="priority"')
    assert.ok(i > 0, `faltou service_tier em ${JSON.stringify(args)}`)
    assert.equal(args[i - 1], '--config')
  }
})

test('só o valor booleano true liga o fast (string/número não ligam por descuido de tipo)', () => {
  for (const fastMode of ['true', 1, 'priority', {}, null]) {
    const args = createCodexExecOptionArgs(contexto({ providerModel: 'gpt-5.6-sol', fastMode }))
    assert.equal(args.some((arg) => arg.includes('service_tier')), false)
  }
})

test('fast convive com modelo e esforço sem desalinhar os pares --config', () => {
  const args = createCodexExecOptionArgs(contexto({ providerModel: 'gpt-5.6-luna', reasoningEffort: 'low', fastMode: true }))
  // O caminho exec pode abrir com argumentos de full access antes do modelo;
  // o que importa aqui é a parte de modelo/esforço/tier estar íntegra.
  assert.deepEqual(args.slice(args.indexOf('--model')), [
    '--model', 'gpt-5.6-luna',
    '--config', 'model_reasoning_effort="low"',
    '--config', 'service_tier="priority"',
  ])
})

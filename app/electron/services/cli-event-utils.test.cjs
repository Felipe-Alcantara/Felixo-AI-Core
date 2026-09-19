const test = require('node:test')
const assert = require('node:assert/strict')
const { createModelSessionKey } = require('./cli-event-utils.cjs')

const MODEL = { cliType: 'codex', command: 'codex', id: 'm1', providerModel: 'gpt-5.6-sol', reasoningEffort: 'high' }

test('alternar o fast muda a chave da sessão persistente (não reaproveita o processo com o tier antigo)', () => {
  assert.notEqual(createModelSessionKey(MODEL), createModelSessionKey({ ...MODEL, fastMode: true }))
})

test('qualquer fastMode que não seja o booleano true gera a mesma chave que "sem fast"', () => {
  const semFast = createModelSessionKey(MODEL)
  assert.equal(createModelSessionKey({ ...MODEL, fastMode: false }), semFast)
  assert.equal(createModelSessionKey({ ...MODEL, fastMode: 'true' }), semFast)
  assert.equal(createModelSessionKey({ ...MODEL, fastMode: true }), createModelSessionKey({ ...MODEL, fastMode: true }))
})

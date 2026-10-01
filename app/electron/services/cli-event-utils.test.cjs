const test = require('node:test')
const assert = require('node:assert/strict')
const { createModelSessionKey, parseAdapterLine } = require('./cli-event-utils.cjs')
const { createTerminalEvents } = require('./terminal-event-formatter.cjs')
const { getTerminalAdapter, listTerminalAdapterTypes } = require('./providers/terminal-adapter-registry.cjs')

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

test('linha que o adaptador não entende não vira erro do chat e aparece como veio nos logs', () => {
  for (const cliType of listTerminalAdapterTypes()) {
    const line = '(node:4242) Aviso solto no meio do JSONL <b>sem</b> \u001b[31mformato\u001b[0m'
    const { cliEvent, parseError } = parseAdapterLine(getTerminalAdapter(cliType), line)

    assert.equal(cliEvent, null, cliType)
    assert.match(parseError, /JSON|token/i, cliType)
    assert.deepEqual(createTerminalEvents({ command: cliType, line, cliEvent, parseError, durationMs: 10 }), [
      {
        source: 'stdout',
        severity: 'warn',
        title: 'Linha não reconhecida',
        chunk: line,
        metadata: { reason: parseError },
      },
    ])
  }
})

test('JSON cortado no meio também volta inteiro para os logs', () => {
  const line = '{"type":"assistant","message":{"content":[{"type":"text","text":"metade'
  const { cliEvent, parseError } = parseAdapterLine(getTerminalAdapter('claude'), line)

  assert.equal(cliEvent, null)
  assert.equal(createTerminalEvents({ command: 'claude', line, cliEvent, parseError, durationMs: 1 })[0].chunk, line)
})

test('linha entendida segue sem parseError', () => {
  const line = JSON.stringify({ type: 'system', subtype: 'init', session_id: 'sessao-1' })
  const { cliEvent, parseError } = parseAdapterLine(getTerminalAdapter('claude'), line)

  assert.equal(parseError, null)
  assert.equal(cliEvent.providerSessionId, 'sessao-1')
})

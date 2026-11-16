'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const { classifyStructuredFailure } = require('./cli-failure-codes.cjs')
const { classifyFailure } = require('./failure-taxonomy.cjs')
const MEDIDOS = require('../../__fixtures__/cli-error-codes.json')

test('todo código medido nas versões instaladas tem uma decisão: uma classe, ou "o texto decide"', () => {
  for (const providerId of ['claude', 'codex', 'gemini']) {
    const { codigos, textoDecide } = MEDIDOS[providerId]
    const semDecisao = codigos.filter(
      (code) => !textoDecide.includes(code) && classifyStructuredFailure({ providerId, code }) === null,
    )
    assert.deepEqual(semDecisao, [], `${providerId}: códigos sem classe`)
    for (const code of textoDecide) {
      assert.equal(classifyStructuredFailure({ providerId, code }), null, `${providerId}: ${code} devolve ao texto`)
    }
  }
})

test('o código decide antes do texto: o texto que diria limite não põe a conta em espera', () => {
  // Codex: estourar a janela de contexto não é limite da conta, mesmo com "usage limit" no texto.
  const janela = classifyFailure({
    origin: 'fluxo',
    providerId: 'codex-app-server',
    text: 'Your input exceeds the usage limit of the context window.',
    code: 'contextWindowExceeded',
  })
  assert.equal(janela.failureClass, 'unknown')
  assert.equal(janela.source, 'codigo')
  assert.equal(
    classifyFailure({ origin: 'fluxo', providerId: 'codex', text: 'Your input exceeds the usage limit of the context window.' })
      .failureClass,
    'limit',
    'sem o código, o texto sozinho errava',
  )

  // Claude (fixture real): "out of extra usage" vem com rate_limit e tem horário de volta.
  const claude = classifyFailure({
    origin: 'fluxo',
    providerId: 'claude',
    text: "You're out of extra usage · resets 1:20pm (America/Sao_Paulo)",
    code: 'rate_limit',
  })
  assert.deepEqual([claude.failureClass, claude.source, claude.code], ['limit', 'codigo', 'rate_limit'])
  assert.match(claude.evidence, /out of extra usage/)
  assert.ok(claude.evidenceHash)
})

test('status HTTP estruturado: login, cobrança, limite, provedor; 403 continua ambíguo', () => {
  const por = (input) => classifyFailure({ origin: 'fluxo', text: 'falhou', ...input })
  assert.equal(por({ providerId: 'claude', httpStatus: 401 }).failureClass, 'auth')
  assert.equal(por({ providerId: 'claude', httpStatus: 402 }).failureClass, 'billing')
  assert.deepEqual([por({ providerId: 'claude', httpStatus: 403 }).failureClass, por({ providerId: 'claude', httpStatus: 403 }).ambiguous], ['auth', true])
  assert.equal(por({ providerId: 'gemini-acp', code: 429 }).failureClass, 'limit')
  assert.equal(por({ providerId: 'gemini-acp', code: -32000 }).failureClass, 'auth')
  assert.equal(por({ providerId: 'gemini-acp', code: 503 }).failureClass, 'provider')
  // A variante de conexão do Codex com status: o status decide.
  assert.equal(por({ providerId: 'codex', code: 'responseStreamDisconnected', httpStatus: 429 }).failureClass, 'limit')
  assert.equal(por({ providerId: 'codex', code: 'responseStreamDisconnected' }).failureClass, 'network')
  const sobrecarga = por({ providerId: 'claude', code: 'overloaded' })
  assert.deepEqual([sobrecarga.failureClass, sobrecarga.capacity], ['provider', true])
})

test('código ausente, desconhecido ou "não sei" devolve ao texto; o terminal (pty) nunca usa código', () => {
  const texto = 'Usage limit reached'
  assert.equal(classifyFailure({ origin: 'fluxo', providerId: 'codex', text: texto, code: 'other' }).source, 'texto')
  assert.equal(classifyFailure({ origin: 'fluxo', providerId: 'claude', text: texto, code: 'unknown' }).source, 'texto')
  assert.equal(classifyFailure({ origin: 'fluxo', providerId: 'codex', text: texto, code: 'codigoNovoDaVersaoSeguinte' }).source, 'texto')
  const pty = classifyFailure({ origin: 'pty', providerId: 'codex', text: 'qualquer coisa', code: 'usageLimitExceeded' })
  assert.deepEqual([pty.failureClass, pty.source], ['unknown', 'texto'])
  assert.equal(classifyFailure({ origin: 'fluxo', providerId: 'claude', text: 'x', code: 'rate_limit', signal: { stopped: true } }).failureClass, 'cancelled')
})

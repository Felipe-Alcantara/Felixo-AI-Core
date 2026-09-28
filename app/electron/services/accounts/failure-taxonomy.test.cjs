'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const {
  FAILURE_PRECEDENCE,
  classifyFailure,
  hasTerminalPatterns,
  normalizeTerminalText,
  resolveFailureProviderId,
} = require('./failure-taxonomy.cjs')
const { createNoVisibleOutputMessage } = require('../cli-event-utils.cjs')
const { EVIDENCE_MAX_CHARS } = require('./account-chain-constants.cjs')

const VOCABULARY = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', '__fixtures__', 'cli-failure-vocabulary.json'), 'utf8'),
)

function phrasesOf(kind) {
  return Object.entries(VOCABULARY.providers).flatMap(([providerId, provider]) =>
    provider.phrases.filter((phrase) => phrase.kind === kind).map((phrase) => ({ providerId, phrase })),
  )
}

test('toda frase de falha da fixture sai com a classe e o escopo que a fixture diz', () => {
  const includes = phrasesOf('include')
  assert.ok(includes.length >= 40, `a fixture deveria ter as frases do plano (tem ${includes.length})`)

  for (const { providerId, phrase } of includes) {
    const origin = phrase.terminal ? 'pty' : 'fluxo'
    const result = classifyFailure({ text: phrase.example, origin, providerId })
    assert.equal(result.failureClass, phrase.failureClass, `${phrase.id} (${origin})`)
    assert.equal(result.scope, phrase.scope, `${phrase.id}: escopo`)
    assert.equal(result.providerId, providerId)
    assert.ok(result.evidence, `${phrase.id}: sem evidência`)
    assert.match(result.evidenceHash, /^[0-9a-f]{32}$/)
  }
})

test('código de erro de fluxo nunca vale no terminal, onde o agente pode estar escrevendo o identificador', () => {
  const flowOnly = phrasesOf('include').filter(({ phrase }) => !phrase.terminal)
  assert.ok(flowOnly.length > 0)

  for (const { providerId, phrase } of flowOnly) {
    const result = classifyFailure({ text: `const code = '${phrase.literals[0]}'`, origin: 'pty', providerId })
    assert.equal(result.failureClass, 'unknown', phrase.id)
  }
})

test('exclusões da fixture nunca viram falha, no terminal nem no fluxo', () => {
  const exclusions = phrasesOf('exclude')
  assert.ok(exclusions.length >= 14)

  for (const { providerId, phrase } of exclusions) {
    for (const origin of ['pty', 'fluxo']) {
      const result = classifyFailure({ text: phrase.example, origin, providerId })
      assert.equal(result.failureClass, 'unknown', `${phrase.id} (${origin})`)
    }
    // Sem provedor conhecido, as exclusões de todos valem.
    assert.equal(classifyFailure({ text: phrase.example }).failureClass, 'unknown', `${phrase.id} (sem provedor)`)
  }
})

test('o rótulo sozinho observado no pacote fica fora da detecção no terminal (fail-closed)', () => {
  for (const { providerId, phrase } of phrasesOf('observed')) {
    assert.equal(classifyFailure({ text: phrase.example, origin: 'pty', providerId }).failureClass, 'unknown', phrase.id)
  }
})

test('"Your usage limit has reset" é aviso de retomada, não falha', () => {
  const [{ providerId, phrase }] = phrasesOf('notice')
  const result = classifyFailure({ text: phrase.example, origin: 'pty', providerId })

  assert.equal(result.failureClass, 'unknown')
  assert.equal(result.notice, 'limit_reset')
})

test('apóstrofo tipográfico e ASCII são a mesma coisa', () => {
  for (const text of ['You’ve hit your usage limit. Try again later.', "You've hit your usage limit. Try again later."]) {
    assert.equal(classifyFailure({ text, origin: 'pty', providerId: 'codex' }).failureClass, 'limit', text)
  }
})

test('precedência: cancelado > login > cobrança > limite > servidor > rede > tempo', () => {
  assert.deepEqual(FAILURE_PRECEDENCE, ['cancelled', 'auth', 'billing', 'limit', 'provider', 'network', 'timeout', 'unknown'])

  const limitAndAuth = 'Usage limit reached · continuing automatically at 4:40pm\nNot logged in · Please run /login'
  assert.equal(classifyFailure({ text: limitAndAuth, origin: 'pty', providerId: 'claude' }).failureClass, 'auth')

  assert.equal(
    classifyFailure({ text: "You're out of extra usage · usage limit", providerId: 'claude' }).failureClass,
    'billing',
  )
  assert.equal(classifyFailure({ text: 'rate limit exceeded\nECONNRESET' }).failureClass, 'limit')
  assert.equal(classifyFailure({ text: 'socket hang up\nstatus 503' }).failureClass, 'provider')
  assert.equal(
    classifyFailure({ text: limitAndAuth, origin: 'pty', providerId: 'claude', signal: { stopped: true } }).failureClass,
    'cancelled',
  )
})

test('um 429 isolado nunca é limite; com contexto colado, é', () => {
  for (const text of ['line 429', 'Error: failed to parse line 429 of config.toml', '429']) {
    assert.equal(classifyFailure({ text }).failureClass, 'unknown', text)
  }
  for (const text of ['Error: 429', 'unexpected status 429', 'HTTP/1.1 429', '{"code":429}']) {
    assert.equal(classifyFailure({ text }).failureClass, 'limit', text)
  }
})

test('"401 Unauthorized" impresso pelo agente no terminal não é falha da conta', () => {
  for (const providerId of ['claude', 'codex', 'gemini', 'openia']) {
    const result = classifyFailure({
      text: 'HTTP 401 Unauthorized — rate limit exceeded (429), invalid api key',
      origin: 'pty',
      providerId,
    })
    assert.equal(result.failureClass, 'unknown', providerId)
  }
})

test('capacidade do servidor é falha do provedor, com a marca de capacidade', () => {
  const gemini = classifyFailure({
    text: '✕ [API Error: 429 MODEL_CAPACITY_EXHAUSTED: No capacity available]',
    origin: 'pty',
    providerId: 'gemini',
  })
  assert.equal(gemini.failureClass, 'provider')
  assert.equal(gemini.capacity, true)

  const flow = classifyFailure({ text: 'API Error: 429 RESOURCE_EXHAUSTED' })
  assert.equal(flow.failureClass, 'provider', 'o 429 cede ao marcador de capacidade')
  assert.equal(flow.capacity, true)

  const quota = classifyFailure({ text: 'API Error: 429 RESOURCE_EXHAUSTED: Quota exceeded for metric' })
  assert.equal(quota.failureClass, 'limit', 'com "quota exceeded" é limite')
  assert.equal(quota.capacity, false)
})

test('cobrança separada de limite', () => {
  for (const text of [
    'Credit balance is too low',
    'You exceeded your current quota, please check your plan and billing details.',
    'insufficient_quota',
    'Error 402 Payment Required',
    "You're out of extra usage",
  ]) {
    assert.equal(classifyFailure({ text }).failureClass, 'billing', text)
  }
})

test('rede e tempo esgotado nunca viram limite', () => {
  for (const text of [
    'ECONNRESET',
    'getaddrinfo ENOTFOUND api.openai.com',
    'stream disconnected before completion: ECONNRESET',
    'TypeError: fetch failed',
  ]) {
    assert.equal(classifyFailure({ text, providerId: 'codex' }).failureClass, 'network', text)
  }

  assert.equal(
    classifyFailure({ text: createNoVisibleOutputMessage('claude', 90_000) }).failureClass,
    'timeout',
    'a mensagem de tempo esgotado do próprio app',
  )
  assert.equal(classifyFailure({ text: '', signal: { timedOut: true } }).failureClass, 'timeout')
})

test('403 é login ambíguo e perde para qualquer ocorrência certa', () => {
  const forbidden = classifyFailure({ text: 'API Error: 403 Forbidden' })
  assert.equal(forbidden.failureClass, 'auth')
  assert.equal(forbidden.ambiguous, true)

  const withLimit = classifyFailure({ text: 'API Error: 403 Forbidden\nrate limit exceeded' })
  assert.equal(withLimit.failureClass, 'limit')
  assert.equal(withLimit.ambiguous, false)
})

test('limite do Codex por modelo tem escopo de modelo; o da conta, de conta', () => {
  const model = classifyFailure({
    text: '■ You’ve hit your usage limit for gpt-5.5-codex. Switch to another model now, or try again at 8:04 PM.',
    origin: 'pty',
    providerId: 'codex',
  })
  assert.equal(model.failureClass, 'limit')
  assert.equal(model.scope, 'model')

  const account = classifyFailure({ text: '■ You’ve hit your usage limit. Try again at 8:04 PM.', origin: 'pty', providerId: 'codex' })
  assert.equal(account.scope, 'account')
})

test('"Not logged in" do Codex só vale como linha inteira', () => {
  const standalone = classifyFailure({ text: 'Not logged in', origin: 'pty', providerId: 'codex' })
  assert.equal(standalone.failureClass, 'auth')

  for (const text of ['return res.status(401).send("User not logged in")', '  • Auth: Not logged in']) {
    assert.equal(classifyFailure({ text, origin: 'pty', providerId: 'codex' }).failureClass, 'unknown', text)
  }
})

test('a evidência sai redigida e limitada', () => {
  const secrets = [
    'Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123456789',
    'sk-ant-api03-SENTINELA1234567890',
    'sk-or-v1-SENTINELA1234567890abcdef',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJTRU5USU5FTEEifQ.c2lnbmF0dXJhU0VOVElORUxB',
  ]
  for (const secret of secrets) {
    const result = classifyFailure({ text: `API Error: 401 invalid api key ${secret}` })
    assert.equal(result.failureClass, 'auth')
    assert.doesNotMatch(result.evidence, /SENTINELA|abcdefghijklmnopqrstuvwxyz0123456789/, secret)
    assert.match(result.evidence, /\[oculto\]/)
  }

  const long = `${'x'.repeat(500)} Usage limit reached · continuing automatically at 4:40pm · esc to cancel ${'y'.repeat(500)}`
  const result = classifyFailure({ text: long, origin: 'pty', providerId: 'claude' })
  assert.equal(result.failureClass, 'limit')
  assert.ok(result.evidence.length <= EVIDENCE_MAX_CHARS, `evidência com ${result.evidence.length} caracteres`)
  assert.match(result.evidence, /Usage limit reached · continuing automatically at 4:40pm/)
  assert.match(result.evidence, /^…/)
  assert.match(result.evidence, /…$/)
})

test('a impressão digital é estável no redesenho e muda com uma evidência nova', () => {
  const banner = 'Usage limit reached · continuing automatically at 4:40pm · esc to cancel'
  const first = classifyFailure({ text: banner, origin: 'pty', providerId: 'claude' })
  const redrawn = classifyFailure({
    text: `\u001b[2K\r\u001b[1mUsage\u001b[1Climit reached\u001b[22m \u001b[2m·\u001b[22m continuing automatically at 4:40pm · esc to cancel`,
    origin: 'pty',
    providerId: 'claude',
  })
  const later = classifyFailure({ text: banner.replace('4:40pm', '9:10pm'), origin: 'pty', providerId: 'claude' })

  assert.equal(redrawn.failureClass, 'limit')
  assert.equal(redrawn.evidenceHash, first.evidenceHash)
  assert.notEqual(later.evidenceHash, first.evidenceHash)
})

test('a normalização do terminal tira escapes, trata CR e movimento de cursor como quebra', () => {
  assert.deepEqual(
    normalizeTerminalText('\u001b]0;título\u0007ab\u001b[31mc\u001b[0m\r\nlinha 2\rredesenho\u001b[5;1Hnova'),
    ['ab c', 'linha 2', 'redesenho', 'nova'],
  )
  assert.deepEqual(normalizeTerminalText(null), [])
})

test('entrada hostil não lança e devolve desconhecido', () => {
  for (const input of [undefined, null, {}, { text: 42 }, { text: {}, origin: 'x', providerId: 7 }]) {
    const result = classifyFailure(input)
    assert.equal(result.failureClass, 'unknown')
    assert.equal(result.evidence, null)
    assert.equal(result.evidenceHash, null)
  }
})

test('provedores: aliases do app, e só quem tem frase no terminal ganha vigia', () => {
  assert.equal(resolveFailureProviderId('codex-app-server'), 'codex')
  assert.equal(resolveFailureProviderId('gemini-acp'), 'gemini')
  assert.equal(resolveFailureProviderId('bash'), null)
  assert.equal(resolveFailureProviderId(undefined), null)

  assert.equal(hasTerminalPatterns('claude'), true)
  assert.equal(hasTerminalPatterns('codex'), true)
  assert.equal(hasTerminalPatterns('gemini'), true)
  assert.equal(hasTerminalPatterns('openia'), false)
  assert.equal(hasTerminalPatterns(null), false)
})

test('no terminal, provedor sem frase (Openia) nunca detecta nada', () => {
  const result = classifyFailure({ text: 'Credit balance is too low\nrate limit exceeded', origin: 'pty', providerId: 'openia' })
  assert.equal(result.failureClass, 'unknown')
})

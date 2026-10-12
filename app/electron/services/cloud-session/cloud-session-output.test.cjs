'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  CLOUD_SESSION_ERROR_CODES,
  isCloudSessionUrl,
  isFollowUpSent,
  parseCloudSessionOutput,
  stripAnsi,
  summarizeTail,
} = require('./cloud-session-output.cjs')

const ID = 'session_01EXEMPLO0000000000000000'
const URL_OK = `https://claude.ai/code/${ID}?from=cli&m=0`

// Saída de sucesso do `claude --cloud`, como medida num PTY real (IDs sintéticos).
const SUCCESS = [
  'Created cloud session: Resposta sem alterações',
  `View: ${URL_OK}`,
  `Resume with: claude --teleport ${ID}`,
  '',
].join('\r\n')

// A saída real do CLI termina cada linha, inclusive a última, com CRLF.
const out = (...lines) => `${lines.join('\r\n')}\r\n`

// A TUI desenha espaços como "cursor 1 coluna à direita" (ESC[1C).
const tui = (text) => text.replace(/ /g, '\x1b[1C')

const TRUST_SCREEN =
  '\x1b[?25l\x1b[2J\x1b[H' +
  tui('Quick safety check: Is this a project you created or one you trust?') +
  '\r\n' +
  tui('No, exit') +
  '\r\n' +
  tui('Yes, I trust this folder') +
  '\x1b[?25h'

test('stripAnsi converte cursor à direita em espaço e remove CSI e OSC', () => {
  const raw = '\x1b]0;claude\x07\x1b[38;2;1;2;3mA\x1b[1Cb\x1b[m\x1b[?25l'

  assert.equal(stripAnsi(raw), 'A b')
})

test('reconhece a sessão criada nas três linhas da saída real', () => {
  const result = parseCloudSessionOutput(SUCCESS)

  assert.deepEqual(result, {
    kind: 'created',
    session: { id: ID, url: URL_OK, title: 'Resposta sem alterações' },
  })
})

test('reconhece a sessão criada mesmo com sequências ANSI e a tela de confiança antes', () => {
  const raw = `${TRUST_SCREEN}\r\n\x1b]0;claude\x07\x1b[?25h${SUCCESS}`

  const result = parseCloudSessionOutput(raw)

  assert.equal(result.kind, 'created')
  assert.equal(result.session.id, ID)
})

test('junta a URL partida por quebra de linha inserida pelo PTY', () => {
  const metade = Math.floor(URL_OK.length / 2)
  const raw = out(
    'Created cloud session: Tarefa',
    `View: ${URL_OK.slice(0, metade)}`,
    `${URL_OK.slice(metade)}`,
    `Resume with: claude --teleport ${ID}`,
  )

  const result = parseCloudSessionOutput(raw)

  assert.equal(result.kind, 'created')
  assert.equal(result.session.url, URL_OK)
})

test('colapsa título longo quebrado em duas linhas num único espaço', () => {
  const raw = out(
    'Created cloud session: Pacote Python calc com tokenizer',
    'parser e evaluator',
    `View: ${URL_OK}`,
    `Resume with: claude --teleport ${ID}`,
  )

  const result = parseCloudSessionOutput(raw)

  assert.equal(result.kind, 'created')
  assert.equal(result.session.title, 'Pacote Python calc com tokenizer parser e evaluator')
})

test('corta o título em 200 caracteres', () => {
  const raw = out(
    `Created cloud session: ${'a'.repeat(300)}`,
    `View: ${URL_OK}`,
    `Resume with: claude --teleport ${ID}`,
  )

  assert.equal(parseCloudSessionOutput(raw).session.title.length, 200)
})

test('devolve incomplete enquanto a saída ainda não fechou as três linhas', () => {
  assert.deepEqual(parseCloudSessionOutput(''), { kind: 'incomplete' })
  assert.deepEqual(parseCloudSessionOutput('Created cloud session: x\r\n'), { kind: 'incomplete' })
  assert.deepEqual(
    parseCloudSessionOutput(`Created cloud session: x\r\nView: ${URL_OK}\r\n`),
    { kind: 'incomplete' },
  )
})

test('trata a última linha sem quebra como incompleta até o processo sair', () => {
  const semQuebra = SUCCESS.trimEnd()

  assert.deepEqual(parseCloudSessionOutput(semQuebra), { kind: 'incomplete' })
  assert.equal(parseCloudSessionOutput(semQuebra, { final: true }).kind, 'created')
})

test('não confunde um ID cortado no meio do pedaço com um ID divergente', () => {
  const cortado = out('Created cloud session: x', `View: ${URL_OK}`).concat(
    `Resume with: claude --teleport ${ID.slice(0, 12)}`,
  )

  assert.deepEqual(parseCloudSessionOutput(cortado), { kind: 'incomplete' })
})

test('reconhece a tela de confiança da pasta quando nenhuma sessão foi criada', () => {
  assert.deepEqual(parseCloudSessionOutput(TRUST_SCREEN), { kind: 'trust-required' })
})

test('recusa quando o ID do link difere do ID do comando de retomada', () => {
  const raw = out(
    'Created cloud session: x',
    `View: ${URL_OK}`,
    'Resume with: claude --teleport session_01OUTRO000000000000000000',
  )

  const result = parseCloudSessionOutput(raw)

  assert.equal(result.kind, 'error')
  assert.equal(result.code, 'unknown')
})

test('recusa link que não é do claude.ai/code', () => {
  const raw = out(
    'Created cloud session: x',
    `View: https://claude.ai.evil.example/code/${ID}`,
    `Resume with: claude --teleport ${ID}`,
  )

  const result = parseCloudSessionOutput(raw)

  assert.equal(result.kind, 'error')
  assert.equal(result.code, 'unknown')
})

test('classifica limite de uso como limit-reached', () => {
  const result = parseCloudSessionOutput("You've hit your weekly limit · resets Wed 2am\r\n")

  assert.deepEqual(
    { kind: result.kind, code: result.code },
    { kind: 'error', code: 'limit-reached' },
  )
})

test('classifica falta de login como login-required', () => {
  const result = parseCloudSessionOutput('Not logged in · Please run /login\r\n')

  assert.deepEqual(
    { kind: result.kind, code: result.code },
    { kind: 'error', code: 'login-required' },
  )
})

test('isFollowUpSent exige a confirmação impressa pelo CLI', () => {
  assert.equal(isFollowUpSent('Sent to cloud session.\r\nSession ID: x'), true)
  assert.equal(isFollowUpSent('Session ID: x'), false)
  assert.equal(isFollowUpSent(''), false)
})

test('isCloudSessionUrl só aceita https://claude.ai/code/session_*', () => {
  assert.equal(isCloudSessionUrl(URL_OK), true)
  assert.equal(isCloudSessionUrl(`https://claude.ai/code/${ID}`), true)
  assert.equal(isCloudSessionUrl(`http://claude.ai/code/${ID}`), false)
  assert.equal(isCloudSessionUrl(`https://claude.ai.evil.example/code/${ID}`), false)
  assert.equal(isCloudSessionUrl(`https://evil.example/?u=https://claude.ai/code/${ID}`), false)
  assert.equal(isCloudSessionUrl(`https://claude.ai/code/${ID}/../../x`), false)
  assert.equal(isCloudSessionUrl('https://claude.ai/code/'), false)
  assert.equal(isCloudSessionUrl(undefined), false)
})

test('CLOUD_SESSION_ERROR_CODES é uma lista congelada com os códigos do spec', () => {
  assert.equal(Object.isFrozen(CLOUD_SESSION_ERROR_CODES), true)
  assert.deepEqual([...CLOUD_SESSION_ERROR_CODES].sort(), [
    'busy',
    'interrupted',
    'invalid-input',
    'limit-reached',
    'login-required',
    'network',
    'repo-too-large',
    'timeout',
    'trust-required',
    'unknown',
  ])
})

test('summarizeTail devolve só as últimas linhas, sem ANSI e sem segredo', () => {
  const linhas = Array.from({ length: 30 }, (_, i) => `linha ${i + 1}`)
  linhas.push('ANTHROPIC_API_KEY=sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789')
  const raw = `\x1b[31m${linhas.join('\r\n')}\x1b[m`

  const tail = summarizeTail(raw, 5)

  assert.equal(tail.split('\n').length, 5)
  assert.match(tail, /linha 30/)
  assert.doesNotMatch(tail, /sk-ant-api03/)
  assert.doesNotMatch(tail, /\x1b/)
})

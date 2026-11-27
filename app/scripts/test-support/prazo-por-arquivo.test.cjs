'use strict'
require('./pasta-do-teste.cjs') // isola o temporário deste arquivo (ver pasta-do-teste.cjs)

/**
 * Roda o executor de verdade numa pasta com testes que nunca terminam. Sem o
 * prazo, o `npm test` espera para sempre: aqui ele precisa falhar em tempo
 * limitado, dizendo o arquivo e o teste.
 */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { test } = require('node:test')

const EXECUTOR = path.resolve(__dirname, '..', 'run-node-unit-tests.cjs')
const LIMITE_MS = 4_000

function rodar(arquivos, env = {}) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-prazo-'))
  fs.mkdirSync(path.join(raiz, 'electron'))
  fs.mkdirSync(path.join(raiz, 'scripts'))
  for (const [nome, corpo] of Object.entries(arquivos)) {
    fs.writeFileSync(path.join(raiz, 'electron', nome), `const test = require('node:test')\n${corpo}\n`)
  }
  const ambiente = { ...process.env, FELIXO_TEST_FILE_TIMEOUT_MS: String(LIMITE_MS), ...env }
  // O executor de dentro é um runner novo, não um arquivo de teste deste.
  delete ambiente.NODE_TEST_CONTEXT
  delete ambiente.NODE_OPTIONS
  const inicio = Date.now()
  const resultado = spawnSync(process.execPath, [EXECUTOR], { cwd: raiz, env: ambiente, encoding: 'utf8', timeout: 60_000 })
  const duracao = Date.now() - inicio
  fs.rmSync(raiz, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
  return { ...resultado, duracao, saida: `${resultado.stdout}${resultado.stderr}` }
}

test('teste preso, laço síncrono e recurso esquecido falham dizendo o arquivo e o teste', () => {
  const r = rodar({
    'preso.test.cjs': "test('espera o que nunca chega', () => new Promise(() => { setInterval(() => {}, 1000) }))",
    'laco.test.cjs': "test('gira para sempre', () => { for (;;) {} })",
    'esquecido.test.cjs': "test('passa e deixa um timer', () => { setInterval(() => {}, 1000) })",
    // Neto com a saída herdada: sem derrubar a árvore, o runner esperaria por ele.
    'neto.test.cjs': "test('deixa um processo filho', () => { require('node:child_process').spawn(process.execPath, ['-e', 'setTimeout(()=>{},120000)'], { stdio: 'inherit' }); return new Promise(() => {}) })",
    'normal.test.cjs': "test('continua verde', () => {})",
  })

  assert.equal(r.error, undefined, `o executor não terminou sozinho:\n${r.saida}`)
  assert.notEqual(r.status, 0)
  assert.match(r.saida, /prazo de 4 s estourado em [^\n]*preso\.test\.cjs\. Testes em andamento: espera o que nunca chega/)
  assert.match(r.saida, /prazo de 4 s estourado em [^\n]*laco\.test\.cjs\. Testes em andamento: gira para sempre/)
  assert.match(r.saida, /prazo de 4 s estourado em [^\n]*esquecido\.test\.cjs\. Nenhum teste em andamento/)
  assert.match(r.saida, /prazo de 4 s estourado em [^\n]*neto\.test\.cjs\. Testes em andamento: deixa um processo filho/)
  assert.match(r.saida, /continua verde/)
  assert.doesNotMatch(r.saida, /estourado em [^\n]*normal\.test\.cjs/)
  assert.ok(r.duracao < 45_000, `demorou ${r.duracao} ms`)
})

test('suíte sem teste preso continua verde', () => {
  const r = rodar({ 'normal.test.cjs': "test('continua verde', () => {})" })

  assert.equal(r.status, 0, r.saida)
  assert.doesNotMatch(r.saida, /estourado/)
})

test('o teto da suíte inteira encerra e diz que foi o tempo', () => {
  const r = rodar(
    { 'preso.test.cjs': "test('espera o que nunca chega', () => new Promise(() => { setInterval(() => {}, 1000) }))" },
    { FELIXO_TEST_FILE_TIMEOUT_MS: '8000', FELIXO_TEST_TOTAL_TIMEOUT_MS: '3000' },
  )

  assert.equal(r.error, undefined, r.saida)
  assert.equal(r.status, 1)
  assert.match(r.saida, /a suíte passou de 3 s/)
})

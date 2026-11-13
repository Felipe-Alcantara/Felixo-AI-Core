'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { BACKENDS, cleanEnv, launchPlan, parseArgs } = require('./record-limit-banner.cjs')

const ACCOUNT_VARS = ['ANTHROPIC_API_KEY', 'CLAUDE_CONFIG_DIR', 'CLAUDE_CODE_OAUTH_TOKEN', 'CODEX_HOME', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY']

test('a gravação não herda conta, chave nem pasta de configuração das CLIs', () => {
  const before = Object.fromEntries(ACCOUNT_VARS.map((key) => [key, process.env[key]]))
  for (const key of ACCOUNT_VARS) process.env[key] = 'da-pessoa'
  try {
    const env = cleanEnv({ CODEX_HOME: 'pasta-da-gravacao' })
    for (const key of ACCOUNT_VARS.filter((key) => key !== 'CODEX_HOME')) assert.equal(env[key], undefined, key)
    assert.equal(env.CODEX_HOME, 'pasta-da-gravacao')
    assert.equal(env.TZ, 'UTC')
    assert.equal(env.TERM, 'xterm-256color')
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

test('cada CLI fala só com o servidor local, com a pasta de configuração da gravação', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'banner-teste-home-'))
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'banner-teste-pasta-'))
  try {
    for (const provider of Object.keys(BACKENDS)) {
      const plan = launchPlan(provider, { baseUrl: 'http://127.0.0.1:9', home, workdir })
      assert.match(JSON.stringify(plan), /127\.0\.0\.1:9/, provider)
      assert.ok(Object.values(plan.env).includes(home), `${provider} usa a pasta de configuração da gravação`)
    }
    // O Claude abre direto no pedido: onboarding feito e a pasta da gravação confiada.
    const claude = JSON.parse(fs.readFileSync(path.join(home, '.claude.json'), 'utf8'))
    assert.equal(claude.hasCompletedOnboarding, true)
    assert.equal(claude.projects[workdir].hasTrustDialogAccepted, true)
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
    fs.rmSync(workdir, { recursive: true, force: true })
  }
})

test('o servidor local responde 429 a cada CLI, como o backend no limite', () => {
  for (const [provider, backend] of Object.entries(BACKENDS)) {
    const response = { status: 0, body: '' }
    backend.respond({
      writeHead: (status) => { response.status = status },
      end: (body) => { response.body = body },
    })
    assert.equal(response.status, 429, provider)
    assert.doesNotThrow(() => JSON.parse(response.body), provider)
  }
})

test('os argumentos aceitam só os três provedores e as opções conhecidas', () => {
  assert.equal(parseArgs(['--provider', 'gemini']).provider, 'gemini')
  assert.throws(() => parseArgs(['--provider', 'openia']), /codex, claude ou gemini/)
  assert.throws(() => parseArgs(['--provider', 'codex', '--conta', 'x']), /Argumento desconhecido/)
})

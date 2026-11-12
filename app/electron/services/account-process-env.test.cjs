'use strict'

/**
 * Painel × terminal: para uma conta com perfil, todo processo auxiliar que
 * mede ou confere a conta (login e uso do painel, uso ao vivo do Claude,
 * /status e app-server do Codex) nasce com o MESMO ambiente do terminal dela
 * (decisão do Felipe, 12/11/2026: "o que é conferido é o que será lançado").
 * O Login do sistema continua com o ambiente da pessoa, chaves incluídas.
 *
 * Cada lado é capturado no ponto de chamada real, com o spawn trocado por um
 * dublê: nada roda CLI de verdade.
 */

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { createAccountCliEnv, createCliEnv } = require('./cli-process-manager.cjs')
const { buildAccountProcessEnv } = require('./cli-account-profiles.cjs')
const { createCliAccountStore } = require('./cli-account-store.cjs')
const { PtyProcessManager } = require('./pty-process-manager.cjs')
const { collectProviderSnapshot } = require('./agent-usage-service.cjs')
const { createClaudeUsageQuery } = require('./claude-usage-query.cjs')
const { createCodexStatusScreenQuery } = require('./codex-status-screen.cjs')
const { runCodexAppServerSession } = require('./codex-app-server-client.cjs')

const SENTINELAS = {
  OPENAI_API_KEY: 'sk-sentinela-openai',
  CODEX_API_KEY: 'sk-sentinela-codex',
  ANTHROPIC_API_KEY: 'sk-ant-sentinela',
  GEMINI_API_KEY: 'sentinela-gemini',
}

/** Troca variáveis do processo durante o teste e devolve quem as restaura. */
function withProcessEnv(values) {
  const previous = Object.fromEntries(Object.keys(values).map((name) => [name, process.env[name]]))
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  return () => {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
}

function fakePty() {
  return { pid: 1, onData() {}, onExit() {}, write() {}, resize() {}, kill() {} }
}

/** Ambiente com que o terminal da conta nasce, pelo PtyProcessManager. */
function terminalEnv(store, account) {
  const calls = []
  const manager = new PtyProcessManager({
    spawnPty: (file, args, options) => {
      calls.push(options.env)
      return fakePty()
    },
    validateAccount: (accountId, providerId) => store.validateAccount(accountId, providerId),
    buildAccountEnv: (accountId, providerId) => store.buildEnv(accountId, providerId),
  })
  try {
    manager.spawn(`terminal-${account.providerId}`, { command: account.providerId, accountId: account.id })
  } finally {
    manager.killAll({ force: true })
  }
  return calls[0]
}

/** Ambientes do painel (login e uso) para a conta, pelo collectProviderSnapshot. */
async function panelEnvs(providerId, profileEnv, targetAccountId) {
  const envs = []
  await collectProviderSnapshot({
    providerId,
    profileEnv,
    targetAccountId,
    probe: () => null,
    now: () => 0,
    runCommand: async ({ env }) => {
      envs.push(env)
      return { ok: false, stdout: '', stderr: 'dublê' }
    },
  })
  return envs
}

/** Ambiente que um consultor ao vivo passou ao spawn (o dublê recusa o spawn logo depois). */
async function captureSpawnEnv(run) {
  let captured = null
  await run((file, args, options) => {
    captured = options.env
    throw new Error('dublê de spawn')
  }).catch(() => {})
  return captured
}

function assertSameEnv(actual, expected, label, extras = []) {
  assert.ok(actual, `${label}: o ambiente não foi capturado`)
  const extraKeys = Object.keys(actual).filter((key) => !(key in expected))
  assert.deepEqual(extraKeys.sort(), [...extras].sort(), `${label}: variáveis a mais que o terminal`)
  for (const [key, value] of Object.entries(expected)) {
    assert.equal(actual[key], value, `${label}: ${key} diferente do terminal`)
  }
}

test('conta com perfil: painel, uso ao vivo, /status e app-server nascem com o ambiente do terminal; o Login do sistema fica intacto', async (t) => {
  const restore = withProcessEnv(SENTINELAS)
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-ambiente-da-conta-'))
  t.after(() => {
    restore()
    fs.rmSync(root, { recursive: true, force: true })
  })
  const store = createCliAccountStore({ userData: path.join(root, 'userData'), homeDir: path.join(root, 'home') })

  for (const providerId of ['codex', 'claude']) {
    const account = store.create({ providerId, label: 'trabalho' })
    const profileEnv = store.buildEnv(account.id, providerId)
    const terminal = terminalEnv(store, account)
    assert.deepEqual(terminal, createAccountCliEnv({ providerId, profileEnv }))

    const panel = await panelEnvs(providerId, profileEnv, account.id)
    assert.ok(panel.length > 0, `${providerId}: o painel não rodou comando nenhum`)
    panel.forEach((env, index) => assertSameEnv(env, terminal, `${providerId}: comando ${index + 1} do painel`))

    // Login do sistema: o painel herda as chaves da pessoa, como o terminal sem conta.
    for (const env of await panelEnvs(providerId, {}, null)) {
      for (const [name, value] of Object.entries(SENTINELAS)) assert.equal(env[name], value, `${providerId}: o Login do sistema perdeu ${name}`)
    }
  }

  const claude = store.list().find((account) => account.providerId === 'claude')
  const claudeTerminal = terminalEnv(store, claude)
  const claudeLive = await captureSpawnEnv((spawnPty) =>
    createClaudeUsageQuery({ spawnPty })({ env: store.buildEnv(claude.id, 'claude'), timeoutMs: 50 }),
  )
  assertSameEnv(claudeLive, claudeTerminal, 'uso ao vivo do Claude', ['CLAUDE_CODE_SKIP_PROMPT_HISTORY'])

  const codex = store.list().find((account) => account.providerId === 'codex')
  const codexTerminal = terminalEnv(store, codex)
  const codexStatus = await captureSpawnEnv((spawnPty) =>
    createCodexStatusScreenQuery({ spawnPty })({ env: store.buildEnv(codex.id, 'codex'), timeoutMs: 50 }),
  )
  assertSameEnv(codexStatus, codexTerminal, '/status do Codex')
  const appServer = await captureSpawnEnv((spawnProcess) =>
    runCodexAppServerSession({ spawnProcess, accountEnv: store.buildEnv(codex.id, 'codex'), timeoutMs: 50, requests: [] }),
  )
  assertSameEnv(appServer, codexTerminal, 'app-server do Codex')
})

test('perfil que troca o HOME (Gemini): o PATH vem da home real, como no terminal, e não da home do perfil', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-ambiente-home-'))
  const realHome = path.join(root, 'home-real')
  const profileHome = path.join(root, 'perfil-gemini')
  // `~/.volta/bin` é uma pasta de CLI que vem da home em todos os sistemas.
  const userCliDir = path.join(realHome, '.volta', 'bin')
  fs.mkdirSync(userCliDir, { recursive: true })
  fs.mkdirSync(profileHome, { recursive: true })
  const restore = withProcessEnv({ HOME: realHome, USERPROFILE: realHome, VOLTA_HOME: undefined })
  t.after(() => {
    restore()
    fs.rmSync(root, { recursive: true, force: true })
  })
  const profileEnv = { HOME: profileHome, USERPROFILE: profileHome }
  const pathOf = (env) => (env[Object.keys(env).find((key) => key.toUpperCase() === 'PATH')] ?? '').split(path.delimiter)

  const account = createAccountCliEnv({ providerId: 'gemini', profileEnv })
  assert.ok(pathOf(account).includes(userCliDir), 'a CLI instalada na home real some do PATH')
  assert.equal(account.HOME, profileHome)
  // O caminho antigo dos comandos de uso montava o PATH com a home do perfil (medido: perdia a pasta).
  assert.equal(pathOf(createCliEnv(buildAccountProcessEnv(process.env, { providerId: 'gemini', profileEnv }))).includes(userCliDir), false)
  // Sem perfil é o Login do sistema: o ambiente do app, sem filtro.
  assert.deepEqual(createAccountCliEnv({ providerId: 'gemini', profileEnv: {} }), createCliEnv())
})

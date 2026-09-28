'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createAccountEligibilityChecker,
  isPanelSampleUsable,
  resolveIdentityStatus,
  resolveLoginStatus,
} = require('./account-eligibility.cjs')
const { ELIGIBILITY_TTL_MS } = require('./account-chain-constants.cjs')
const { STALE_AFTER_MS } = require('../agent-usage-service.cjs')
const { applyProfileEnv } = require('../cli-account-profiles.cjs')
const { createCliEnv } = require('../cli-process-manager.cjs')
const { createIdentityFingerprint } = require('../agent-usage-model.cjs')

const NOW = Date.parse('2026-09-28T12:00:00.000Z')
const CLAUDE_PROFILE = { CLAUDE_CONFIG_DIR: '/perfis/claude-trabalho' }
const CODEX_PROFILE = { CODEX_HOME: '/perfis/codex-pessoal' }

const ACCOUNTS = {
  'claude-trabalho': { accountId: 'claude-trabalho', providerId: 'claude', profileEnv: CLAUDE_PROFILE },
  'claude-pessoal': { accountId: 'claude-pessoal', providerId: 'claude', profileEnv: { CLAUDE_CONFIG_DIR: '/perfis/p' } },
  'codex-pessoal': { accountId: 'codex-pessoal', providerId: 'codex', profileEnv: CODEX_PROFILE },
  'codex-extra': { accountId: 'codex-extra', providerId: 'codex', profileEnv: { CODEX_HOME: '/perfis/x' } },
  'gemini-casa': { accountId: 'gemini-casa', providerId: 'gemini', profileEnv: { HOME: '/perfis/g' } },
  'openia-chave': { accountId: 'openia-chave', providerId: 'openia', profileEnv: { OPENROUTER_API_KEY: 'sk-or-v1-perfil-0123456789' } },
}

function claudeStatus(values) {
  return JSON.stringify({
    loggedIn: true,
    authMethod: 'claude.ai',
    apiProvider: 'firstParty',
    email: 'trabalho@example.com',
    subscriptionType: 'max',
    ...values,
  })
}

function createChecker(overrides = {}) {
  const calls = []
  const checker = createAccountEligibilityChecker({
    resolveAccount: (accountId) => ACCOUNTS[accountId] ?? null,
    now: () => NOW,
    // Sem stub, o probe leria o ~/.codex da máquina que roda o teste.
    probe: () => null,
    runCommand: async (request) => {
      calls.push(request)
      return { ok: true, stdout: claudeStatus(), stderr: '' }
    },
    ...overrides,
  })
  return { checker, calls }
}

test('a janela da elegibilidade é a mesma em que o painel considera a medição atual', () => {
  assert.equal(ELIGIBILITY_TTL_MS, STALE_AFTER_MS)
})

test('login conferido pela CLI vira checagem logged_in com método, plano e identidade', async () => {
  const bound = createIdentityFingerprint('claude', 'trabalho@example.com').identityKey
  const { checker, calls } = createChecker({ getBoundIdentityKey: () => bound })

  const check = await checker.checkLogin('claude-trabalho')

  assert.equal(calls.length, 1)
  assert.equal(calls[0].command, 'claude')
  assert.deepEqual(calls[0].args, ['auth', 'status', '--json'])
  assert.equal(check.status, 'logged_in')
  assert.equal(check.source, 'checagem')
  assert.equal(check.checkedAt, new Date(NOW).toISOString())
  assert.equal(check.method, 'claude.ai')
  assert.equal(check.plan, 'max')
  assert.equal(check.identityKey, bound)
  assert.equal(check.identityStatus, 'matched')
  assert.equal(check.apiKeySourcePresent, false)
  assert.equal(check.billingDetected, null)
  assert.equal(check.multiplierDetected, null)
})

test('Claude sem login sai com código 1 e JSON válido: vira logged_out, não erro', async () => {
  const { checker } = createChecker({
    runCommand: async () => ({
      ok: false,
      message: 'claude terminou com código 1',
      stdout: JSON.stringify({ loggedIn: false, authMethod: 'none', apiProvider: 'firstParty' }),
      stderr: '',
    }),
  })

  const check = await checker.checkLogin('claude-trabalho')

  assert.equal(check.status, 'logged_out')
})

test('CLI ausente, prazo vencido e falha sem saída têm status próprios', async () => {
  const cases = [
    [{ ok: false, errorCode: 'ENOENT', stdout: '', stderr: '' }, 'cli_ausente'],
    // Mesmo com meia resposta no stdout, prazo vencido nunca vira "logada".
    [{ ok: false, timedOut: true, stdout: 'Logged in using ChatGPT', stderr: '' }, 'tempo_esgotado'],
    [{ ok: false, stdout: '', stderr: 'erro inesperado' }, 'erro'],
    [{ ok: true, stdout: 'saída que ninguém entende', stderr: '' }, 'unknown'],
  ]

  for (const [result, expected] of cases) {
    const { checker } = createChecker({ runCommand: async () => result })
    const check = await checker.checkLogin('codex-pessoal', { force: true })
    assert.equal(check.status, expected, JSON.stringify(result))
  }

  const { checker } = createChecker({
    runCommand: async () => {
      throw new Error('spawn falhou')
    },
  })
  assert.equal((await checker.checkLogin('codex-pessoal')).status, 'erro')
})

test('provedor sem comando de login fica sem_checagem e não roda CLI', async () => {
  const { checker, calls } = createChecker()

  const check = await checker.checkLogin('gemini-casa')

  assert.equal(check.status, 'sem_checagem')
  assert.equal(calls.length, 0)
})

test('conta que não existe mais devolve null', async () => {
  const { checker, calls } = createChecker()

  assert.equal(await checker.checkLogin('removida'), null)
  assert.equal(calls.length, 0)
})

test('duas checagens da mesma conta em voo rodam uma CLI só', async () => {
  let release
  const { checker, calls } = createChecker({
    runCommand: (request) => {
      calls.push(request)
      return new Promise((resolve) => {
        release = () => resolve({ ok: true, stdout: claudeStatus(), stderr: '' })
      })
    },
  })

  const first = checker.checkLogin('claude-trabalho')
  const second = checker.checkLogin('claude-trabalho', { force: true })
  await new Promise((resolve) => setImmediate(resolve))
  release()
  const [a, b] = await Promise.all([first, second])

  assert.equal(calls.length, 1)
  assert.deepEqual(a, b)
})

test('nunca roda mais que duas CLIs de checagem ao mesmo tempo', async () => {
  let active = 0
  let peak = 0
  const releases = []
  const { checker } = createChecker({
    runCommand: () => {
      active += 1
      peak = Math.max(peak, active)
      return new Promise((resolve) => {
        releases.push(() => {
          active -= 1
          resolve({ ok: true, stdout: 'Logged in using ChatGPT', stderr: '' })
        })
      })
    },
  })

  const all = Promise.all(
    ['claude-trabalho', 'claude-pessoal', 'codex-pessoal', 'codex-extra'].map((id) => checker.checkLogin(id)),
  )
  for (let round = 0; round < 10; round += 1) {
    await new Promise((resolve) => setImmediate(resolve))
    assert.ok(checker.runningCount() <= 2)
    releases.splice(0).forEach((release) => release())
  }
  await all

  assert.equal(peak, 2)
  assert.equal(checker.runningCount(), 0)
})

test('amostra do painel com login conferido há até 15 min vale como checagem', async () => {
  const identity = createIdentityFingerprint('claude', 'trabalho@example.com').identityKey
  const sample = {
    collectedAt: new Date(NOW - 14 * 60 * 1000).toISOString(),
    observedIdentityKey: identity,
    metadata: { authStatus: 'logged_in', method: 'claude.ai', plan: 'max', apiKeySource: 'ANTHROPIC_API_KEY' },
  }
  const { checker, calls } = createChecker({
    getLatestSample: () => sample,
    getBoundIdentityKey: () => identity,
  })

  const check = await checker.checkLogin('claude-trabalho')

  assert.equal(calls.length, 0)
  assert.equal(check.source, 'amostra_do_painel')
  assert.equal(check.status, 'logged_in')
  assert.equal(check.checkedAt, sample.collectedAt)
  assert.equal(check.identityStatus, 'matched')
  assert.equal(check.apiKeySourcePresent, true)

  // "Conferir login agora" ignora a amostra.
  await checker.checkLogin('claude-trabalho', { force: true })
  assert.equal(calls.length, 1)
})

test('amostra velha, com horário inválido, no futuro ou sem login não é reaproveitada', async () => {
  const samples = [
    { collectedAt: new Date(NOW - 16 * 60 * 1000).toISOString(), metadata: { authStatus: 'logged_in' } },
    { collectedAt: 'ontem', metadata: { authStatus: 'logged_in' } },
    { collectedAt: undefined, metadata: { authStatus: 'logged_in' } },
    { collectedAt: new Date(NOW + 60 * 1000).toISOString(), metadata: { authStatus: 'logged_in' } },
    { collectedAt: new Date(NOW).toISOString(), metadata: { authStatus: 'logged_out' } },
  ]

  for (const sample of samples) {
    assert.equal(isPanelSampleUsable(sample, NOW), false, JSON.stringify(sample))
    const { checker, calls } = createChecker({ getLatestSample: () => sample })
    const check = await checker.checkLogin('claude-trabalho')
    assert.equal(calls.length, 1, JSON.stringify(sample))
    assert.equal(check.source, 'checagem')
  }

  // Falha ao ler o painel só custa rodar a checagem.
  const { checker, calls } = createChecker({
    getLatestSample: () => {
      throw new Error('banco travado')
    },
  })
  await checker.checkLogin('claude-trabalho')
  assert.equal(calls.length, 1)
})

test('a checagem roda com o mesmo ambiente do terminal da conta, sem as chaves herdadas', async (t) => {
  const sentinels = {
    OPENAI_API_KEY: 'sentinela-openai-nao-pode-vazar',
    CODEX_API_KEY: 'sentinela-codex-nao-pode-vazar',
    ANTHROPIC_API_KEY: 'sentinela-anthropic-nao-pode-vazar',
  }
  const previous = {}
  for (const [key, value] of Object.entries(sentinels)) {
    previous[key] = process.env[key]
    process.env[key] = value
  }
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  const { checker, calls } = createChecker({
    runCommand: async (request) => {
      calls.push(request)
      return { ok: true, stdout: 'Logged in using ChatGPT', stderr: '' }
    },
  })

  await checker.checkLogin('codex-pessoal')

  const env = calls[0].env
  assert.equal(env.CODEX_HOME, CODEX_PROFILE.CODEX_HOME)
  assert.equal(env.OPENAI_API_KEY, undefined)
  assert.equal(env.CODEX_API_KEY, undefined)
  // Chave de outro provedor não é da conta Codex: fica como no terminal.
  assert.equal(env.ANTHROPIC_API_KEY, sentinels.ANTHROPIC_API_KEY)
  assert.deepEqual(
    env,
    applyProfileEnv(createCliEnv(), { providerId: 'codex', profileEnv: CODEX_PROFILE }),
  )
})

test('segredo na saída da CLI não aparece na checagem', async () => {
  const token = 'sk-ant-api03-SEGREDO-que-nao-pode-sair-0123456789'
  const { checker } = createChecker({
    runCommand: async () => ({
      ok: true,
      stdout: claudeStatus({ authMethod: `claude.ai Bearer ${token}`, subscriptionType: `max token=${token}` }),
      stderr: `Authorization: Bearer ${token}`,
    }),
  })

  const check = await checker.checkLogin('claude-trabalho')

  assert.doesNotMatch(JSON.stringify(check), /SEGREDO/)
})

test('identidade: vinculada igual, diferente, sem vínculo e ausente', async () => {
  assert.equal(resolveIdentityStatus('a', 'a'), 'matched')
  assert.equal(resolveIdentityStatus('a', 'b'), 'different')
  assert.equal(resolveIdentityStatus('a', null), 'unbound')
  assert.equal(resolveIdentityStatus(null, 'a'), 'missing')

  const other = createIdentityFingerprint('claude', 'outra@example.com').identityKey
  const { checker } = createChecker({ getBoundIdentityKey: () => other })
  assert.equal((await checker.checkLogin('claude-trabalho')).identityStatus, 'different')
})

test('status: falha de processo vence o parser', () => {
  assert.equal(resolveLoginStatus({ supported: false }), 'sem_checagem')
  assert.equal(
    resolveLoginStatus({ supported: true, auth: { authStatus: 'logged_in' }, result: { ok: false, errorCode: 'ENOENT' } }),
    'cli_ausente',
  )
  assert.equal(
    resolveLoginStatus({ supported: true, auth: { authStatus: 'logged_in' }, result: { ok: false, timedOut: true } }),
    'tempo_esgotado',
  )
  assert.equal(resolveLoginStatus({ supported: true, auth: { authStatus: 'logged_out' }, result: { ok: false } }), 'logged_out')
})

test('busca preguiçosa para na primeira conta logada e respeita o teto de checagens', async () => {
  const outputs = {
    'claude-trabalho': { ok: false, stdout: JSON.stringify({ loggedIn: false }), stderr: '' },
    'claude-pessoal': { ok: true, stdout: claudeStatus({ email: 'pessoal@example.com' }), stderr: '' },
  }
  const order = []
  const { checker } = createChecker({
    runCommand: async (request) => {
      const accountId = request.env.CLAUDE_CONFIG_DIR === CLAUDE_PROFILE.CLAUDE_CONFIG_DIR ? 'claude-trabalho' : 'claude-pessoal'
      order.push(accountId)
      return outputs[accountId]
    },
  })

  const result = await checker.checkInOrder(['claude-trabalho', 'claude-pessoal', 'codex-pessoal'])

  assert.equal(result.found.accountId, 'claude-pessoal')
  assert.deepEqual(result.checks.map((check) => check.status), ['logged_out', 'logged_in'])
  assert.deepEqual(order, ['claude-trabalho', 'claude-pessoal'])

  let runs = 0
  const { checker: none } = createChecker({
    runCommand: async () => {
      runs += 1
      return { ok: false, errorCode: 'ENOENT', stdout: '', stderr: '' }
    },
  })
  const empty = await none.checkInOrder(['claude-trabalho', 'claude-pessoal', 'codex-pessoal', 'codex-extra'])
  assert.equal(empty.found, null)
  assert.equal(runs, 3)
})

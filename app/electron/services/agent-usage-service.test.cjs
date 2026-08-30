'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createStorageDatabase } = require('./storage/sqlite-database.cjs')
const { createAgentUsageRepository } = require('./storage/agent-usage-repository.cjs')
const {
  createIdentityFingerprint,
} = require('./agent-usage-model.cjs')
const {
  listAgentUsageSources,
} = require('./agent-usage-sources.cjs')
const {
  createAgentUsageService,
} = require('./agent-usage-service.cjs')

test(
  'agent usage service keeps two Codex accounts isolated and aggregates Claude',
  { skip: hasNodeSqlite() ? false : 'node:sqlite indisponível neste runtime' },
  async () => {
    const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-agent-usage-service-'))
    const database = createStorageDatabase({ databaseDir })
    const repository = createAgentUsageRepository(database)
    const nowValue = { value: Date.parse('2026-08-28T12:00:00.000Z') }
    const catalog = listAgentUsageSources().map((source) => ({
      id: source.id,
      name: source.name,
      provider: source.provider,
      command: source.command,
      detected: true,
      version: 'test',
    }))
    const calls = []
    const alice = createIdentityFingerprint('codex', 'alice@example.com')
    const bob = createIdentityFingerprint('codex', 'bob@example.com')
    const claude = createIdentityFingerprint('claude', 'claude@example.com')

    repository.createAccount({
      id: 'codex-alice',
      providerId: 'codex',
      label: 'Codex Alice',
      identityKey: alice.identityKey,
      identityDisplay: alice.identityDisplay,
      identitySource: 'manual',
    })
    repository.createAccount({
      id: 'codex-bob',
      providerId: 'codex',
      label: 'Codex Bob',
      identityKey: bob.identityKey,
      identityDisplay: bob.identityDisplay,
      identitySource: 'manual',
    })
    repository.createAccount({
      id: 'claude-account',
      providerId: 'claude',
      label: 'Claude principal',
      identityKey: claude.identityKey,
      identityDisplay: claude.identityDisplay,
      identitySource: 'manual',
    })

    const service = createAgentUsageService({
      repository,
      // Sem stub, o probe leria o ~/.codex da máquina que roda o teste.
      probe: () => null,
      now: () => nowValue.value,
      listCatalog: async () => catalog,
      runCommand: async ({ command, args }) => {
        calls.push({ command, args })
        if (command === 'codex') {
          return {
            ok: true,
            stdout: [
              'Logged in using ChatGPT',
              'Account: alice@example.com',
              JSON.stringify({
                rate_limits: {
                  five_hour: { used_percentage: 0, resets_at: 1_800_000_000 },
                },
              }),
            ].join('\n'),
            stderr: '',
          }
        }

        return {
          ok: true,
          stdout: JSON.stringify({
            loggedIn: true,
            email: 'claude@example.com',
            rate_limits: {
              five_hour: { used_percentage: 25, resets_at: '2026-09-01T12:00:00Z' },
            },
          }),
          stderr: '',
        }
      },
    })

    try {
      const result = await service.refresh()
      assert.equal(result.ok, true)
      // Codex e Claude já tinham conta; Openia foi descoberto agora e entrou
      // na rodada com dois comandos (auth e `statusline`). Gemini não consulta
      // nada porque não tem comando de auth.
      assert.equal(calls.length, 4)

      const accounts = new Map(result.accounts.map((account) => [account.id, account]))

      // A descoberta cria uma conta por CLI instalada e não duplica as que já
      // existiam — o Codex continua com as duas contas cadastradas na mão.
      assert.deepEqual(
        countAccountsByProvider(result.accounts),
        { codex: 2, claude: 1, gemini: 1, openia: 1 },
      )
      assert.equal(accounts.get('codex-alice').latestSample.status, 'current')
      assert.equal(accounts.get('codex-alice').latestSample.metrics[0].used, 0)
      assert.equal(accounts.get('codex-bob').latestSample.status, 'error')
      assert.match(accounts.get('codex-bob').latestSample.errorMessage, /outra conta/)
      assert.equal(accounts.get('claude-account').latestSample.status, 'current')
      assert.equal(accounts.get('claude-account').latestSample.metrics[0].used, 25)

      nowValue.value += 16 * 60 * 1000
      const stale = await service.list()
      const staleAlice = stale.accounts.find((account) => account.id === 'codex-alice')
      assert.equal(staleAlice.latestSample.status, 'stale')
      assert.equal(staleAlice.lastKnownSample.metrics[0].used, 0)

      await assert.rejects(
        service.addAccount({
          providerId: 'codex',
          label: 'Não salvar segredo',
          identityHint: 'sk-never-store-this',
        }),
        /chave ou token/,
      )
      assert.doesNotMatch(
        JSON.stringify(database.connection.prepare('SELECT * FROM agent_usage_accounts').all()),
        /sk-never-store-this/,
      )
    } finally {
      database.close()
      fs.rmSync(databaseDir, { recursive: true, force: true })
    }
  },
)

test(
  'agent usage service deduplicates simultaneous refreshes',
  { skip: hasNodeSqlite() ? false : 'node:sqlite indisponível neste runtime' },
  async () => {
    const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-agent-usage-dedupe-'))
    const database = createStorageDatabase({ databaseDir })
    const repository = createAgentUsageRepository(database)
    repository.createAccount({
      id: 'dedupe-account',
      providerId: 'codex',
      label: 'Codex',
    })
    let release
    const gate = new Promise((resolve) => {
      release = resolve
    })
    let calls = 0
    const service = createAgentUsageService({
      repository,
      // Sem stub, o probe leria o ~/.codex da máquina que roda o teste.
      probe: () => null,
      listCatalog: async () => [],
      runCommand: async () => {
        calls += 1
        await gate
        return { ok: true, stdout: 'Logged in using ChatGPT', stderr: '' }
      },
    })

    try {
      const first = service.refresh()
      const second = service.refresh()
      await new Promise((resolve) => setImmediate(resolve))
      assert.equal(calls, 1)
      release()
      await Promise.all([first, second])
      assert.equal(calls, 1)
    } finally {
      release()
      database.close()
      fs.rmSync(databaseDir, { recursive: true, force: true })
    }
  },
)

test(
  'agent usage service keeps last known values when the CLI goes offline',
  { skip: hasNodeSqlite() ? false : 'node:sqlite indisponível neste runtime' },
  async () => {
    const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-agent-usage-offline-'))
    const database = createStorageDatabase({ databaseDir })
    const repository = createAgentUsageRepository(database)
    const identity = createIdentityFingerprint('codex', 'offline@example.com')
    repository.createAccount({
      id: 'offline-account',
      providerId: 'codex',
      label: 'Codex offline',
      identityKey: identity.identityKey,
      identityDisplay: identity.identityDisplay,
    })

    let online = true
    const service = createAgentUsageService({
      repository,
      // Sem stub, o probe leria o ~/.codex da máquina que roda o teste.
      probe: () => null,
      listCatalog: async () => [],
      runCommand: async () =>
        online
          ? {
              ok: true,
              stdout: [
                'Logged in using ChatGPT',
                'Account: offline@example.com',
                JSON.stringify({
                  rate_limits: {
                    five_hour: { used_percentage: 12, resets_at: 1_800_000_000 },
                  },
                }),
              ].join('\n'),
              stderr: '',
            }
          : {
              ok: false,
              stdout: '',
              stderr: 'Authorization: Bearer sk-never-return-this',
            },
    })

    try {
      const first = await service.refresh()
      assert.equal(first.accounts[0].latestSample.status, 'current')
      assert.equal(first.accounts[0].lastKnownSample.metrics[0].used, 12)

      online = false
      const second = await service.refresh()
      assert.equal(second.accounts[0].latestSample.status, 'error')
      assert.equal(second.accounts[0].lastKnownSample.metrics[0].used, 12)
      assert.doesNotMatch(JSON.stringify(second), /sk-never-return-this/)
    } finally {
      database.close()
      fs.rmSync(databaseDir, { recursive: true, force: true })
    }
  },
)

test(
  'agent usage service does not bind multiple unlabelled accounts ambiguously',
  { skip: hasNodeSqlite() ? false : 'node:sqlite indisponível neste runtime' },
  async () => {
    const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-agent-usage-ambiguous-'))
    const database = createStorageDatabase({ databaseDir })
    const repository = createAgentUsageRepository(database)
    repository.createAccount({
      id: 'ambiguous-one',
      providerId: 'codex',
      label: 'Codex 1',
    })
    repository.createAccount({
      id: 'ambiguous-two',
      providerId: 'codex',
      label: 'Codex 2',
    })

    const service = createAgentUsageService({
      repository,
      // Sem stub, o probe leria o ~/.codex da máquina que roda o teste.
      probe: () => null,
      listCatalog: async () => [],
      runCommand: async () => ({
        ok: true,
        stdout: [
          'Logged in using ChatGPT',
          'Account: someone@example.com',
          JSON.stringify({ quota: { requests: { used: 1, limit: 3, remaining: 2 } } }),
        ].join('\n'),
        stderr: '',
      }),
    })

    try {
      const result = await service.refresh()
      for (const account of result.accounts) {
        assert.equal(account.identityKey, null)
        assert.equal(account.latestSample.status, 'error')
        assert.match(account.latestSample.errorMessage, /mais de uma conta sem identidade/)
        assert.deepEqual(account.latestSample.metrics, [])
      }
    } finally {
      database.close()
      fs.rmSync(databaseDir, { recursive: true, force: true })
    }
  },
)

test(
  'agent usage service keeps history isolated after the CLI account changes',
  { skip: hasNodeSqlite() ? false : 'node:sqlite indisponível neste runtime' },
  async () => {
    const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-agent-usage-switch-'))
    const database = createStorageDatabase({ databaseDir })
    const repository = createAgentUsageRepository(database)
    const alice = createIdentityFingerprint('codex', 'switch-alice@example.com')
    const bob = createIdentityFingerprint('codex', 'switch-bob@example.com')
    repository.createAccount({
      id: 'switch-alice',
      providerId: 'codex',
      label: 'Alice',
      identityKey: alice.identityKey,
      identityDisplay: alice.identityDisplay,
    })
    repository.createAccount({
      id: 'switch-bob',
      providerId: 'codex',
      label: 'Bob',
      identityKey: bob.identityKey,
      identityDisplay: bob.identityDisplay,
    })

    let activeAccount = 'switch-alice@example.com'
    const service = createAgentUsageService({
      repository,
      // Sem stub, o probe leria o ~/.codex da máquina que roda o teste.
      probe: () => null,
      listCatalog: async () => [],
      runCommand: async () => ({
        ok: true,
        stdout: [
          'Logged in using ChatGPT',
          `Account: ${activeAccount}`,
          JSON.stringify({
            quota: { requests: { used: activeAccount.startsWith('switch-a') ? 2 : 7, limit: 10 } },
          }),
        ].join('\n'),
        stderr: '',
      }),
    })

    try {
      const first = await service.refresh()
      assert.equal(first.accounts.find((account) => account.id === 'switch-alice').latestSample.status, 'current')
      assert.equal(first.accounts.find((account) => account.id === 'switch-bob').latestSample.status, 'error')

      activeAccount = 'switch-bob@example.com'
      const second = await service.refresh()
      const accounts = new Map(second.accounts.map((account) => [account.id, account]))
      assert.equal(accounts.get('switch-alice').latestSample.status, 'error')
      assert.equal(accounts.get('switch-bob').latestSample.status, 'current')
      assert.equal(accounts.get('switch-bob').latestSample.metrics[0].used, 7)
      assert.equal(accounts.get('switch-alice').lastKnownSample.metrics[0].used, 2)
    } finally {
      database.close()
      fs.rmSync(databaseDir, { recursive: true, force: true })
    }
  },
)

test(
  'CLI sem sessão aparece como indisponível, não como erro',
  { skip: hasNodeSqlite() ? false : 'node:sqlite indisponível neste runtime' },
  async () => {
    const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-agent-usage-logout-'))
    const database = createStorageDatabase({ databaseDir })
    const repository = createAgentUsageRepository(database)

    repository.createAccount({
      id: 'openia-account',
      providerId: 'openia',
      label: 'Openia',
    })

    const service = createAgentUsageService({
      repository,
      probe: () => null,
      listCatalog: async () => [],
      runCommand: async ({ args }) =>
        args.includes('statusline')
          ? { ok: true, stdout: 'openia: sem chave', stderr: '' }
          : {
              ok: true,
              stdout: JSON.stringify({ configured: false, active: null, storedKeys: 0 }),
              stderr: '',
            },
    })

    try {
      const result = await service.refresh()
      const sample = result.accounts[0].latestSample

      // Não estar logado é ausência de dado, não falha: um selo de erro aqui
      // faria a pessoa procurar defeito onde só falta entrar na conta.
      assert.equal(sample.status, 'unavailable')
      assert.match(sample.errorMessage, /não há uma sessão autenticada/)
      assert.deepEqual(sample.metrics, [])
    } finally {
      database.close()
      fs.rmSync(databaseDir, { recursive: true, force: true })
    }
  },
)

test(
  'conta única fica com a métrica mesmo quando a CLI não publica identidade',
  { skip: hasNodeSqlite() ? false : 'node:sqlite indisponível neste runtime' },
  async () => {
    const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-agent-usage-anonima-'))
    const database = createStorageDatabase({ databaseDir })
    const repository = createAgentUsageRepository(database)

    repository.createAccount({
      id: 'openia-unica',
      providerId: 'openia',
      label: 'Openia',
    })

    const service = createAgentUsageService({
      repository,
      probe: () => null,
      listCatalog: async () => [],
      // O launcher lê a chave do ambiente: informa que está configurado, mas
      // não tem nome de conta para publicar.
      runCommand: async ({ args }) =>
        args.includes('statusline')
          ? {
              ok: true,
              stdout: 'OpenRouter  usado $0.4210  ·  resta $4.58  (de $5.00)',
              stderr: '',
            }
          : {
              ok: true,
              stdout: JSON.stringify({ configured: true, active: null, storedKeys: 0 }),
              stderr: '',
            },
    })

    try {
      const result = await service.refresh()
      const sample = result.accounts[0].latestSample

      assert.equal(sample.status, 'current')
      assert.equal(sample.metrics[0].used, 0.421)
      assert.equal(sample.metrics[0].limit, 5)
    } finally {
      database.close()
      fs.rmSync(databaseDir, { recursive: true, force: true })
    }
  },
)

test(
  'conta gravada com identificador abreviado passa a mostrar o e-mail inteiro',
  { skip: hasNodeSqlite() ? false : 'node:sqlite indisponível neste runtime' },
  async () => {
    const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-agent-usage-display-'))
    const database = createStorageDatabase({ databaseDir })
    const repository = createAgentUsageRepository(database)
    const identity = createIdentityFingerprint('claude', 'alice@example.com')

    // Como as contas nasciam antes: fingerprint certo, exibição abreviada.
    repository.createAccount({
      id: 'claude-antiga',
      providerId: 'claude',
      label: 'Claude',
      identityKey: identity.identityKey,
      identityDisplay: 'a***@example.com',
      identitySource: 'cli',
    })

    const service = createAgentUsageService({
      repository,
      probe: () => null,
      listCatalog: async () => [],
      runCommand: async () => ({
        ok: true,
        stdout: JSON.stringify({ loggedIn: true, email: 'alice@example.com' }),
        stderr: '',
      }),
    })

    try {
      const result = await service.refresh()

      assert.equal(result.accounts[0].identityDisplay, 'alice@example.com')
      // O fingerprint não muda: é a mesma conta, só o texto exibido mudou.
      assert.equal(result.accounts[0].identityKey, identity.identityKey)
    } finally {
      database.close()
      fs.rmSync(databaseDir, { recursive: true, force: true })
    }
  },
)

test(
  'cada conta com login próprio mostra a quota da pasta dela',
  { skip: hasNodeSqlite() ? false : 'node:sqlite indisponível neste runtime' },
  async () => {
    const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-usage-perfis-'))
    const database = createStorageDatabase({ databaseDir })
    const repository = createAgentUsageRepository(database)

    // Duas contas com login próprio, cada uma com um número diferente.
    const perfis = [
      { id: 'conta-pessoal', providerId: 'codex', label: 'pessoal', probeOptions: { codexHome: '/perfis/pessoal' } },
      { id: 'conta-trabalho', providerId: 'codex', label: 'trabalho', probeOptions: { codexHome: '/perfis/trabalho' } },
    ]
    const porPasta = {
      '/perfis/pessoal': 11,
      '/perfis/trabalho': 77,
    }

    const service = createAgentUsageService({
      repository,
      listCatalog: async () => [],
      listProfiles: () => perfis,
      probe: (_id, options) => {
        const usado = porPasta[options?.codexHome]

        if (usado === undefined) {
          return null
        }

        return {
          ok: true,
          collectedAt: '2026-08-30T00:00:00.000Z',
          metrics: [
            {
              key: 'primary',
              label: 'Últimas 5 h',
              used: usado,
              limit: 100,
              remaining: 100 - usado,
              unit: '%',
              precision: 'reported',
              resetAt: null,
            },
          ],
          identity: null,
          plan: 'plus',
          message: null,
        }
      },
      runCommand: async () => ({ ok: true, stdout: 'Logged in using ChatGPT', stderr: '' }),
    })

    try {
      const resultado = await service.refresh()
      const porConta = new Map(resultado.accounts.map((c) => [c.id, c]))

      // O número de cada linha vem da pasta daquela conta — sem adivinhar
      // identidade, porque a origem da amostra já diz de quem ela é.
      assert.equal(porConta.get('conta-pessoal').latestSample.metrics[0].used, 11)
      assert.equal(porConta.get('conta-trabalho').latestSample.metrics[0].used, 77)
      assert.equal(porConta.get('conta-pessoal').label, 'pessoal')

      // A linha do login do sistema não pode virar "identidade ambígua" só
      // porque existem contas de perfil sem identidade ao lado dela.
      const doSistema = resultado.accounts.find(
        (c) => c.providerId === 'codex' && !c.id.startsWith('conta-'),
      )
      assert.notEqual(doSistema?.latestSample?.status, 'error')
    } finally {
      database.close()
      fs.rmSync(databaseDir, { recursive: true, force: true })
    }
  },
)

function countAccountsByProvider(accounts) {
  return accounts.reduce((total, account) => {
    total[account.providerId] = (total[account.providerId] ?? 0) + 1
    return total
  }, {})
}

function hasNodeSqlite() {
  try {
    require('node:sqlite')
    return true
  } catch {
    return false
  }
}

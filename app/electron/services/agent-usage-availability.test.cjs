'use strict'

/**
 * Disponibilidade em runtime do painel de Limites: a segunda camada, em cima da
 * capability estática da fonte (`classifyUsageCapability`), que junta a fonte com
 * o resultado da última rodada. Cobre a razão da falha (sessão deslogada, rede,
 * CLI ausente, tempo esgotado), o que o painel mostra quando a rodada traz
 * número para uma conta e erro para outra do mesmo provider, e a leitura
 * parcial. Comandos e consultas são falsos: o que se prova aqui é a decisão do
 * serviço, não a CLI de verdade (ver `GUIA-CONTAS-E-LIMITES.md`).
 */

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createStorageDatabase } = require('./storage/sqlite-database.cjs')
const { createAgentUsageRepository } = require('./storage/agent-usage-repository.cjs')
const {
  AVAILABILITY_MESSAGES,
  FAILURE_REASONS,
  classifyFailureReason,
  describeAvailability,
  normalizeSample,
} = require('./agent-usage-model.cjs')
const { getAgentUsageSource } = require('./agent-usage-sources.cjs')
const { createAgentUsageService } = require('./agent-usage-service.cjs')

const COM_SQLITE = { skip: hasNodeSqlite() ? false : 'node:sqlite indisponível neste runtime' }

// ---------------------------------------------------------------- modelo puro

test('classifyFailureReason: cada sinal de falha vira uma razão, e o que não se reconhece fica genérico', () => {
  const casos = [
    [{ authStatus: 'logged_out' }, 'auth-required'],
    [{ authStatus: 'logged_out', errorCode: 'ENOENT' }, 'auth-required'],
    [{ errorCode: 'ENOENT' }, 'cli-missing'],
    [{ timedOut: true }, 'timeout'],
    [{ aborted: true }, 'timeout'],
    [{ text: 'A consulta de limites do Codex excedeu o tempo limite.' }, 'timeout'],
    [{ text: 'getaddrinfo ENOTFOUND chatgpt.com' }, 'network-disabled'],
    [{ text: 'error sending request for url (https://chatgpt.com/backend-api/wham/usage)' }, 'network-disabled'],
    [{ text: 'connect ECONNREFUSED 127.0.0.1:443' }, 'network-disabled'],
    // Assinatura explícita de rede ganha da inferência por tempo esgotado.
    [{ timedOut: true, text: 'connect ETIMEDOUT 1.2.3.4:443' }, 'network-disabled'],
    [{ text: 'resposta em formato inválido' }, 'query-failed'],
    [{}, 'query-failed'],
    [undefined, 'query-failed'],
  ]

  for (const [entrada, esperado] of casos) {
    assert.equal(classifyFailureReason(entrada), esperado, JSON.stringify(entrada))
  }
  for (const [, razao] of casos) {
    assert.ok(FAILURE_REASONS.has(razao), razao)
  }
})

test('classifyFailureReason: texto patológico de 1 MB não trava (sem regex quadrática)', () => {
  const inicio = process.hrtime.bigint()
  classifyFailureReason({ text: 'a.'.repeat(5e5) })
  classifyFailureReason({ text: 'e'.repeat(1e6) })
  const ms = Number(process.hrtime.bigint() - inicio) / 1e6
  assert.ok(ms < 1500, `levou ${ms.toFixed(0)} ms`)
})

test('toda razão de falha tem mensagem em português que diz o que fazer ou o que aconteceu', () => {
  for (const razao of FAILURE_REASONS) {
    const mensagem = AVAILABILITY_MESSAGES[razao]
    assert.equal(typeof mensagem, 'string', razao)
    assert.ok(mensagem.length > 20 && mensagem.length < 200, `${razao}: ${mensagem}`)
    assert.match(mensagem, /\.$/, `${razao} deve ser uma frase completa`)
  }
})

test('describeAvailability: capability estática vence; depois a razão da última rodada; sem razão, nada a avisar', () => {
  const sem = (caso) => describeAvailability(caso)
  assert.deepEqual(sem({ capability: 'unsupported', limitation: 'Sem fonte.', latestSample: null }), {
    state: 'unsupported',
    message: 'Sem fonte.',
  })
  assert.deepEqual(sem({ capability: 'interactive-only', limitation: 'Só no /stats.', latestSample: null }), {
    state: 'interactive-only',
    message: 'Só no /stats.',
  })

  const disponivel = { state: 'available', message: null }
  assert.deepEqual(sem({ capability: 'available', latestSample: null }), disponivel)
  assert.deepEqual(
    sem({ capability: 'available', latestSample: { status: 'current', metrics: [{}], metadata: {} } }),
    disponivel,
  )
  // Erro sem razão classificada (identidade ambígua, por exemplo): a mensagem da própria amostra segue valendo.
  assert.deepEqual(sem({ capability: 'available', latestSample: { status: 'error', metrics: [], metadata: {} } }), disponivel)

  for (const razao of FAILURE_REASONS) {
    const status = razao === 'auth-required' ? 'unavailable' : 'error'
    assert.deepEqual(
      sem({ capability: 'available', latestSample: { status, metrics: [], metadata: { failureReason: razao } } }),
      { state: razao, message: AVAILABILITY_MESSAGES[razao] },
    )
  }
})

test('a razão da falha atravessa o normalizador só quando é uma das conhecidas', () => {
  const base = { id: 'amostra-1', accountId: 'a', sourceKind: 'live-query', sourceLabel: 'x', collectedAt: '2026-10-26T12:00:00.000Z', status: 'error' }
  assert.equal(normalizeSample({ ...base, metadata: { failureReason: 'network-disabled' } }).metadata.failureReason, 'network-disabled')
  assert.equal(normalizeSample({ ...base, metadata: { failureReason: 'inventada' } }).metadata.failureReason, undefined)
  assert.equal(normalizeSample({ ...base, metadata: { failureReason: 'sk-ant-api03-0123456789abcdef' } }).metadata.failureReason, undefined)
})

test('o Gemini declara a limitação com o motivo de 18/06/2026, inteira o bastante para atravessar o normalizador', () => {
  const fonte = getAgentUsageSource('gemini')
  // O normalizador corta metadata em 240 caracteres: a limitação não pode ser truncada.
  assert.ok(fonte.usage.limitation.length <= 240, `${fonte.usage.limitation.length} caracteres`)
  assert.match(fonte.usage.limitation, /18\/06\/2026/)
  assert.match(fonte.usage.limitation, /\/stats model/)
  assert.match(fonte.usage.limitation, /Antigravity/)
})

// -------------------------------------------------------------------- serviço

function criarServico({
  perfis,
  runCommand,
  queryLiveUsage,
  refreshDeadlineMs,
  maxConcurrent,
  agora = { valor: Date.parse('2026-10-26T12:00:00.000Z') },
}) {
  const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-usage-disponibilidade-'))
  const database = createStorageDatabase({ databaseDir })
  const repository = createAgentUsageRepository(database)
  const service = createAgentUsageService({
    repository,
    probe: () => null,
    now: () => agora.valor,
    listCatalog: async () => [],
    listProfiles: () => perfis,
    runCommand,
    queryLiveUsage,
    ...(refreshDeadlineMs ? { refreshDeadlineMs } : {}),
    ...(maxConcurrent ? { maxConcurrent } : {}),
  })
  return {
    service,
    repository,
    agora,
    limpar: () => {
      database.close()
      fs.rmSync(databaseDir, { recursive: true, force: true })
    },
  }
}

const perfilCodex = (id) => ({
  id,
  providerId: 'codex',
  label: id,
  probeOptions: { codexHome: `/perfis/${id}` },
  profileEnv: { CODEX_HOME: `/perfis/${id}` },
})
const perfilClaude = (id) => ({
  id,
  providerId: 'claude',
  label: id,
  profileEnv: { CLAUDE_CONFIG_DIR: `/perfis/${id}` },
})
const pasta = (env) => env?.CODEX_HOME ?? env?.CLAUDE_CONFIG_DIR ?? ''

const loginCodexOk = (env) => ({ ok: true, stdout: `Logged in using ChatGPT\nAccount: ${path.basename(pasta(env))}@example.com`, stderr: '' })
const metricas = (...chaves) =>
  chaves.map((chave, indice) => ({
    key: chave,
    label: chave,
    used: 10 + indice,
    limit: 100,
    remaining: 90 - indice,
    unit: '%',
    precision: 'percentage',
    resetAt: null,
  }))
const usoOk = (...chaves) => ({
  ok: true,
  collectedAt: '2026-10-26T12:00:00.000Z',
  measuredAt: '2026-10-26T12:00:00.000Z',
  metrics: metricas(...chaves),
  details: null,
  message: null,
})

function contaDoPainel(dashboard, id) {
  return dashboard.accounts.find((conta) => conta.id === id)
}

test(
  'Claude deslogado (a CLI sai com código 1 e imprime o JSON) é "sessão ausente", não erro de consulta',
  COM_SQLITE,
  async () => {
    let consultasAoVivo = 0
    const { service, limpar } = criarServico({
      perfis: [perfilClaude('claude-a')],
      runCommand: async () => ({ ok: false, stdout: JSON.stringify({ loggedIn: false, authMethod: 'none' }), stderr: '' }),
      queryLiveUsage: { 'claude-status': async () => { consultasAoVivo += 1; return usoOk('rate_limits.five_hour') } },
    })

    try {
      const conta = contaDoPainel(await service.refresh(), 'claude-a')

      assert.equal(conta.latestSample.status, 'unavailable', 'deslogado não é falha da CLI: selo de erro faria procurar defeito onde só falta entrar')
      assert.equal(conta.latestSample.metadata.authStatus, 'logged_out')
      assert.equal(conta.latestSample.metadata.failureReason, 'auth-required')
      assert.deepEqual(conta.availability, { state: 'auth-required', message: AVAILABILITY_MESSAGES['auth-required'] })
      // Conta com perfil deslogada tem login a fazer, não "número a registrar abrindo um terminal".
      assert.match(conta.latestSample.errorMessage, /não há uma sessão autenticada/)
      assert.equal(consultasAoVivo, 0, 'sem sessão a consulta ao vivo nem abre')
    } finally {
      limpar()
    }
  },
)

test(
  'Codex deslogado ("Not logged in", código 1) também vira "sessão ausente"; a conta dele não herda número de outra',
  COM_SQLITE,
  async () => {
    const { service, limpar } = criarServico({
      perfis: [perfilCodex('codex-a'), perfilCodex('codex-b')],
      runCommand: async ({ env }) =>
        pasta(env).endsWith('codex-b') ? { ok: false, stdout: 'Not logged in', stderr: '' } : loginCodexOk(env),
      queryLiveUsage: { 'codex-rate-limits': async () => usoOk('rate_limits.seven_day') },
    })

    try {
      const painel = await service.refresh()
      const a = contaDoPainel(painel, 'codex-a')
      const b = contaDoPainel(painel, 'codex-b')

      assert.equal(a.latestSample.status, 'current')
      assert.deepEqual(a.availability, { state: 'available', message: null })
      assert.equal(b.latestSample.status, 'unavailable')
      assert.deepEqual(b.latestSample.metrics, [])
      assert.equal(b.availability.state, 'auth-required')
    } finally {
      limpar()
    }
  },
)

test(
  'rodada parcial no mesmo provider: uma conta traz número, a outra falha de um jeito próprio, e cada uma mostra o que é dela',
  COM_SQLITE,
  async () => {
    const perfis = [perfilCodex('codex-ok'), perfilCodex('codex-rede'), perfilCodex('codex-lenta'), perfilCodex('codex-quebrada')]
    const { service, limpar } = criarServico({
      perfis,
      runCommand: async ({ env }) => loginCodexOk(env),
      queryLiveUsage: {
        'codex-rate-limits': async ({ env }) => {
          const id = path.basename(pasta(env))
          if (id === 'codex-rede') return { ok: false, message: 'Codex: getaddrinfo ENOTFOUND chatgpt.com' }
          if (id === 'codex-lenta') return { ok: false, message: 'A consulta de limites do Codex excedeu o tempo limite.' }
          if (id === 'codex-quebrada') return { ok: false, message: 'A resposta do app-server do Codex veio em formato inválido.' }
          return usoOk('rate_limits.five_hour', 'rate_limits.seven_day')
        },
      },
    })

    try {
      const painel = await service.refresh()
      const porId = Object.fromEntries(perfis.map((perfil) => [perfil.id, contaDoPainel(painel, perfil.id)]))

      assert.equal(porId['codex-ok'].latestSample.status, 'current')
      assert.equal(porId['codex-ok'].latestSample.metrics.length, 2)
      assert.equal(porId['codex-ok'].availability.state, 'available')
      // Conta de perfil tem pasta de login própria: o painel abre o terminal dela com o `accountId`.
      assert.equal(porId['codex-ok'].ownLogin, true)

      for (const [id, estado] of [['codex-rede', 'network-disabled'], ['codex-lenta', 'timeout'], ['codex-quebrada', 'query-failed']]) {
        assert.equal(porId[id].latestSample.status, 'error', id)
        assert.deepEqual(porId[id].latestSample.metrics, [], `${id} não pode herdar o número da conta que deu certo`)
        assert.equal(porId[id].availability.state, estado, id)
        assert.equal(porId[id].availability.message, AVAILABILITY_MESSAGES[estado], id)
      }
    } finally {
      limpar()
    }
  },
)

test(
  'rede cai na rodada seguinte: a conta guarda o último valor conhecido e o painel sabe que o que está na tela não é a última leitura',
  COM_SQLITE,
  async () => {
    const perfis = [perfilCodex('codex-a'), perfilCodex('codex-b')]
    const rede = { fora: false }
    const { service, agora, limpar } = criarServico({
      perfis,
      runCommand: async ({ env }) => loginCodexOk(env),
      queryLiveUsage: {
        'codex-rate-limits': async ({ env }) => {
          const id = path.basename(pasta(env))
          return rede.fora && id === 'codex-a'
            ? { ok: false, message: 'error sending request for url (https://chatgpt.com/backend-api/wham/usage)' }
            : usoOk('rate_limits.seven_day')
        },
      },
    })

    try {
      const primeira = await service.refresh()
      const medidaAntes = contaDoPainel(primeira, 'codex-a').latestSample

      rede.fora = true
      agora.valor += 60_000
      const segunda = await service.refresh()
      const a = contaDoPainel(segunda, 'codex-a')
      const b = contaDoPainel(segunda, 'codex-b')

      assert.equal(a.latestSample.status, 'error')
      assert.equal(a.availability.state, 'network-disabled')
      assert.equal(a.lastKnownSample.id, medidaAntes.id, 'o último valor conhecido é a leitura da rodada anterior')
      assert.notEqual(a.lastKnownSample.id, a.latestSample.id, 'o painel decide marcar "último valor conhecido" por esta diferença')
      assert.equal(b.latestSample.status, 'current')
      assert.equal(b.lastKnownSample.id, b.latestSample.id, 'a conta que respondeu mostra a leitura nova')
    } finally {
      limpar()
    }
  },
)

test(
  'logout depois de uma leitura boa: a conta passa a "sessão ausente" e o último valor conhecido continua sendo o dela',
  COM_SQLITE,
  async () => {
    const sessao = { ativa: true }
    const { service, agora, limpar } = criarServico({
      perfis: [perfilCodex('codex-a')],
      runCommand: async ({ env }) => (sessao.ativa ? loginCodexOk(env) : { ok: false, stdout: 'Not logged in', stderr: '' }),
      queryLiveUsage: { 'codex-rate-limits': async () => usoOk('rate_limits.seven_day') },
    })

    try {
      const antes = contaDoPainel(await service.refresh(), 'codex-a')
      sessao.ativa = false
      agora.valor += 60_000
      const depois = contaDoPainel(await service.refresh(), 'codex-a')

      assert.equal(depois.availability.state, 'auth-required')
      assert.equal(depois.latestSample.status, 'unavailable')
      assert.equal(depois.lastKnownSample.id, antes.latestSample.id)
      assert.equal(depois.lastKnownSample.metrics.length, 1)
    } finally {
      limpar()
    }
  },
)

test(
  'CLI ausente (ENOENT) e comando que estoura o tempo viram razões próprias, e a razão não carrega a saída crua',
  COM_SQLITE,
  async () => {
    const perfis = [perfilClaude('claude-sem-cli'), perfilCodex('codex-lento')]
    const { service, limpar } = criarServico({
      perfis,
      runCommand: async ({ env }) =>
        env?.CLAUDE_CONFIG_DIR
          ? { ok: false, errorCode: 'ENOENT', message: 'spawn claude ENOENT', stdout: '', stderr: '' }
          : { ok: false, timedOut: true, message: 'codex excedeu o tempo limite de execucao.', stdout: '', stderr: '' },
      queryLiveUsage: {},
    })

    try {
      const painel = await service.refresh()
      const semCli = contaDoPainel(painel, 'claude-sem-cli')
      const lento = contaDoPainel(painel, 'codex-lento')

      assert.equal(semCli.availability.state, 'cli-missing')
      assert.equal(lento.availability.state, 'timeout')
      assert.doesNotMatch(JSON.stringify(painel), /spawn claude ENOENT/)
    } finally {
      limpar()
    }
  },
)

// Dois caminhos até o mesmo estado: a consulta em voo quando o teto dispara (vários
// slots) e a conta que ainda esperava na fila (um slot só, ocupado pela rodada do
// sistema, que também trava).
for (const [cenario, maxConcurrent] of [['com a consulta em voo', 4], ['esperando na fila', 1]]) {
  test(
    `consulta ao vivo que nunca responde: o teto da rodada vira "timeout" na conta ${cenario}`,
    COM_SQLITE,
    async () => {
      const { service, limpar } = criarServico({
        perfis: [perfilClaude('claude-a'), perfilClaude('claude-b')],
        refreshDeadlineMs: 150,
        maxConcurrent,
        runCommand: async ({ env }) => ({ ok: true, stdout: JSON.stringify({ loggedIn: true, email: `${path.basename(pasta(env))}@example.com` }), stderr: '' }),
        queryLiveUsage: { 'claude-status': () => new Promise(() => {}) },
      })

      try {
        const painel = await service.refresh()

        for (const id of ['claude-a', 'claude-b']) {
          const conta = contaDoPainel(painel, id)
          assert.equal(conta.latestSample.status, 'error', id)
          assert.deepEqual(conta.availability, { state: 'timeout', message: AVAILABILITY_MESSAGES.timeout }, id)
        }
      } finally {
        limpar()
      }
    },
  )
}

test(
  'leitura parcial: a fonte trouxe só uma das janelas, e a outra fica ausente em vez de virar 0%',
  COM_SQLITE,
  async () => {
    const { service, limpar } = criarServico({
      perfis: [perfilCodex('codex-a')],
      runCommand: async ({ env }) => loginCodexOk(env),
      queryLiveUsage: { 'codex-rate-limits': async () => usoOk('rate_limits.five_hour') },
    })

    try {
      const conta = contaDoPainel(await service.refresh(), 'codex-a')

      assert.equal(conta.latestSample.status, 'current')
      assert.deepEqual(conta.latestSample.metrics.map((metrica) => metrica.key), ['rate_limits.five_hour'])
      assert.equal(conta.availability.state, 'available')
    } finally {
      limpar()
    }
  },
)

test(
  'Gemini sem fonte: capability "interactive-only" com a limitação como mensagem, amostra indisponível e nenhuma barra',
  COM_SQLITE,
  async () => {
    const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-usage-gemini-'))
    const database = createStorageDatabase({ databaseDir })
    const repository = createAgentUsageRepository(database)
    repository.createAccount({ id: 'gemini-conta', providerId: 'gemini', label: 'Gemini' })
    const service = createAgentUsageService({
      repository,
      probe: () => null,
      listCatalog: async () => [],
      listProfiles: () => [],
      runCommand: async () => ({ ok: true, stdout: '', stderr: '' }),
    })

    try {
      const conta = contaDoPainel(await service.refresh(), 'gemini-conta')
      const fonte = getAgentUsageSource('gemini')

      assert.equal(conta.latestSample.status, 'unavailable')
      assert.deepEqual(conta.latestSample.metrics, [])
      assert.deepEqual(conta.availability, { state: 'interactive-only', message: fonte.usage.limitation })
      assert.equal(conta.ownLogin, false, 'conta sem perfil usa o login do sistema')
    } finally {
      database.close()
      fs.rmSync(databaseDir, { recursive: true, force: true })
    }
  },
)

function hasNodeSqlite() {
  try {
    require('node:sqlite')
    return true
  } catch {
    return false
  }
}

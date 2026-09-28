'use strict'

/**
 * Matriz de falhas injetadas da cadeia de contas (plano, §13.2 e §13.3).
 *
 * Tudo aqui é módulo REAL, ligado como o processo principal liga: o
 * `PtyProcessManager` (com `spawnPty` falso, que só conta processos), a vigia
 * de saída com agendador manual, a taxonomia, o serviço da cadeia com a porta
 * real da política e dos fatos da conta (`account-chain-port.cjs`, como o
 * `account-chain-runtime.cjs` liga), o `pty:spawn` real com `chainTicket`
 * (`pty-ipc-handlers.cjs`, com o `ipcMain` do Electron trocado por um
 * registro), o `setAccountMode`/`lastOutputAt`/`lineageId` reais do manager e
 * o repositório da migration 017 num SQLite de arquivo temporário. Os pedaços
 * de saída são injetados no PTY falso; nenhuma CLI real roda.
 *
 * O que a matriz prova (decisões 1 e 6 do dono):
 * - nenhuma classe de falha abre processo sem `confirm` + ticket;
 * - rede, provedor, tempo e cancelado nunca põem conta em espera nem propõem;
 * - 403 é ambíguo e pede escolha;
 * - teto de saltos e deduplicação impedem laço e repetição;
 * - reinício invalida o pendente sem executar;
 * - o ticket vale uma vez, inclusive com dois processos disputando;
 * - saída parcial nunca vira troca;
 * - segredo nunca chega a banco, push, log QA ou retorno.
 *
 * Fora daqui ficam só a checagem de login (o resultado é gravado no
 * repositório como a checagem real grava) e a janela do Electron.
 */

const test = require('node:test')
const assert = require('node:assert/strict')
const { fork } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const Module = require('node:module')
const path = require('node:path')

// O `pty:spawn` real registra no `ipcMain`: um registro no lugar do Electron
// deixa a matriz chamar o handler como o renderer chama.
const ipcHandlers = new Map()
const originalLoad = Module._load
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') return { ipcMain: { handle: (channel, listener) => ipcHandlers.set(channel, listener) } }
  return originalLoad.call(this, request, parent, isMain)
}
const { CHAIN_TICKET_REFUSED, registerPtyIpcHandlers } = require('../pty-ipc-handlers.cjs')
Module._load = originalLoad

const { PtyProcessManager } = require('../pty-process-manager.cjs')
const { createStorageDatabase } = require('../storage/sqlite-database.cjs')
const { createAccountChainRepository } = require('../storage/account-chain-repository.cjs')
const { createAccountOutputWatcher } = require('./account-output-watcher.cjs')
const { classifyFailure } = require('./failure-taxonomy.cjs')
const { createAccountChainService } = require('./account-chain-service.cjs')
const { createAccountDescriber, createChainPolicyPort } = require('./account-chain-port.cjs')
const { OUTPUT_WATCHER_DEBOUNCE_MS, SOURCE_ACTIVE_QUIET_MS, TICKET_TTL_MS } = require('./account-chain-constants.cjs')
const { FAULT_ACCOUNTS, listFaultAccounts } = require('../../__fixtures__/account-chain-faults-worker.cjs')

const WORKER = path.join(__dirname, '../../__fixtures__/account-chain-faults-worker.cjs')
const START_MS = Date.parse('2026-09-28T12:00:00.000Z')
const MINUTE = 60 * 1000
const POSIX = { name: 'linux', getDefaultShell: () => '/bin/bash' }
const OPEN_STATES = ['proposed', 'confirmed', 'spawning']

const LIMITE_CODEX =
  '■ You’ve hit your usage limit. Upgrade to Plus to continue using Codex (https://chatgpt.com/explore/plus), or try again at 8:04 PM.\r\n'
const LIMITE_CLAUDE = 'Usage limit reached · continuing automatically at 4:40pm · esc to cancel\r\n'
const SPINNER = '\x1b[2K\r⠋ Thinking… (12s · esc to interrupt) '

/** Sentinelas que o redator cobre hoje: nenhuma pode sair do processo. */
const SENTINELAS = [
  'sk-proj-SENTINELA0123456789abcdef',
  'sk-or-v1-SENTINELA0123456789abcdef',
  'eyJSENTINELAhdr0123.eyJSENTINELApay0123.SENTINELAsig',
  'SENTINELA-bearer-0123456789',
]

function criarPtyFalso() {
  return {
    pid: 4242,
    dataListeners: [],
    exitListeners: [],
    write() {},
    resize() {},
    kill() {},
    onData(listener) {
      this.dataListeners.push(listener)
    },
    onExit(listener) {
      this.exitListeners.push(listener)
    },
    emitData(data) {
      for (const listener of this.dataListeners) listener(data)
    },
    emitExit(event) {
      for (const listener of this.exitListeners) listener(event)
    },
  }
}

/**
 * Monta a cadeia inteira sobre um diretório de banco (novo ou reaproveitado,
 * para simular o reinício do app no mesmo perfil).
 */
function montarCadeia({ databaseDir = null, hooks = {} } = {}) {
  const dir = databaseDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-account-chain-faults-'))
  const database = createStorageDatabase({ databaseDir: dir })
  const repository = createAccountChainRepository(database)
  const clock = { ms: START_MS }
  const timers = []
  const ptys = new Map()
  const spawnCalls = []
  const pendentes = []
  const emitted = []
  const logged = []
  const retornos = []
  const loginResults = new Map()
  let proximoPty = null
  let falharProximoSpawn = false
  let service = null

  const manager = new PtyProcessManager({
    spawnPty: (file, args) => {
      spawnCalls.push({ file, args })
      if (falharProximoSpawn) {
        falharProximoSpawn = false
        throw new Error('spawn falhou')
      }
      return proximoPty
    },
    platform: POSIX,
    discoverAgentSession: () => null,
    now: () => clock.ms,
    logger: { warn() {}, info() {}, error() {}, log() {} },
    createOutputWatcher: (options) =>
      createAccountOutputWatcher({
        ...options,
        now: () => clock.ms,
        setTimer: (callback) => {
          const timer = { callback, active: true }
          timers.push(timer)
          return timer
        },
        clearTimer: (timer) => {
          timer.active = false
        },
        logger: { warn() {} },
      }),
    // O main entrega cada detecção da vigia ao serviço; aqui a promessa fica
    // guardada para o teste esperar a decisão.
    onOutputFailure: (detection) => {
      pendentes.push(service.onOutputFailure(detection))
    },
  })

  function registrarLogin(accountId, status = 'logged_in') {
    repository.recordLoginCheck({
      accountId,
      providerId: FAULT_ACCOUNTS[accountId]?.providerId ?? 'codex',
      status,
      checkedAt: new Date(clock.ms).toISOString(),
      source: 'checagem',
    })
  }

  service = createAccountChainService({
    repository,
    policy: createChainPolicyPort({ repository }),
    async checkLogin(accountId) {
      const status = loginResults.get(accountId)
      if (status) registrarLogin(accountId, status)
    },
    describeAccount: createAccountDescriber({ listAccounts: listFaultAccounts }),
    listAccounts: listFaultAccounts,
    listLiveSessions: () => manager.listarSessoesVivas(),
    setSessionAccountMode: (sessionId, mode) => manager.setAccountMode(sessionId, mode),
    emit: (channel, payload) => emitted.push({ channel, payload }),
    log: (entry) => logged.push(entry),
    now: () => clock.ms,
  })

  // Como o main liga: o `pty:spawn` pede o ticket ao serviço e avisa o fim.
  const ticketResults = []
  registerPtyIpcHandlers(() => null, {
    manager,
    chainTickets: {
      begin(input) {
        const result = service.beginTicketSpawn(input)
        ticketResults.push(result)
        return result
      },
      finish: (input) => service.finishTicketSpawn(input),
    },
  })

  const env = {
    dir,
    database,
    repository,
    service,
    manager,
    clock,
    spawnCalls,
    emitted,
    logged,
    retornos,
    loginResults,
    registrarLogin,
    avancar(ms) {
      clock.ms += ms
    },
    /** Liga a cadeia com as contas na ordem, habilitadas, e confere o login das indicadas. */
    ligarCadeia({ membros = Object.keys(FAULT_ACCOUNTS), logados = membros, maxHops } = {}) {
      const nowIso = new Date(clock.ms).toISOString()
      const atual = repository.readSettings()
      repository.updateSettings({
        expectedRevision: atual.revision,
        enabled: true,
        nowIso,
        ...(maxHops ? { maxHopsPerLineage: maxHops } : {}),
      })
      repository.replaceMembers({
        members: membros.map((accountId) => ({ accountId, providerId: FAULT_ACCOUNTS[accountId].providerId, enabled: true })),
        expectedRevision: repository.readSettings().revision,
        nowIso,
      })
      for (const accountId of logados) registrarLogin(accountId)
    },
    /** Abre um terminal de agente como o `pty:spawn` comum (sem ticket). */
    abrir(sessionId, { accountId = 'conta-a', accountMode = 'chain' } = {}) {
      proximoPty = criarPtyFalso()
      const { providerId } = FAULT_ACCOUNTS[accountId]
      manager.spawn(sessionId, {
        command: providerId,
        accountId,
        providerId,
        accountMode,
        onExit: () => hooks.onExit?.(sessionId, env),
      })
      ptys.set(sessionId, proximoPty)
      return proximoPty
    },
    escrever(sessionId, texto) {
      ptys.get(sessionId).emitData(texto)
    },
    sair(sessionId, exitCode = 1) {
      ptys.get(sessionId).emitExit({ exitCode })
    },
    /**
     * Deixa a saída assentar: a vigia varre depois do silêncio e o serviço
     * decide cada detecção. Devolve os resultados do serviço.
     */
    async assentar() {
      const decididos = []
      for (let rodada = 0; rodada < 20; rodada += 1) {
        const ativos = timers.filter((timer) => timer.active)
        if (ativos.length > 0) clock.ms += OUTPUT_WATCHER_DEBOUNCE_MS
        for (const timer of ativos) {
          timer.active = false
          timer.callback()
        }
        const lote = pendentes.splice(0)
        if (lote.length > 0) decididos.push(...(await Promise.all(lote)))
        if (ativos.length === 0 && lote.length === 0) break
      }
      retornos.push(...decididos)
      return decididos
    },
    /** Entrada da saída one-shot (chat e orquestrador): classifica em `fluxo`. */
    async falhaDeFluxo(sessionId, { text, signal, accountId = 'conta-a' } = {}) {
      const providerId = FAULT_ACCOUNTS[accountId].providerId
      const failure = classifyFailure({ text, signal, origin: 'fluxo', providerId })
      const outcome = await service.onOutputFailure({ sessionId, accountId, providerId, accountMode: 'chain', failure })
      retornos.push(outcome)
      return { failure, outcome }
    },
    /**
     * Abre o bloco novo pelo `pty:spawn` real com `chainTicket`, como o
     * renderer abre depois do `confirm`. Devolve o que o serviço respondeu ao
     * ticket (`ok`, `code`, `alreadySpawned`, `lineageId`) e, em `spawn`, o
     * que o IPC devolveu. Recusa do serviço tem de virar
     * `CHAIN_TICKET_REFUSED` sem processo novo.
     */
    abrirComTicket({ ticket, accountId, sessionId, falhar = false, reuseExisting = false }) {
      const processosAntes = spawnCalls.length
      const { providerId } = FAULT_ACCOUNTS[accountId]
      proximoPty = criarPtyFalso()
      falharProximoSpawn = falhar
      ticketResults.length = 0
      const spawn = ipcHandlers.get('pty:spawn')(null, {
        sessionId,
        command: providerId,
        accountId,
        providerId,
        accountMode: 'chain',
        chainTicket: ticket,
        reuseExisting,
      })
      falharProximoSpawn = false
      const inicio = ticketResults[0] ?? { ok: false, code: 'NOT_CALLED' }
      if (!inicio.ok) {
        assert.equal(spawn.ok, false)
        assert.equal(spawn.code, CHAIN_TICKET_REFUSED)
        assert.equal(spawnCalls.length, processosAntes, 'ticket recusado abriu processo')
      }
      if (spawn.ok && !spawn.reused) ptys.set(sessionId, proximoPty)
      const resultado = { ...inicio, spawn }
      retornos.push(resultado)
      return resultado
    },
    eventos() {
      return repository.listSwitchEvents()
    },
    esperas() {
      return repository.listCooldowns()
    },
    deteccoes() {
      return emitted.filter((item) => item.channel === 'account-chain:detection').map((item) => item.payload)
    },
    fechar({ apagar = true } = {}) {
      manager.killAll({ force: true })
      database.close()
      if (apagar) fs.rmSync(dir, { recursive: true, force: true })
    },
  }
  return env
}

async function comCadeia(action, options) {
  const env = montarCadeia(options)
  try {
    return await action(env)
  } finally {
    env.fechar()
  }
}

/** Nenhuma troca aconteceu: só os processos abertos pelo teste e nada aberto além de propostas. */
function assertSemTrocaSozinha(env, processosAbertosPeloTeste) {
  assert.equal(env.spawnCalls.length, processosAbertosPeloTeste, 'um processo nasceu sem confirm + ticket')
  for (const event of env.eventos()) {
    assert.ok(!['confirmed', 'spawning', 'spawned'].includes(event.state), `evento ${event.id} avançou sozinho para ${event.state}`)
  }
}

async function propor(env, sessionId = 'origem', texto = LIMITE_CODEX) {
  env.escrever(sessionId, texto)
  const [outcome] = await env.assentar()
  assert.equal(outcome?.action, 'proposed', JSON.stringify(outcome))
  // A pessoa lê o cartão: a origem para de escrever antes do `confirm`.
  env.avancar(SOURCE_ACTIVE_QUIET_MS)
  return outcome.event
}

// ── Matriz pelo terminal ─────────────────────────────────────────────────────

const MATRIZ_TERMINAL = [
  { nome: 'limite ancorado do Codex', conta: 'conta-a', pedacos: [LIMITE_CODEX], acao: 'proposed', espera: 'limit' },
  // A continuação pode cruzar provedores (decisão 2): a 1ª apta na ordem manual é do Codex.
  { nome: 'limite ancorado do Claude', conta: 'conta-d', pedacos: [LIMITE_CLAUDE], acao: 'proposed', espera: 'limit', destino: 'conta-a' },
  {
    nome: 'limite partido em 2 pedaços',
    conta: 'conta-a',
    pedacos: ['■ You’ve hit your usage lim', 'it. Upgrade to Plus to continue using Codex, or try again at 8:04 PM.\r\n'],
    acao: 'proposed',
    espera: 'limit',
  },
  { nome: 'login perdido (401 da CLI)', conta: 'conta-a', pedacos: ['\r\nNot logged in\r\n'], acao: 'proposed', espera: 'auth' },
  { nome: 'sem crédito', conta: 'conta-a', pedacos: ["You're out of credits. Add credits to continue.\r\n"], acao: 'proposed', espera: 'billing' },
  {
    nome: 'limite do Codex por modelo',
    conta: 'conta-a',
    pedacos: ['You’ve hit your usage limit for gpt-5.1-codex-max. Switch to another model now, or try again at 8:04 PM.\r\n'],
    acao: 'model_limit',
    espera: null,
  },
  { nome: 'rede: stream disconnected', conta: 'conta-a', pedacos: ['stream disconnected before completion: error sending request\r\n'], acao: 'transient', espera: null },
  { nome: 'rede: Reconnecting...', conta: 'conta-a', pedacos: ['⚠ Reconnecting... 2/5\r\n'], acao: 'transient', espera: null },
  { nome: 'provedor: alta carga', conta: 'conta-a', pedacos: ['Codex is currently experiencing high load. Please try again.\r\n'], acao: 'transient', espera: null },
  { nome: 'provedor: MODEL_CAPACITY_EXHAUSTED (Gemini)', conta: 'conta-g', pedacos: ['[API Error: MODEL_CAPACITY_EXHAUSTED]\r\n'], acao: 'transient', espera: null },
  { nome: '"Usage limit reached · wrapping up" é tolerância', conta: 'conta-d', pedacos: ['Usage limit reached · wrapping up\r\n'], acao: null, espera: null },
  {
    nome: 'o agente imprimindo 401, 429 e "rate limit" no próprio trabalho',
    conta: 'conta-a',
    pedacos: [
      'assert(res.status === 401) // 401 Unauthorized\r\n',
      'src/api.ts line 429: HTTP 429 Too Many Requests → rate limit, retry\r\n',
    ],
    acao: null,
    espera: null,
  },
  { nome: 'saída parcial ("You’ve hit your") sem o resto', conta: 'conta-a', pedacos: ['■ You’ve hit your\r\n'], acao: null, espera: null },
]

test('matriz pelo terminal: cada falha injetada no PTY faz só o que a tabela manda e nenhuma abre processo', async () => {
  for (const caso of MATRIZ_TERMINAL) {
    await comCadeia(async (env) => {
      env.ligarCadeia()
      env.abrir('origem', { accountId: caso.conta })
      for (const pedaco of caso.pedacos) env.escrever('origem', pedaco)
      const decididos = await env.assentar()

      assert.deepEqual(decididos.map((item) => item.action), caso.acao ? [caso.acao] : [], caso.nome)
      const esperas = env.esperas()
      assert.deepEqual(esperas.map((item) => item.failureClass), caso.espera ? [caso.espera] : [], `${caso.nome}: espera`)
      if (caso.espera === 'auth' || caso.espera === 'billing') {
        assert.equal(esperas[0].untilAt, null, `${caso.nome}: login e crédito só saem com checagem ou ação`)
      }
      const eventos = env.eventos()
      if (caso.acao === 'proposed') {
        assert.equal(eventos.length, 1, caso.nome)
        assert.equal(eventos[0].state, 'proposed', caso.nome)
        assert.equal(eventos[0].failureClass, caso.espera, caso.nome)
        assert.equal(eventos[0].toAccountId, caso.destino ?? 'conta-b', caso.nome)
      } else {
        assert.deepEqual(eventos, [], `${caso.nome}: não pode haver proposta nem registro`)
      }
      assertSemTrocaSozinha(env, 1)
    })
  }
})

// ── Matriz pela saída one-shot ───────────────────────────────────────────────

const MATRIZ_FLUXO = [
  { nome: '401 Unauthorized', entrada: { text: 'Error: 401 Unauthorized' }, classe: 'auth', acao: 'proposed', espera: 'auth' },
  { nome: '403 Forbidden', entrada: { text: 'HTTP 403 Forbidden' }, classe: 'auth', acao: 'ambiguous', espera: null },
  { nome: '"line 429" solto', entrada: { text: 'at parse (src/app.ts line 429)' }, classe: 'unknown', acao: 'ignored', espera: null },
  { nome: 'status 429', entrada: { text: 'Error: status 429 Too Many Requests' }, classe: 'limit', acao: 'proposed', espera: 'limit' },
  { nome: '529 do servidor', entrada: { text: 'Error: 529 overloaded' }, classe: 'provider', acao: 'transient', espera: null },
  { nome: 'server_overloaded', entrada: { text: '{"type":"error","code":"server_overloaded"}' }, classe: 'provider', acao: 'transient', espera: null },
  { nome: 'ECONNRESET', entrada: { text: 'request failed: read ECONNRESET' }, classe: 'network', acao: 'transient', espera: null },
  { nome: 'tempo esgotado do app', entrada: { text: 'Codex não gerou resposta textual em 120s' }, classe: 'timeout', acao: 'transient', espera: null },
  { nome: 'tempo esgotado por sinal', entrada: { signal: { timedOut: true } }, classe: 'timeout', acao: 'transient', espera: null },
  { nome: 'cancelado pela pessoa', entrada: { text: 'usage limit', signal: { stopped: true } }, classe: 'cancelled', acao: 'ignored', espera: null },
]

test('matriz pela saída one-shot: 401 propõe, 403 pede escolha, 429 solto, servidor, rede, tempo e cancelado não trocam', async () => {
  for (const caso of MATRIZ_FLUXO) {
    await comCadeia(async (env) => {
      env.ligarCadeia()
      env.abrir('origem')
      const { failure, outcome } = await env.falhaDeFluxo('origem', caso.entrada)

      assert.equal(failure.failureClass, caso.classe, caso.nome)
      assert.equal(outcome.action, caso.acao, caso.nome)
      assert.deepEqual(env.esperas().map((item) => item.failureClass), caso.espera ? [caso.espera] : [], `${caso.nome}: espera`)
      const eventos = env.eventos()
      if (caso.acao === 'proposed') {
        assert.deepEqual(eventos.map((event) => [event.state, event.failureClass]), [['proposed', caso.classe]], caso.nome)
      } else {
        // Rede, servidor, tempo, cancelado e ambíguo: nenhuma espera, nenhuma proposta (I7).
        assert.deepEqual(eventos, [], caso.nome)
      }
      assertSemTrocaSozinha(env, 1)
    })
  }
})

test('403 ambíguo: pede escolha; "Ignorar" não faz nada e "tratar como limite" só propõe, sem abrir processo', async () => {
  await comCadeia(async (env) => {
    env.ligarCadeia()
    env.abrir('origem')
    const { outcome } = await env.falhaDeFluxo('origem', { text: 'status 403 Forbidden' })
    assert.equal(outcome.action, 'ambiguous')
    assert.equal(env.service.getState().ambiguousDetections.length, 1)

    assert.deepEqual(await env.service.resolveAmbiguous({ detectionId: outcome.detectionId, treatAs: 'ignore' }), { ok: true, action: 'ignored' })
    assert.equal((await env.service.resolveAmbiguous({ detectionId: outcome.detectionId, treatAs: 'limit' })).code, 'NOT_PENDING')
    assert.deepEqual(env.esperas(), [])
    assert.deepEqual(env.eventos(), [])

    const segunda = await env.falhaDeFluxo('origem', { text: 'status 403 Forbidden' })
    const tratada = await env.service.resolveAmbiguous({ detectionId: segunda.outcome.detectionId, treatAs: 'limit' })
    assert.equal(tratada.action, 'proposed')
    assert.deepEqual(env.esperas().map((item) => item.failureClass), ['limit'])
    // O ticket só nasce do confirm: a proposta sozinha não abre o bloco.
    assert.equal(env.service.beginTicketSpawn({ ticket: tratada.event.id, accountId: 'conta-b', sessionId: 'novo' }).code, 'TICKET_NOT_CONFIRMED')
    assertSemTrocaSozinha(env, 1)
  })
})

// ── Saída parcial e processo morto ───────────────────────────────────────────

test('saída parcial: frase cortada entre pedaços só conta quando completa; cortada e o processo sai, nada acontece', async () => {
  await comCadeia(async (env) => {
    env.ligarCadeia()
    env.abrir('origem')
    env.escrever('origem', `${SPINNER}\r\n■ You’ve hit your usage`)
    assert.deepEqual(await env.assentar(), [], 'a metade da frase não é limite')
    env.escrever('origem', ' limit. Upgrade to Plus to continue using Codex, or try again at 8:04 PM.\r\n')
    const [outcome] = await env.assentar()
    assert.equal(outcome.action, 'proposed')
    assert.equal(env.eventos().length, 1)
    assertSemTrocaSozinha(env, 1)
  })

  await comCadeia(async (env) => {
    env.ligarCadeia()
    env.abrir('origem')
    env.escrever('origem', `${SPINNER}\r\n■ You’ve hit your`)
    // A saída do processo varre na hora o que sobrou (flush): continua sem frase inteira.
    env.sair('origem')
    assert.deepEqual(await env.assentar(), [])
    assert.deepEqual(env.esperas(), [])
    assert.deepEqual(env.eventos(), [])
    assertSemTrocaSozinha(env, 1)
  })
})

test('processo morto com proposta aberta: a proposta vence, o confirm é recusado e nenhum processo nasce', async () => {
  // Sem aviso de saída ao serviço: o confirm confere a sessão viva e recusa.
  await comCadeia(async (env) => {
    env.ligarCadeia()
    env.abrir('origem')
    const proposta = await propor(env)
    env.sair('origem')

    const resultado = await env.service.confirm({ proposalId: proposta.id, destinationAccountId: 'conta-b' })
    assert.deepEqual([resultado.ok, resultado.code, resultado.reason], [false, 'EXPIRED', 'origem-saiu'])
    assert.equal(env.repository.getSwitchEvent(proposta.id).state, 'expired')
    assert.equal(env.abrirComTicket({ ticket: proposta.id, accountId: 'conta-b', sessionId: 'novo' }).code, 'TICKET_EXPIRED')
    assertSemTrocaSozinha(env, 1)
  })

  // Com o aviso de saída (o main chama `onSessionExit`): vence na hora.
  await comCadeia(
    async (env) => {
      env.ligarCadeia()
      env.abrir('origem')
      const proposta = await propor(env)
      env.sair('origem')
      assert.equal(env.repository.getSwitchEvent(proposta.id).state, 'expired')
      assertSemTrocaSozinha(env, 1)
    },
    { hooks: { onExit: (sessionId, env) => env.service.onSessionExit(sessionId) } },
  )
})

test('ticket confirmado e nunca usado (o bloco novo não chegou a abrir) vence em 2 min e não abre processo depois', async () => {
  await comCadeia(async (env) => {
    env.ligarCadeia()
    env.abrir('origem')
    const proposta = await propor(env)
    const confirmado = await env.service.confirm({ proposalId: proposta.id, destinationAccountId: 'conta-b' })
    assert.equal(confirmado.ok, true)

    env.avancar(TICKET_TTL_MS + 1)
    env.service.sweep()
    assert.equal(env.repository.getSwitchEvent(proposta.id).state, 'expired')
    assert.equal(env.abrirComTicket({ ticket: confirmado.ticket, accountId: 'conta-b', sessionId: 'novo' }).code, 'TICKET_EXPIRED')
    assert.equal(env.spawnCalls.length, 1)
  })
})

// ── Ticket de uso único ──────────────────────────────────────────────────────

test('ticket de uso único: confirm duplo e IPC repetido dão 1 ticket e 1 processo; outra sessão e outra conta são recusadas', async () => {
  await comCadeia(async (env) => {
    env.ligarCadeia()
    env.abrir('origem')
    const proposta = await propor(env)

    const [primeiro, segundo] = await Promise.all([
      env.service.confirm({ proposalId: proposta.id, destinationAccountId: 'conta-b' }),
      env.service.confirm({ proposalId: proposta.id, destinationAccountId: 'conta-b' }),
    ])
    assert.equal(primeiro.ticket, segundo.ticket)
    assert.deepEqual([primeiro.alreadyConfirmed, segundo.alreadyConfirmed].sort(), [false, true])
    assert.equal((await env.service.decline({ proposalId: proposta.id, reason: 'later' })).code, 'NOT_PENDING')

    assert.equal(env.abrirComTicket({ ticket: primeiro.ticket, accountId: 'conta-c', sessionId: 'novo' }).code, 'TICKET_ACCOUNT_MISMATCH')
    const aberto = env.abrirComTicket({ ticket: primeiro.ticket, accountId: 'conta-b', sessionId: 'novo' })
    assert.deepEqual([aberto.ok, aberto.alreadySpawned], [true, false])
    assert.equal(env.spawnCalls.length, 2)

    // Reload do mesmo bloco (o renderer reanexa com `reuseExisting`): o ticket
    // já gasto por esta sessão vira spawn comum e reaproveita o processo vivo.
    const recarregado = env.abrirComTicket({ ticket: primeiro.ticket, accountId: 'conta-b', sessionId: 'novo', reuseExisting: true })
    assert.deepEqual([recarregado.alreadySpawned, recarregado.spawn.ok, recarregado.spawn.reused], [true, true, true])
    assert.equal(env.abrirComTicket({ ticket: primeiro.ticket, accountId: 'conta-b', sessionId: 'outro' }).code, 'TICKET_USED')
    assert.equal(env.spawnCalls.length, 2, 'o ticket abriu mais de um processo')

    const evento = env.repository.getSwitchEvent(proposta.id)
    assert.deepEqual([evento.state, evento.targetSessionId, evento.toAccountId], ['spawned', 'novo', 'conta-b'])
    // O processo nascido do ticket está na conta confirmada (I3).
    assert.equal(env.manager.sessions.get('novo').accountId, 'conta-b')
  })
})

test('spawn do destino que falha fica spawn_failed e não tem nova tentativa', async () => {
  await comCadeia(async (env) => {
    env.ligarCadeia()
    env.abrir('origem')
    const proposta = await propor(env)
    const { ticket } = await env.service.confirm({ proposalId: proposta.id, destinationAccountId: 'conta-b' })
    // O `pty:spawn` real aceita o ticket, o processo não sobe e o fim é gravado como falha.
    const falho = env.abrirComTicket({ ticket, accountId: 'conta-b', sessionId: 'novo', falhar: true })
    assert.equal(falho.ok, true)
    assert.equal(falho.spawn.ok, false)
    assert.equal(env.repository.getSwitchEvent(proposta.id).state, 'spawn_failed')

    assert.equal(env.abrirComTicket({ ticket, accountId: 'conta-b', sessionId: 'novo' }).code, 'TICKET_NOT_CONFIRMED')
    // A mesma evidência não reabre proposta; só evidência nova, e ela ainda pede confirmação.
    env.escrever('origem', LIMITE_CODEX)
    assert.deepEqual((await env.assentar()).map((item) => item.action), [])
    assert.equal(env.spawnCalls.length, 2, 'só a origem e a tentativa que falhou')
  })
})

// ── Repetição e laço ─────────────────────────────────────────────────────────

test('a mesma evidência 50× (redesenho da TUI e detecção repetida) gera 1 proposta; recusar silencia', async () => {
  await comCadeia(async (env) => {
    env.ligarCadeia()
    env.abrir('origem')
    for (let vez = 0; vez < 50; vez += 1) {
      env.escrever('origem', `${SPINNER}${vez}\r\n\x1b[2K\r${LIMITE_CODEX}`)
      await env.assentar()
    }
    const repetidas = []
    for (let vez = 0; vez < 50; vez += 1) repetidas.push((await env.falhaDeFluxo('origem', { text: LIMITE_CODEX })).outcome.action)
    assert.ok(repetidas.every((action) => action === 'duplicate'), JSON.stringify(repetidas))

    const propostas = env.eventos()
    assert.deepEqual(propostas.map((event) => event.state), ['proposed'], 'a mesma evidência abriu mais de uma proposta')
    assert.equal(env.deteccoes().length, 1, 'a vigia repetiu a detecção do redesenho')

    const [aberta] = propostas
    assert.deepEqual(await env.service.decline({ proposalId: aberta.id, reason: 'later' }), { ok: true, cooldownReleased: false })
    const depois = await env.service.onOutputFailure({
      sessionId: 'origem',
      accountId: 'conta-a',
      providerId: 'codex',
      accountMode: 'chain',
      failure: { failureClass: 'limit', scope: 'account', evidence: 'x', evidenceHash: aberta.evidenceHash },
    })
    assert.equal(depois.action, 'silenced')
    assertSemTrocaSozinha(env, 1)
  })
})

test('laço A→B→C→A: para no teto de saltos, conta em espera ou visitada nunca é destino e a origem continuada só avisa', async () => {
  await comCadeia(async (env) => {
    env.ligarCadeia({ membros: ['conta-a', 'conta-b', 'conta-c'], maxHops: 2 })
    env.abrir('bloco-a', { accountId: 'conta-a' })

    const primeira = await propor(env, 'bloco-a')
    const ticketB = (await env.service.confirm({ proposalId: primeira.id, destinationAccountId: 'conta-b' })).ticket
    env.abrirComTicket({ ticket: ticketB, accountId: 'conta-b', sessionId: 'bloco-b' })

    const segunda = await propor(env, 'bloco-b')
    assert.equal(segunda.toAccountId, 'conta-c')
    assert.equal(segunda.lineageId, primeira.lineageId)
    const contaA = segunda.candidates.find((item) => item.accountId === 'conta-a')
    assert.equal(contaA.selectable, false)
    assert.ok(['em-espera', 'ja-visitada-na-linhagem'].includes(contaA.reason), contaA.reason)
    assert.equal((await env.service.confirm({ proposalId: segunda.id, destinationAccountId: 'conta-a' })).code, 'NOT_ELIGIBLE')
    const ticketC = (await env.service.confirm({ proposalId: segunda.id, destinationAccountId: 'conta-c' })).ticket
    env.abrirComTicket({ ticket: ticketC, accountId: 'conta-c', sessionId: 'bloco-c' })

    // Terceiro limite na mesma linhagem: teto de 2 saltos, sem proposta.
    env.escrever('bloco-c', LIMITE_CODEX)
    const [terceira] = await env.assentar()
    assert.equal(terceira.action, 'no_candidate')
    assert.match(terceira.event.reason, /teto de 2 trocas/)

    // A origem já continuada só avisa, mesmo com evidência nova.
    env.escrever('bloco-a', "You're out of credits.\r\n")
    const [aviso] = await env.assentar()
    assert.equal(aviso.action, 'noticed')

    assert.deepEqual(env.esperas().map((item) => item.accountId).sort(), ['conta-a', 'conta-b', 'conta-c'])
    assert.equal(env.eventos().filter((event) => event.state === 'spawned').length, 2)
    assert.equal(env.spawnCalls.length, 3, 'só os dois saltos confirmados abriram processo')
  })
})

test('todas as contas em espera: no_candidate e o bloco novo pela cadeia é recusado, sem cair no Login do sistema', async () => {
  await comCadeia(async (env) => {
    env.ligarCadeia({ membros: ['conta-a', 'conta-b'] })
    env.abrir('bloco-b', { accountId: 'conta-b' })
    env.abrir('bloco-a', { accountId: 'conta-a' })
    await propor(env, 'bloco-b')
    env.escrever('bloco-a', LIMITE_CODEX)
    const [outcome] = await env.assentar()
    assert.equal(outcome.action, 'no_candidate')

    env.avancar(30 * MINUTE)
    env.service.sweep()
    const bloco = await env.service.previewLaunch({ providerId: 'codex' })
    assert.equal(bloco.code, 'NO_CANDIDATE')
    assert.ok(bloco.reasons.every((item) => item.reason === 'em-espera'), JSON.stringify(bloco.reasons))
    assertSemTrocaSozinha(env, 2)
  })
})

// ── Reinício e concorrência ──────────────────────────────────────────────────

test('reinício durante a troca: proposta, ticket e spawn em andamento são invalidados e nunca executados; a espera fica', async () => {
  const antes = montarCadeia()
  let tickets
  try {
    antes.ligarCadeia()
    for (const sessionId of ['s1', 's2', 's3']) antes.abrir(sessionId)
    const propostas = []
    for (const sessionId of ['s1', 's2', 's3']) propostas.push(await propor(antes, sessionId))
    const t2 = (await antes.service.confirm({ proposalId: propostas[1].id, destinationAccountId: 'conta-b' })).ticket
    const t3 = (await antes.service.confirm({ proposalId: propostas[2].id, destinationAccountId: 'conta-b' })).ticket
    assert.equal(antes.service.beginTicketSpawn({ ticket: t3, accountId: 'conta-b', sessionId: 'novo-3' }).ok, true)
    tickets = { p1: propostas[0].id, t2, t3 }
  } finally {
    antes.fechar({ apagar: false })
  }

  const depois = montarCadeia({ databaseDir: antes.dir })
  try {
    depois.clock.ms = antes.clock.ms + MINUTE
    const recuperado = depois.service.recoverOnStartup()
    assert.deepEqual([recuperado.expired, recuperado.spawnFailed], [2, 1])
    assert.equal(depois.repository.getSwitchEvent(tickets.p1).state, 'expired')
    assert.equal(depois.repository.getSwitchEvent(tickets.t2).state, 'expired')
    assert.equal(depois.repository.getSwitchEvent(tickets.t3).state, 'spawn_failed')
    assert.deepEqual(depois.repository.listOpenSwitchEvents(), [])

    assert.equal((await depois.service.confirm({ proposalId: tickets.p1, destinationAccountId: 'conta-b' })).code, 'EXPIRED')
    assert.equal(depois.abrirComTicket({ ticket: tickets.t2, accountId: 'conta-b', sessionId: 'novo-2' }).code, 'TICKET_EXPIRED')
    assert.equal(depois.abrirComTicket({ ticket: tickets.t3, accountId: 'conta-b', sessionId: 'novo-3' }).code, 'TICKET_NOT_CONFIRMED')
    assert.equal(depois.spawnCalls.length, 0, 'um reinício executou uma troca pendente')
    // A espera sobrevive ao reinício: a conta de origem não volta sozinha.
    assert.deepEqual(depois.esperas().map((item) => [item.accountId, item.failureClass]), [['conta-a', 'limit']])
  } finally {
    depois.fechar()
  }
})

function startWorker(databaseDir, name, sessionCount) {
  const child = fork(WORKER, [databaseDir, name, String(sessionCount)], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] })
  const inbox = []
  const waiters = []
  child.on('message', (message) => {
    const index = waiters.findIndex((waiter) => waiter.accepts(message))
    if (index >= 0) waiters.splice(index, 1)[0].resolve(message)
    else inbox.push(message)
  })
  function next(accepts) {
    const queued = inbox.findIndex(accepts)
    if (queued >= 0) return Promise.resolve(inbox.splice(queued, 1)[0])
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${name}: sem resposta`)), 15_000)
      waiters.push({
        accepts,
        resolve: (message) => {
          clearTimeout(timer)
          if (message.tipo === 'erro') reject(new Error(`${name}: ${message.message}`))
          else resolve(message)
        },
      })
    })
  }
  const ask = (message, tipo) => {
    child.send(message)
    return next((reply) => reply.tipo === 'erro' || (reply.tipo === tipo && reply.rodada === message.rodada))
  }
  return {
    ready: () => next((message) => message.tipo === 'pronto' || message.tipo === 'erro'),
    confirm: (rodada, proposalId) => ask({ tipo: 'confirmar', rodada, proposalId }, 'confirmado'),
    spend: (rodada, ticket) => ask({ tipo: 'gastar', rodada, ticket }, 'gasto'),
    stop: () =>
      new Promise((resolve) => {
        if (child.exitCode !== null || child.signalCode !== null) return resolve()
        const timer = setTimeout(() => child.kill(), 15_000)
        child.once('exit', () => {
          clearTimeout(timer)
          resolve()
        })
        if (child.connected) child.send({ tipo: 'sair' })
        else child.kill()
      }),
  }
}

test('dois processos com o serviço real disputando a mesma proposta: 1 ticket e 1 spawn por rodada', { timeout: 120_000 }, async () => {
  const ROUNDS = 8
  const pai = montarCadeia()
  // Os filhos usam o relógio de verdade: a proposta e o login nascem "agora".
  pai.clock.ms = Date.now()
  const propostas = []
  const workers = []
  try {
    pai.ligarCadeia()
    for (let rodada = 1; rodada <= ROUNDS; rodada += 1) {
      pai.abrir(`origem-${rodada}`)
      propostas.push(await propor(pai, `origem-${rodada}`))
    }
    workers.push(startWorker(pai.dir, 'a', ROUNDS), startWorker(pai.dir, 'b', ROUNDS))
    await Promise.all(workers.map((worker) => worker.ready()))

    for (let rodada = 1; rodada <= ROUNDS; rodada += 1) {
      const proposalId = propostas[rodada - 1].id
      const confirms = await Promise.all(workers.map((worker) => worker.confirm(rodada, proposalId)))
      assert.ok(confirms.every((item) => item.ok), JSON.stringify(confirms))
      assert.equal(confirms[0].ticket, confirms[1].ticket, 'dois tickets para a mesma proposta')
      assert.equal(confirms.filter((item) => item.alreadyConfirmed === false).length, 1, JSON.stringify(confirms))

      const gastos = await Promise.all(workers.map((worker) => worker.spend(rodada, confirms[0].ticket)))
      assert.equal(gastos.filter((item) => item.ok).length, 1, `rodada ${rodada}: ${JSON.stringify(gastos)}`)
      assert.ok(gastos.filter((item) => !item.ok).every((item) => ['TICKET_IN_USE', 'TICKET_USED'].includes(item.code)), JSON.stringify(gastos))
    }
  } finally {
    await Promise.all(workers.map((worker) => worker.stop()))
  }

  try {
    const eventos = pai.eventos()
    assert.equal(eventos.length, ROUNDS)
    assert.ok(eventos.every((event) => event.state === 'spawning' && /^novo-\d+-[ab]$/.test(event.targetSessionId)))
    assert.equal(pai.spawnCalls.length, ROUNDS, 'só as origens abertas pelo teste')
  } finally {
    pai.fechar()
  }
})

// ── Segredo ──────────────────────────────────────────────────────────────────

/** Tudo que o SQLite tem: cada linha de cada tabela e os bytes do arquivo (com o WAL). */
function despejarBanco(env) {
  const tabelas = env.database.connection
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((row) => row.name)
  const linhas = tabelas.map((nome) => JSON.stringify(env.database.connection.prepare(`SELECT * FROM "${nome}"`).all()))
  const arquivos = fs
    .readdirSync(env.dir)
    .map((nome) => fs.readFileSync(path.join(env.dir, nome)).toString('latin1'))
  return [...linhas, ...arquivos].join('\n')
}

function assertSemSentinela(texto, onde, sentinelas = SENTINELAS) {
  for (const sentinela of sentinelas) {
    assert.equal(texto.includes(sentinela), false, `${onde}: vazou ${sentinela.slice(0, 12)}…`)
  }
}

async function percorrerComSegredos(env, sentinelas) {
  env.ligarCadeia()
  env.abrir('origem')
  env.abrir('outra', { accountId: 'conta-c' })
  const segredos = sentinelas.join(' ')
  env.escrever('origem', `■ You’ve hit your usage limit. ${segredos}\r\n`)
  const [limite] = await env.assentar()
  env.escrever('outra', `You're out of credits. token ${segredos}\r\n`)
  await env.assentar()
  const ambiguo = await env.falhaDeFluxo('outra', { text: `HTTP 403 Forbidden Authorization ${segredos}`, accountId: 'conta-c' })
  env.retornos.push(env.service.getState())
  env.retornos.push(await env.service.resolveAmbiguous({ detectionId: ambiguo.outcome.detectionId, treatAs: 'limit' }))
  env.avancar(SOURCE_ACTIVE_QUIET_MS)
  const confirmado = await env.service.confirm({ proposalId: limite.event.id, destinationAccountId: 'conta-b' })
  env.retornos.push(confirmado)
  env.abrirComTicket({ ticket: confirmado.ticket, accountId: 'conta-b', sessionId: 'novo' })
  env.retornos.push(env.service.getState(), env.service.history({}))
  return limite
}

test('segredo na saída (sk-, sk-or-, eyJ…, Bearer) não chega a banco, push, log QA nem retorno do serviço', async () => {
  await comCadeia(async (env) => {
    const limite = await percorrerComSegredos(env, [SENTINELAS[0], SENTINELAS[1], SENTINELAS[2], `Bearer ${SENTINELAS[3]}`])
    assert.equal(limite.action, 'proposed', 'o fluxo com segredo precisa ter passado pela proposta')
    assert.equal(env.eventos().some((event) => event.state === 'spawned'), true)

    assertSemSentinela(despejarBanco(env), 'banco')
    assertSemSentinela(JSON.stringify(env.emitted), 'push')
    assertSemSentinela(JSON.stringify(env.logged), 'log QA')
    assertSemSentinela(JSON.stringify(env.retornos), 'retorno')
    // A evidência continua útil: a frase fica, o valor some.
    assert.match(JSON.stringify(env.esperas()), /usage limit\. \[oculto\]/)
  })
})

// ── Lacunas conhecidas (ver o relatório da trilha): falham hoje, não travam a suíte ──

test(
  'segredo sem rótulo de outros provedores (AIza…, ghp_…) também não sai',
  async () => {
    // Chave do Google no formato real: `AIza` + 35 caracteres.
    const extras = ['AIzaSyDSENTINELA0123456789abcdefghijklm', 'ghp_SENTINELA0123456789abcdefghijABCDEF']
    await comCadeia(async (env) => {
      await percorrerComSegredos(env, extras)
      assertSemSentinela(despejarBanco(env), 'banco', extras)
      assertSemSentinela(JSON.stringify(env.emitted), 'push', extras)
    })
  },
)

test(
  'origem ainda escrevendo pede a segunda confirmação (SOURCE_ACTIVE) com as sessões vivas do manager',
  async () => {
    await comCadeia(async (env) => {
      env.ligarCadeia()
      env.abrir('origem')
      const proposta = await propor(env)
      env.escrever('origem', `${SPINNER}ainda trabalhando\r\n`)
      assert.equal((await env.service.confirm({ proposalId: proposta.id, destinationAccountId: 'conta-b' })).code, 'SOURCE_ACTIVE')
    })
  },
)

test('aviso "Your usage limit has reset" da vigia sem troca feita não vira detecção inválida nem troca', async () => {
  await comCadeia(async (env) => {
    env.ligarCadeia()
    env.abrir('origem', { accountId: 'conta-d' })
    env.escrever('origem', 'Your usage limit has reset · press enter to continue\r\n')
    const decididos = await env.assentar()
    assert.deepEqual(decididos.map((item) => item.action), ['ignored'])
    assert.equal(env.logged.some((entry) => entry.transition === 'detection-invalid'), false)
    assertSemTrocaSozinha(env, 1)
  })
})

test('aviso "Your usage limit has reset" na origem que já trocou chega ao serviço como source_resumed, sem escrever em nada', async () => {
  await comCadeia(async (env) => {
    env.ligarCadeia()
    env.abrir('origem', { accountId: 'conta-d' })
    const proposta = await propor(env, 'origem', LIMITE_CLAUDE)
    const confirmado = await env.service.confirm({ proposalId: proposta.id, destinationAccountId: 'conta-e' })
    assert.equal(confirmado.ok, true, JSON.stringify(confirmado))
    assert.equal(env.abrirComTicket({ ticket: confirmado.ticket, accountId: 'conta-e', sessionId: 'novo' }).spawn.ok, true)
    const processos = env.spawnCalls.length

    env.escrever('origem', 'Your usage limit has reset · press enter to continue\r\n')
    const decididos = await env.assentar()
    assert.deepEqual(decididos.map((item) => item.action), ['source_resumed'])
    const aviso = env.deteccoes().at(-1)
    assert.equal(aviso.action, 'source_resumed')
    assert.equal(aviso.sessionId, 'origem')
    assert.equal(env.spawnCalls.length, processos, 'o aviso não abre processo')
    assert.equal(env.eventos().filter((event) => event.state === 'proposed').length, 0)
  })
})

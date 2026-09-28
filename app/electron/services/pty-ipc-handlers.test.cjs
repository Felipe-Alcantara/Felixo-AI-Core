const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')

// Stub `electron` so the handler module can be loaded under node:test. The
// stub exposes a tiny `ipcMain` that records registered handlers so each test
// can invoke them directly.
const handlers = new Map()
const originalLoad = Module._load
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') {
    return {
      ipcMain: {
        handle(channel, listener) {
          handlers.set(channel, listener)
        },
      },
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

const {
  registerPtyIpcHandlers,
  requireSessionId,
  toErrorResult,
} = require('./pty-ipc-handlers.cjs')

Module._load = originalLoad

function createFakeManager() {
  return {
    calls: [],
    spawn(sessionId, options) {
      this.calls.push({ method: 'spawn', sessionId, options })
      // Emit one data + exit event so we can assert the bridge forwards them.
      options.onData?.('boot\r\n')
      options.onExit?.({ exitCode: 0, signal: undefined })
    },
    write(sessionId, data) {
      this.calls.push({ method: 'write', sessionId, data })
      return true
    },
    resize(sessionId, cols, rows) {
      this.calls.push({ method: 'resize', sessionId, cols, rows })
      return true
    },
    kill(sessionId, options) {
      this.calls.push({ method: 'kill', sessionId, options })
      return true
    },
    killAll(options) {
      this.calls.push({ method: 'killAll', options })
    },
  }
}

function setup({ validateAccount } = {}) {
  handlers.clear()
  const sent = []
  const window = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, payload) => sent.push({ channel, payload }),
    },
  }
  const manager = createFakeManager()
  const api = registerPtyIpcHandlers(() => window, { manager, validateAccount })
  const invoke = (channel, params) => handlers.get(channel)(null, params)

  return { manager, sent, api, invoke }
}

test('requireSessionId rejects empty or non-string ids', () => {
  assert.equal(requireSessionId('term-1'), 'term-1')
  assert.throws(() => requireSessionId(''), /sessionId is required/)
  assert.throws(() => requireSessionId('   '), /sessionId is required/)
  assert.throws(() => requireSessionId(undefined), /sessionId is required/)
})

test('toErrorResult prefers the error message and falls back otherwise', () => {
  assert.deepEqual(toErrorResult(new Error('boom'), 'fallback'), {
    ok: false,
    message: 'boom',
  })
  assert.deepEqual(toErrorResult('not-an-error', 'fallback'), {
    ok: false,
    message: 'fallback',
  })
})

test('pty:spawn starts a session and streams data/exit to the window', () => {
  const { manager, sent, invoke } = setup()

  const result = invoke('pty:spawn', {
    sessionId: 'term-1',
    command: 'claude',
    cols: 100,
    rows: 30,
  })

  assert.deepEqual(result, { ok: true, sessionId: 'term-1' })
  const spawnCall = manager.calls.find((call) => call.method === 'spawn')
  assert.equal(spawnCall.sessionId, 'term-1')
  assert.equal(spawnCall.options.command, 'claude')

  assert.deepEqual(sent, [
    { channel: 'pty:data', payload: { sessionId: 'term-1', data: 'boot\r\n' } },
    {
      channel: 'pty:exit',
      payload: { sessionId: 'term-1', exitCode: 0, signal: undefined },
    },
  ])
})

test('pty:spawn returns an error result for a missing sessionId', () => {
  const { manager, invoke } = setup()

  const result = invoke('pty:spawn', {})

  assert.equal(result.ok, false)
  assert.match(result.message, /sessionId is required/)
  assert.equal(
    manager.calls.some((call) => call.method === 'spawn'),
    false,
  )
})

test('pty:spawn rejects a stale account before calling the manager', () => {
  const { manager, invoke } = setup({
    validateAccount: (accountId, providerId) => {
      assert.equal(accountId, 'conta-codex')
      assert.equal(providerId, 'claude')
      return { ok: false, message: 'A conta selecionada pertence a outro provedor.' }
    },
  })

  const result = invoke('pty:spawn', {
    sessionId: 'term-stale-account',
    command: 'claude',
    accountId: 'conta-codex',
  })

  assert.deepEqual(result, {
    ok: false,
    message: 'A conta selecionada pertence a outro provedor.',
  })
  assert.equal(manager.calls.some((call) => call.method === 'spawn'), false)
})

test('pty:spawn rejects provider metadata incompatible with the command', () => {
  const { manager, invoke } = setup()

  const result = invoke('pty:spawn', {
    sessionId: 'term-wrong-provider',
    command: 'claude',
    providerId: 'codex',
    accountId: 'conta-codex',
  })

  assert.equal(result.ok, false)
  assert.match(result.message, /provedor incompatível/)
  assert.equal(manager.calls.some((call) => call.method === 'spawn'), false)
})

test('pty:spawn repassa o modo de conta e recusa modo fora do contrato ou cadeia sem conta', () => {
  const { manager, invoke } = setup({ validateAccount: () => ({ ok: true }) })

  assert.equal(invoke('pty:spawn', { sessionId: 'fixa', command: 'codex', accountId: 'conta-a' }).ok, true)
  assert.equal(
    invoke('pty:spawn', { sessionId: 'fixa-explicita', command: 'codex', accountId: 'conta-a', accountMode: 'pinned' }).ok,
    true,
  )
  // `chain` sem ticket é o spawn comum na conta pedida (reinício do bloco);
  // a troca em si só abre com o ticket confirmado (ver os testes abaixo).
  assert.equal(
    invoke('pty:spawn', { sessionId: 'cadeia', command: 'codex', accountId: 'conta-a', accountMode: 'chain' }).ok,
    true,
  )
  const spawns = manager.calls.filter((call) => call.method === 'spawn')
  assert.equal(spawns[0].options.accountMode, undefined, 'ausente fica para o gerenciador decidir (fixa)')
  assert.equal(spawns[1].options.accountMode, 'pinned')
  assert.equal(spawns[2].options.accountMode, 'chain')

  const invalido = invoke('pty:spawn', { sessionId: 'x', command: 'codex', accountId: 'conta-a', accountMode: 'automatica' })
  assert.deepEqual(invalido, { ok: false, message: 'Modo de conta do terminal inválido.' })
  const semConta = invoke('pty:spawn', { sessionId: 'y', command: 'codex', accountMode: 'chain' })
  assert.equal(semConta.ok, false)
  assert.match(semConta.message, /precisa de uma conta/)
  assert.equal(manager.calls.filter((call) => call.method === 'spawn').length, 3)
})

test('pty:spawn devolve o código quando a sessão viva é de outra conta', () => {
  const { manager, invoke } = setup({ validateAccount: () => ({ ok: true }) })
  manager.spawn = () => {
    throw Object.assign(new Error('A sessão viva deste bloco está em outra conta.'), {
      code: 'PTY_SESSION_ACCOUNT_MISMATCH',
    })
  }

  assert.deepEqual(
    invoke('pty:spawn', { sessionId: 'canvas:b', command: 'codex', accountId: 'conta-b', reuseExisting: true }),
    { ok: false, message: 'A sessão viva deste bloco está em outra conta.', code: 'PTY_SESSION_ACCOUNT_MISMATCH' },
  )
})

test('pty:write forwards input to the manager', async () => {
  const { manager, invoke } = setup()

  // O handler ficou assíncrono de propósito: ele só responde depois que a
  // carga saiu de verdade, para quem escreve distinguir "aceito" de "entregue".
  const result = await invoke('pty:write', { sessionId: 'term-1', data: 'ls\n' })

  assert.deepEqual(result, { ok: true, delivered: true })
  assert.deepEqual(
    manager.calls.find((call) => call.method === 'write'),
    { method: 'write', sessionId: 'term-1', data: 'ls\n' },
  )
})

test('pty:resize forwards dimensions to the manager', () => {
  const { manager, invoke } = setup()

  const result = invoke('pty:resize', { sessionId: 'term-1', cols: 120, rows: 40 })

  assert.deepEqual(result, { ok: true, applied: true })
  assert.deepEqual(
    manager.calls.find((call) => call.method === 'resize'),
    { method: 'resize', sessionId: 'term-1', cols: 120, rows: 40 },
  )
})

test('pty:kill forwards the force flag to the manager', () => {
  const { manager, invoke } = setup()

  const result = invoke('pty:kill', { sessionId: 'term-1', force: true })

  assert.deepEqual(result, { ok: true, killed: true })
  assert.deepEqual(
    manager.calls.find((call) => call.method === 'kill'),
    { method: 'kill', sessionId: 'term-1', options: { force: true } },
  )
})

test('dispose force-kills every session', () => {
  const { manager, api } = setup()

  api.dispose()

  assert.deepEqual(
    manager.calls.find((call) => call.method === 'killAll'),
    { method: 'killAll', options: { force: true } },
  )
})


test('pty:write so responde depois que a escrita drenou', async () => {
  // Sem esperar o dreno, o verificador do renderer confere a tela cedo demais
  // e reescreve um texto que ainda estava saindo — duplicando o contexto.
  const { manager, invoke } = setup()
  let drenou = false
  manager.aguardarEscritas = async () => {
    await new Promise((resolve) => setImmediate(resolve))
    drenou = true
  }

  const resultado = await invoke('pty:write', { sessionId: 'term-1', data: 'oi' })

  assert.equal(drenou, true, 'a resposta veio antes do dreno terminar')
  assert.deepEqual(resultado, { ok: true, delivered: true })
})

test('pty:write nao espera dreno quando a sessao recusou a escrita', async () => {
  const { manager, invoke } = setup()
  manager.write = () => false
  let esperou = false
  manager.aguardarEscritas = async () => {
    esperou = true
  }

  const resultado = await invoke('pty:write', { sessionId: 'term-1', data: 'oi' })

  assert.equal(esperou, false)
  assert.deepEqual(resultado, { ok: true, delivered: false })
})

test('pty:spawn avisa a saída da sessão a quem acompanha a cadeia de contas', () => {
  handlers.clear()
  const exited = []
  const manager = createFakeManager()
  registerPtyIpcHandlers(() => null, { manager, onSessionExit: (sessionId) => exited.push(sessionId) })
  const result = handlers.get('pty:spawn')(null, { sessionId: 'canvas:a', command: 'codex' })
  assert.equal(result.ok, true)
  assert.deepEqual(exited, ['canvas:a'])
})

// ── Ticket da cadeia de contas (§4.1): serviço real sobre SQLite ──────────

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createStorageDatabase } = require('./storage/sqlite-database.cjs')
const { createAccountChainRepository } = require('./storage/account-chain-repository.cjs')
const { createAccountChainService } = require('./accounts/account-chain-service.cjs')
const { CHAIN_TICKET_REFUSED } = require('./pty-ipc-handlers.cjs')

const TICKET = '11111111-2222-4333-8444-555555555555'
const OTHER_TICKET = '99999999-2222-4333-8444-555555555555'

function setupChainTicket(t) {
  const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-pty-chain-ticket-'))
  const database = createStorageDatabase({ databaseDir })
  t.after(() => {
    database.close()
    fs.rmSync(databaseDir, { recursive: true, force: true })
  })
  const repository = createAccountChainRepository(database)
  const nowMs = Date.parse('2026-09-28T12:00:00.000Z')
  const service = createAccountChainService({
    repository,
    policy: {
      evaluateEligibility: () => ({ eligible: false, reason: 'membro-desabilitado' }),
      rankCandidates: () => [],
      resolveCooldownEnd: () => ({ untilAt: null, untilSource: 'checagem' }),
    },
    checkLogin: async () => null,
    describeAccount: () => null,
    listAccounts: () => [],
    listLiveSessions: () => [],
    now: () => nowMs,
  })
  // Proposta já confirmada pela pessoa para a conta B (o `confirm` tem os próprios testes).
  repository.insertSwitchEvent({
    id: TICKET,
    kind: 'continuation',
    state: 'confirmed',
    sourceSessionId: 'canvas:origem',
    lineageId: 'linhagem-1',
    hop: 1,
    fromAccountId: 'conta-a',
    fromProviderId: 'codex',
    toAccountId: 'conta-b',
    toProviderId: 'codex',
    reason: 'Limite de uso na conta Pessoal (Codex)',
    proposedAt: new Date(nowMs - 60_000).toISOString(),
    decidedAt: new Date(nowMs - 10_000).toISOString(),
    expiresAt: new Date(nowMs + 60_000).toISOString(),
  })
  handlers.clear()
  const manager = createFakeManager()
  manager.spawn = function spawn(sessionId, options) {
    this.calls.push({ method: 'spawn', sessionId, options })
  }
  registerPtyIpcHandlers(() => null, {
    manager,
    validateAccount: () => ({ ok: true }),
    chainTickets: {
      begin: (request) => service.beginTicketSpawn(request),
      finish: (request) => service.finishTicketSpawn(request),
      lineage: (request) => service.lineageForSession(request),
    },
  })
  const spawn = (params) =>
    handlers.get('pty:spawn')(null, { command: 'codex', providerId: 'codex', ...params })
  return { repository, manager, spawn }
}

test('sem ticket é o spawn comum na conta pedida, fixo ou da cadeia; ticket inválido é recusado', (t) => {
  const { manager, spawn } = setupChainTicket(t)

  // O ticket protege só o 1º spawn da troca: sem ele, o bloco da cadeia abre
  // como um fixo, na conta pedida (conferida por validateAccount), sem linhagem.
  const chain = spawn({ sessionId: 'canvas:sem-troca', accountId: 'conta-b', accountMode: 'chain' })
  assert.deepEqual(chain, { ok: true, sessionId: 'canvas:sem-troca' })
  assert.equal(manager.calls[0].options.accountMode, 'chain')

  const pinned = spawn({ sessionId: 'canvas:fixo', accountId: 'conta-b', accountMode: 'pinned' })
  assert.deepEqual(pinned, { ok: true, sessionId: 'canvas:fixo' })
  const plain = spawn({ sessionId: 'canvas:sem-modo', accountId: 'conta-b' })
  assert.equal(plain.ok, true)
  assert.equal(manager.calls.length, 3)
  assert.equal(manager.calls.every((call) => call.options.lineageId === undefined), true)

  // Ticket mal formado, ticket em bloco fixo e ticket inexistente também não passam.
  for (const params of [
    { sessionId: 'canvas:x', accountId: 'conta-b', accountMode: 'chain', chainTicket: 'nao-e-uuid' },
    { sessionId: 'canvas:x', accountId: 'conta-b', accountMode: 'pinned', chainTicket: TICKET },
    { sessionId: 'canvas:x', accountId: 'conta-b', accountMode: 'chain', chainTicket: OTHER_TICKET },
  ]) {
    assert.equal(spawn(params).code, CHAIN_TICKET_REFUSED)
  }
  assert.equal(manager.calls.length, 3)
})

test('bloco da cadeia reabre sem ticket na mesma conta e mantém a linhagem da troca', (t) => {
  const { repository, manager, spawn } = setupChainTicket(t)

  const opened = spawn({ sessionId: 'canvas:novo', accountId: 'conta-b', accountMode: 'chain', chainTicket: TICKET })
  assert.equal(opened.ok, true)

  // Reinício do app, "Reiniciar" e reanexo depois de recarregar a janela: o
  // renderer não guarda o ticket (é de uso único) e manda o spawn sem ele.
  const reopened = spawn({ sessionId: 'canvas:novo', accountId: 'conta-b', accountMode: 'chain', reuseExisting: true })
  assert.deepEqual(reopened, { ok: true, sessionId: 'canvas:novo' })
  assert.equal(manager.calls.length, 2)
  assert.equal(manager.calls[1].options.accountMode, 'chain')
  assert.equal(manager.calls[1].options.accountId, 'conta-b')
  // A linhagem segue: o teto de saltos e as contas visitadas não recomeçam.
  assert.equal(manager.calls[1].options.lineageId, 'linhagem-1')
  assert.equal(repository.getSwitchEvent(TICKET).state, 'spawned')

  // Em outra conta o bloco abre como qualquer outro, sem herdar a linhagem.
  const other = spawn({ sessionId: 'canvas:novo', accountId: 'conta-c', accountMode: 'chain' })
  assert.equal(other.ok, true)
  assert.equal(manager.calls[2].options.lineageId, undefined)
})

test('ticket confirmado abre um bloco só, na conta confirmada, e grava a linhagem', (t) => {
  const { repository, manager, spawn } = setupChainTicket(t)

  const wrongAccount = spawn({ sessionId: 'canvas:novo', accountId: 'conta-c', accountMode: 'chain', chainTicket: TICKET })
  assert.equal(wrongAccount.code, CHAIN_TICKET_REFUSED)
  assert.equal(manager.calls.length, 0)
  assert.equal(repository.getSwitchEvent(TICKET).state, 'confirmed')

  const opened = spawn({ sessionId: 'canvas:novo', accountId: 'conta-b', accountMode: 'chain', chainTicket: TICKET })
  assert.deepEqual(opened, { ok: true, sessionId: 'canvas:novo' })
  assert.equal(manager.calls[0].options.lineageId, 'linhagem-1')
  assert.equal(manager.calls[0].options.accountMode, 'chain')
  const event = repository.getSwitchEvent(TICKET)
  assert.equal(event.state, 'spawned')
  assert.equal(event.targetSessionId, 'canvas:novo')

  // Uso único: outro bloco com o mesmo ticket é recusado.
  const reused = spawn({ sessionId: 'canvas:outro', accountId: 'conta-b', accountMode: 'chain', chainTicket: TICKET })
  assert.equal(reused.code, CHAIN_TICKET_REFUSED)
  assert.equal(manager.calls.length, 1)

  // O mesmo bloco (reload, reinício) com o mesmo ticket vira spawn comum.
  const reload = spawn({ sessionId: 'canvas:novo', accountId: 'conta-b', accountMode: 'chain', chainTicket: TICKET, reuseExisting: true })
  assert.equal(reload.ok, true)
  assert.equal(manager.calls.length, 2)
  assert.equal(manager.calls[1].options.lineageId, 'linhagem-1')
})

test('spawn que falha com ticket marca a troca como falha, sem nova tentativa', (t) => {
  const { repository, manager, spawn } = setupChainTicket(t)
  manager.spawn = () => {
    throw new Error('node-pty indisponível')
  }
  const failed = spawn({ sessionId: 'canvas:novo', accountId: 'conta-b', accountMode: 'chain', chainTicket: TICKET })
  assert.equal(failed.ok, false)
  assert.equal(repository.getSwitchEvent(TICKET).state, 'spawn_failed')
  assert.equal(spawn({ sessionId: 'canvas:novo', accountId: 'conta-b', accountMode: 'chain', chainTicket: TICKET }).code, CHAIN_TICKET_REFUSED)
})

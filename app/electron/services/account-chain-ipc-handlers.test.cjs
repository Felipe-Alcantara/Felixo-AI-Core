'use strict'

/**
 * Canais `account-chain:*` montados como no `main.cjs`: runtime real (SQLite
 * com a migration 017, política pura, checagem de login com o executor
 * roteirizado da automação) e só o registro de contas e as sessões vivas como
 * dublês. Prova o formato do contrato, a recusa de formato inválido e que
 * nenhum caminho de perfil, env ou segredo sai pelos canais ou pushes.
 */

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { createStorageDatabase } = require('./storage/sqlite-database.cjs')
const { createAccountChainRuntime } = require('./accounts/account-chain-runtime.cjs')
const { createFakeAuthCommandRunner } = require('./devtools-fake-cli-pty.cjs')
const { registerAccountChainIpcHandlers, parseMembersUpdate, parseSettingsUpdate } = require('./account-chain-ipc-handlers.cjs')

const PROFILE_DIR = path.join(os.tmpdir(), 'felixo-perfil-SEGREDO-caminho')
const SENTINEL = 'sk-proj-SENTINELA0123456789abcdefghij'

function setup() {
  const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-account-chain-ipc-'))
  const database = createStorageDatabase({ databaseDir })
  const accounts = [
    { id: 'conta-a', providerId: 'codex', label: 'Pessoal' },
    { id: 'conta-b', providerId: 'codex', label: 'Trabalho' },
  ]
  const cliAccounts = {
    list: () => accounts.map((account) => ({ ...account })),
    buildEnv: () => ({ CODEX_HOME: PROFILE_DIR, OPENAI_API_KEY: SENTINEL }),
    buildProbeOptions: () => ({ codexHome: PROFILE_DIR }),
  }
  const sessions = [
    { sessionId: 'canvas:a', accountId: 'conta-a', providerId: 'codex', accountMode: 'chain', lastOutputAt: null, lineageId: null },
  ]
  const handlers = new Map()
  const sent = []
  const scheduled = []
  let ipc = null
  const runtime = createAccountChainRuntime({
    database,
    cliAccounts,
    listLiveSessions: () => sessions,
    setSessionAccountMode: (sessionId, mode) => {
      const session = sessions.find((item) => item.sessionId === sessionId)
      if (!session) return false
      session.accountMode = mode
      return true
    },
    emit: (channel, payload) => ipc?.emit(channel, payload),
    runCommand: createFakeAuthCommandRunner(),
  })
  ipc = registerAccountChainIpcHandlers({
    getService: () => runtime.service,
    view: runtime.view,
    getMainWindow: () => ({ isDestroyed: () => false, webContents: { send: (channel, payload) => sent.push({ channel, payload }) } }),
    listEnvCredentialNames: () => ['OPENAI_API_KEY'],
    schedule: (fn) => scheduled.push(fn),
    ipc: { handle: (channel, handler) => handlers.set(channel, handler) },
  })
  const invoke = (channel, params) => handlers.get(channel)(null, params)
  const flush = () => {
    while (scheduled.length > 0) scheduled.shift()()
  }
  const cleanup = () => {
    database.close()
    fs.rmSync(databaseDir, { recursive: true, force: true })
  }
  return { runtime, handlers, invoke, sent, flush, sessions, cleanup }
}

function assertNoSecrets(value) {
  const text = JSON.stringify(value)
  assert.equal(text.includes(PROFILE_DIR), false, 'caminho de perfil saiu pelo IPC')
  assert.equal(text.includes('CODEX_HOME'), false, 'nome de env de perfil saiu pelo IPC')
  assert.equal(text.includes(SENTINEL), false, 'segredo saiu pelo IPC')
}

test('formato inválido é recusado antes do serviço', () => {
  assert.equal(parseSettingsUpdate({ enabled: 'sim', expectedRevision: 0 }), null)
  assert.equal(parseSettingsUpdate({ strategy: 'aleatoria', expectedRevision: 0 }), null)
  assert.equal(parseSettingsUpdate({ maxHops: 11, expectedRevision: 0 }), null)
  assert.equal(parseSettingsUpdate({ enabled: true }), null)
  assert.deepEqual(parseSettingsUpdate({ enabled: true, maxHops: 3, expectedRevision: 2 }), {
    enabled: true,
    maxHops: 3,
    expectedRevision: 2,
  })
  assert.equal(parseMembersUpdate({ members: [{ accountId: 'a', enabled: true, multiplierDeclared: 101 }], expectedRevision: 1 }), null)
  assert.equal(parseMembersUpdate({ members: [{ accountId: 'a', enabled: true, billingDeclared: 'gratis' }], expectedRevision: 1 }), null)
  assert.equal(
    parseMembersUpdate({ members: [{ accountId: 'a', enabled: true }, { accountId: 'a', enabled: false }], expectedRevision: 1 }),
    null,
  )
})

test('canais da cadeia: estado, liga, proposta por detecção, confirma e histórico no formato do contrato, sem segredo', async (t) => {
  const { runtime, invoke, sent, flush, cleanup } = setup()
  t.after(cleanup)

  const initial = await invoke('account-chain:get-state')
  assert.equal(initial.ok, true)
  assert.deepEqual(initial.settings, { enabled: false, strategy: 'manual', maxHopsPerLineage: 3, updatedAt: null })
  assert.deepEqual(initial.members, [])
  assert.deepEqual(initial.envCredentialNames, ['OPENAI_API_KEY'])

  // Formato inválido: nada muda.
  for (const params of [undefined, { enabled: true }, { enabled: 1, expectedRevision: 0 }]) {
    const refused = await invoke('account-chain:update-settings', params)
    assert.equal(refused.ok, false)
    assert.equal(refused.code, 'INVALID')
  }
  assert.equal((await invoke('account-chain:get-state')).settings.enabled, false)

  const enabled = await invoke('account-chain:update-settings', { enabled: true, expectedRevision: 0 })
  assert.equal(enabled.ok, true)
  // Ao ligar, a lista nasce com todas as contas e desabilitadas.
  assert.deepEqual(
    enabled.state.members.map((member) => [member.accountId, member.enabled, member.reason]),
    [
      ['conta-a', false, 'membro-desabilitado'],
      ['conta-b', false, 'membro-desabilitado'],
    ],
  )

  const stale = await invoke('account-chain:update-members', {
    members: [{ accountId: 'conta-a', enabled: true, billingDeclared: null, multiplierDeclared: null }],
    expectedRevision: 0,
  })
  assert.equal(stale.ok, false)
  assert.equal(stale.code, 'REVISION_CONFLICT')
  assert.equal(stale.current.settings.enabled, true)

  const members = await invoke('account-chain:update-members', {
    members: [
      { accountId: 'conta-a', enabled: true, billingDeclared: 'assinatura', multiplierDeclared: null },
      { accountId: 'conta-b', enabled: true, billingDeclared: null, multiplierDeclared: 20 },
    ],
    expectedRevision: enabled.state.revision,
  })
  assert.equal(members.ok, true)
  const memberB = members.state.members.find((member) => member.accountId === 'conta-b')
  assert.equal(memberB.multiplier, 20)
  assert.equal(memberB.multiplierSource, 'declarado')
  assert.equal(memberB.locked, false)
  assert.equal(memberB.capacity.value, null)

  // Detecção de limite no bloco `chain` da conta A → proposta para a B.
  const outcome = await runtime.service.onOutputFailure({
    sessionId: 'canvas:a',
    accountId: 'conta-a',
    providerId: 'codex',
    accountMode: 'chain',
    failure: {
      failureClass: 'limit',
      scope: 'account',
      ambiguous: false,
      evidence: `You've hit your usage limit. Try again in 3 hours. ${SENTINEL}`,
      evidenceHash: 'hash-limite-1',
    },
  })
  assert.equal(outcome.action, 'proposed')

  const detection = sent.find((item) => item.channel === 'account-chain:detection').payload
  assert.equal(detection.outcome, 'proposed')
  assert.equal(detection.accountMode, 'chain')
  assert.equal(detection.accountLabel, 'Pessoal')
  assert.equal(detection.proposalId, outcome.event.id)
  assert.equal(detection.cooldown.failureClass, 'limit')

  const opened = sent.find((item) => item.channel === 'account-chain:proposal').payload
  assert.equal(opened.type, 'opened')
  assert.equal(opened.proposal.recommendedAccountId, 'conta-b')
  assert.deepEqual(opened.proposal.candidates.map((candidate) => candidate.accountId), ['conta-b'])
  assert.equal(opened.proposal.candidates[0].login.status, 'logged_in')
  assert.deepEqual(opened.proposal.excluded.map((item) => item.accountId), ['conta-a'])
  assert.equal(opened.proposal.from.label, 'Pessoal')

  const state = await invoke('account-chain:get-state')
  assert.equal(state.pendingProposals.length, 1)
  assert.equal(state.cooldowns.length, 1)

  for (const params of [{ proposalId: 'nao-e-uuid', destinationAccountId: 'conta-b' }, { proposalId: outcome.event.id }]) {
    assert.equal((await invoke('account-chain:confirm', params)).code, 'INVALID')
  }
  const confirmed = await invoke('account-chain:confirm', { proposalId: outcome.event.id, destinationAccountId: 'conta-b' })
  assert.deepEqual(Object.keys(confirmed).sort(), ['destination', 'ok', 'ticket'])
  assert.equal(confirmed.ticket, outcome.event.id)
  assert.deepEqual(confirmed.destination, { accountId: 'conta-b', providerId: 'codex', label: 'Trabalho' })

  flush()
  const closed = sent.filter((item) => item.channel === 'account-chain:proposal').map((item) => item.payload)
  assert.deepEqual(closed.at(-1), { type: 'closed', proposalId: outcome.event.id, state: 'confirmed', sourceSessionId: 'canvas:a' })
  const changed = sent.filter((item) => item.channel === 'account-chain:changed').at(-1).payload
  assert.equal(changed.pendingProposals.length, 0)

  assert.equal((await invoke('account-chain:history', { limit: 0 })).code, 'INVALID')
  assert.equal((await invoke('account-chain:history', { limit: 51 })).code, 'INVALID')
  const history = await invoke('account-chain:history', { limit: 10 })
  assert.equal(history.ok, true)
  assert.equal(history.hasMore, false)
  assert.equal(history.entries[0].state, 'confirmed')
  assert.deepEqual(history.entries[0].to, { accountId: 'conta-b', providerId: 'codex', label: 'Trabalho' })

  const redacted = await invoke('account-chain:redact-transcript', { text: `saida ${SENTINEL} fim` })
  assert.equal(redacted.ok, true)
  assert.equal(redacted.chars, redacted.text.length)
  assert.equal((await invoke('account-chain:check-login', { accountIds: ['a', 'b', 'c', 'd', 'e', 'f'] })).code, 'INVALID')
  const checked = await invoke('account-chain:check-login', { accountIds: ['conta-b'] })
  assert.deepEqual(Object.keys(checked.results[0].login).sort(), ['checkedAt', 'identityStatus', 'method', 'plan', 'source', 'status'])

  assert.equal((await invoke('account-chain:set-session-mode', { sessionId: 'canvas:a', mode: 'auto' })).code, 'INVALID')
  assert.deepEqual(await invoke('account-chain:set-session-mode', { sessionId: 'canvas:a', mode: 'pinned' }), { ok: true })
  assert.equal((await invoke('account-chain:record-manual', { sourceSessionId: 'canvas:a', toAccountId: null, toProviderId: 'codex', reasonClass: 'network' })).code, 'INVALID')

  assertNoSecrets([initial, enabled, members, state, confirmed, history, redacted, checked, sent])
})

test('sem serviço montado, todo canal responde falha no formato do contrato', async () => {
  const handlers = new Map()
  registerAccountChainIpcHandlers({
    getService: () => null,
    view: {},
    ipc: { handle: (channel, handler) => handlers.set(channel, handler) },
  })
  const result = await handlers.get('account-chain:get-state')(null)
  assert.equal(result.ok, false)
  assert.equal(result.code, 'UNAVAILABLE')
})

test('contrato: o preload expõe exatamente a AccountChainBridge e o main liga serviço, vigia e recuperação', () => {
  const contract = fs.readFileSync(path.join(__dirname, '../../src/features/shared/types/account-chain.ts'), 'utf8')
  const bridge = contract.slice(contract.indexOf('export type AccountChainBridge'))
  const bridgeBody = bridge.slice(0, bridge.indexOf('\n}\n'))
  const methods = [...bridgeBody.matchAll(/^ {2}([a-zA-Z]+):/gm)].map((match) => match[1]).sort()

  const preload = fs.readFileSync(path.join(__dirname, '../preload.cjs'), 'utf8')
  const block = preload.slice(preload.indexOf('  accountChain: {'), preload.indexOf('  agentUsage: {'))
  const exposed = [...block.matchAll(/^ {4}([a-zA-Z]+): /gm)].map((match) => match[1]).sort()
  assert.deepEqual(exposed, methods)
  for (const method of methods.filter((name) => !name.startsWith('on'))) {
    const channel = `account-chain:${method.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`
    assert.match(block, new RegExp(`ipcRenderer\\.invoke\\('${channel}'`), `canal ${channel}`)
  }

  const main = fs.readFileSync(path.join(__dirname, '../main.cjs'), 'utf8')
  for (const wiring of [
    'createAccountChainRuntime(',
    'registerAccountChainIpcHandlers(',
    'accountChain.service.recoverOnStartup()',
    'accountChain.service.startExpirySweeper()',
    'accountChain.service.onSessionExit(sessionId)',
    'createOutputWatcher: createAccountOutputWatcher',
    'accountChain.service.onOutputFailure(detection)',
  ]) {
    assert.ok(main.includes(wiring), `main.cjs sem ${wiring}`)
  }
})

'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { createStorageDatabase } = require('../storage/sqlite-database.cjs')
const { createAccountChainRepository } = require('../storage/account-chain-repository.cjs')
const { createAccountChainService, normalizeDetection } = require('./account-chain-service.cjs')

const START_MS = Date.parse('2026-09-28T12:00:00.000Z')
const MINUTE = 60 * 1000
const LOGIN_TTL_MS = 15 * MINUTE
const SENTINELS = ['sk-proj-SENTINELA0123456789abcdef', 'sk-or-v1-SENTINELA0123456789abcdef', 'Bearer SENTINELA-bearer-0123456789']

const LIMIT_FAILURE = Object.freeze({
  failureClass: 'limit',
  scope: 'account',
  ambiguous: false,
  evidence: 'You’ve hit your usage limit. Try again in 3 hours.',
  evidenceHash: 'hash-limite-a',
})

/**
 * Dublê da política (commit 16): as razões seguem a ordem do §6.1 no que o
 * serviço precisa distinguir; o rodízio só devolve a ordem manual e anota o
 * cursor que recebeu.
 */
function createFakePolicy() {
  const calls = { rank: [] }
  return {
    calls,
    evaluateEligibility({ nowMs, settings, member, account, cooldown, loginCheck, sourceAccountId, visitedAccountIds }) {
      if (!settings.enabled) return { eligible: false, reason: 'cadeia-desligada' }
      if (!member.enabled) return { eligible: false, reason: 'membro-desabilitado' }
      if (!account) return { eligible: false, reason: 'conta-removida' }
      if (cooldown && !cooldown.releasedAt) return { eligible: false, reason: 'em-espera' }
      const fresh = loginCheck && nowMs - Date.parse(loginCheck.checkedAt) <= LOGIN_TTL_MS
      if (!fresh) return { eligible: false, reason: 'login-nao-conferido' }
      if (loginCheck.status !== 'logged_in') return { eligible: false, reason: 'deslogada' }
      if (member.accountId === sourceAccountId) return { eligible: false, reason: 'origem' }
      if (visitedAccountIds.includes(member.accountId)) return { eligible: false, reason: 'ja-visitada-na-linhagem' }
      return { eligible: true, reason: null }
    },
    rankCandidates({ strategy, candidates, lastDestinationAccountId }) {
      calls.rank.push({ strategy, ids: candidates.map((item) => item.accountId), lastDestinationAccountId })
      return candidates.map((item) => ({ accountId: item.accountId, explanation: '1ª apta na ordem manual' }))
    },
    resolveCooldownEnd({ nowMs }) {
      return { untilAt: new Date(nowMs + 3 * 60 * MINUTE).toISOString(), untilSource: 'texto' }
    },
  }
}

/**
 * Monta o serviço com SQLite real (migration 017) e dublês para o resto:
 * relógio, ids, contas, sessões vivas, checagem de login e push.
 */
function withService(action, options = {}) {
  const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-account-chain-service-'))
  const database = createStorageDatabase({ databaseDir })
  const repository = createAccountChainRepository(database)
  const clock = { ms: START_MS }
  let idCounter = 0
  const accounts = new Map(
    Object.entries(
      options.accounts ?? {
        'conta-a': { providerId: 'codex', label: 'Pessoal' },
        'conta-b': { providerId: 'codex', label: 'Trabalho' },
        'conta-c': { providerId: 'claude', label: 'Claude Max' },
      },
    ),
  )
  const sessions = new Map()
  const loginResults = new Map()
  const checkCalls = []
  const emitted = []
  const logged = []
  const policy = createFakePolicy()

  const env = {
    repository,
    policy,
    clock,
    accounts,
    sessions,
    loginResults,
    checkCalls,
    emitted,
    logged,
    advance(ms) {
      clock.ms += ms
    },
    nowIso() {
      return new Date(clock.ms).toISOString()
    },
    addSession(sessionId, overrides = {}) {
      sessions.set(sessionId, {
        sessionId,
        accountId: 'conta-a',
        providerId: 'codex',
        accountMode: 'chain',
        lastOutputAt: clock.ms - MINUTE,
        ...overrides,
      })
    },
    recordLogin(accountId, status = 'logged_in') {
      repository.recordLoginCheck({
        accountId,
        providerId: accounts.get(accountId)?.providerId ?? 'codex',
        status,
        checkedAt: new Date(clock.ms).toISOString(),
        source: 'checagem',
      })
    },
    /** Liga a cadeia com os membros na ordem, habilitados. */
    enableChain(memberIds = ['conta-a', 'conta-b', 'conta-c'], settings = {}) {
      const current = repository.readSettings()
      repository.updateSettings({ expectedRevision: current.revision, enabled: true, nowIso: env.nowIso(), ...settings })
      repository.replaceMembers({
        members: memberIds.map((accountId) => ({ accountId, providerId: accounts.get(accountId).providerId, enabled: true })),
        expectedRevision: repository.readSettings().revision,
        nowIso: env.nowIso(),
      })
    },
    detection(overrides = {}) {
      return {
        sessionId: 'sessao-1',
        accountId: 'conta-a',
        providerId: 'codex',
        accountMode: 'chain',
        lineageId: 'linhagem-1',
        failure: LIMIT_FAILURE,
        ...overrides,
      }
    },
    channel(name) {
      return emitted.filter((item) => item.channel === name).map((item) => item.payload)
    },
  }

  env.service = createAccountChainService({
    repository,
    policy,
    async checkLogin(accountId) {
      checkCalls.push(accountId)
      const status = loginResults.get(accountId)
      if (status) env.recordLogin(accountId, status)
    },
    describeAccount(accountId) {
      const account = accounts.get(accountId)
      return account ? { ...account, measurement: null } : null
    },
    listAccounts() {
      if (options.accountsUnreadable) throw new Error('registro ilegível')
      return [...accounts].map(([id, account]) => ({ id, ...account }))
    },
    listLiveSessions: () => [...sessions.values()],
    setSessionAccountMode(sessionId, mode) {
      const session = sessions.get(sessionId)
      if (!session) return false
      session.accountMode = mode
      return true
    },
    emit: (channel, payload) => emitted.push({ channel, payload }),
    log: (entry) => logged.push(entry),
    now: () => clock.ms,
    randomUUID: () => `evento-${++idCounter}`,
  })

  return Promise.resolve()
    .then(() => action(env))
    .finally(() => {
      database.close()
      fs.rmSync(databaseDir, { recursive: true, force: true })
    })
}

/** Cenário padrão: cadeia ligada, origem A viva em modo cadeia, B com login conferido. */
function chainReady(env) {
  env.enableChain()
  env.addSession('sessao-1')
  env.recordLogin('conta-b')
  env.recordLogin('conta-c')
}

async function proposeFromSession1(env) {
  const outcome = await env.service.onOutputFailure(env.detection())
  assert.equal(outcome.action, 'proposed')
  return outcome.event
}

test('detecção de limite em bloco da cadeia: espera da origem, proposta para a 1ª apta e nenhum spawn', async () => {
  await withService(async (env) => {
    chainReady(env)
    const outcome = await env.service.onOutputFailure(env.detection())

    assert.equal(outcome.action, 'proposed')
    const cooldown = env.repository.getCooldown('conta-a')
    assert.equal(cooldown.failureClass, 'limit')
    assert.equal(cooldown.untilSource, 'texto')
    assert.equal(cooldown.sessionId, 'sessao-1')

    const event = env.repository.getSwitchEvent(outcome.event.id)
    assert.equal(event.state, 'proposed')
    assert.equal(event.kind, 'continuation')
    assert.equal(event.toAccountId, 'conta-b')
    assert.equal(event.toLabel, 'Trabalho')
    assert.equal(event.fromLabel, 'Pessoal')
    assert.equal(event.chosenBy, 'chain')
    assert.equal(event.hop, 1)
    assert.equal(event.incidentKey, `conta-a|${cooldown.detectedAt}`)
    assert.equal(event.expiresAt, new Date(START_MS + 30 * MINUTE).toISOString())
    assert.match(event.reason, /Limite de uso na conta Pessoal \(Codex\)/)
    assert.deepEqual(
      event.candidates.map((item) => [item.accountId, item.selectable, item.reason]),
      [
        ['conta-b', true, null],
        ['conta-c', true, null],
        ['conta-a', false, 'em-espera'],
      ],
    )
    assert.deepEqual(env.channel('account-chain:proposal').map((item) => item.id), [event.id])
    assert.equal(env.channel('account-chain:detection')[0].action, 'proposed')
    assert.equal(env.checkCalls.length, 0, 'destino com login recente não roda CLI')
  })
})

test('bloco fixo, Login do sistema e cadeia desligada só registram noticed; o sistema nem entra em espera', async () => {
  await withService(async (env) => {
    env.enableChain()
    env.recordLogin('conta-b')
    env.addSession('fixo', { accountMode: 'pinned' })
    env.addSession('sistema', { accountId: null, accountMode: 'pinned' })

    const pinned = await env.service.onOutputFailure(env.detection({ sessionId: 'fixo', accountMode: 'pinned' }))
    const system = await env.service.onOutputFailure(env.detection({ sessionId: 'sistema', accountId: null }))
    assert.equal(pinned.action, 'noticed')
    assert.equal(system.action, 'noticed')
    assert.equal(env.repository.getSwitchEvent(pinned.event.id).kind, 'notice')
    assert.equal(env.repository.getSwitchEvent(system.event.id).fromLabel, 'Login do sistema')
    assert.ok(env.repository.getCooldown('conta-a'), 'bloco fixo põe a conta em espera')
    assert.equal(env.repository.listCooldowns().length, 1, 'Login do sistema não entra em espera')

    env.repository.updateSettings({ expectedRevision: env.repository.readSettings().revision, enabled: false, nowIso: env.nowIso() })
    env.addSession('cadeia', { accountId: 'conta-b' })
    const disabled = await env.service.onOutputFailure(
      env.detection({ sessionId: 'cadeia', accountId: 'conta-b', failure: { ...LIMIT_FAILURE, evidenceHash: 'hash-b' } }),
    )
    assert.equal(disabled.action, 'noticed')
    assert.equal(env.repository.listOpenSwitchEvents().length, 0)
    assert.equal(env.channel('account-chain:proposal').length, 0)
  })
})

test('I7: rede, provedor, tempo e cancelado nunca gravam espera nem proposta; limite do modelo também não', async () => {
  await withService(async (env) => {
    chainReady(env)
    for (const failureClass of ['network', 'provider', 'timeout', 'cancelled', 'unknown']) {
      const outcome = await env.service.onOutputFailure(
        env.detection({ failure: { failureClass, scope: 'account', evidence: 'ECONNRESET', evidenceHash: `h-${failureClass}` } }),
      )
      assert.equal(outcome.action, ['network', 'provider', 'timeout'].includes(failureClass) ? 'transient' : 'ignored')
    }
    const model = await env.service.onOutputFailure(env.detection({ failure: { ...LIMIT_FAILURE, scope: 'model' } }))
    assert.equal(model.action, 'model_limit')

    assert.deepEqual(env.repository.listCooldowns(), [])
    assert.deepEqual(env.repository.listSwitchEvents(), [])
    assert.equal(env.channel('account-chain:detection').filter((item) => item.action === 'transient').length, 3)
  })
})

test('ambíguo (403) não entra em espera sozinho; "tratar como limite" põe em espera e propõe; "ignorar" some', async () => {
  await withService(async (env) => {
    chainReady(env)
    const forbidden = { failureClass: 'auth', scope: 'account', ambiguous: true, evidence: '403 Forbidden', evidenceHash: 'h-403' }
    const outcome = await env.service.onOutputFailure(env.detection({ failure: forbidden }))
    assert.equal(outcome.action, 'ambiguous')
    assert.deepEqual(env.repository.listCooldowns(), [])
    assert.equal(env.service.getState().ambiguousDetections.length, 1)

    const resolved = await env.service.resolveAmbiguous({ detectionId: outcome.detectionId, treatAs: 'limit' })
    assert.equal(resolved.action, 'proposed')
    assert.equal(env.repository.getCooldown('conta-a').failureClass, 'limit')
    assert.deepEqual(await env.service.resolveAmbiguous({ detectionId: outcome.detectionId, treatAs: 'limit' }), {
      ok: false,
      code: 'NOT_PENDING',
    })

    const again = await env.service.onOutputFailure(env.detection({ failure: { ...forbidden, evidenceHash: 'h-403-2' } }))
    assert.deepEqual(await env.service.resolveAmbiguous({ detectionId: again.detectionId, treatAs: 'ignore' }), {
      ok: true,
      action: 'ignored',
    })
    assert.equal(env.service.getState().ambiguousDetections.length, 0)
  })
})

test('I1 e dedupe: a mesma evidência 50× e duas detecções simultâneas da sessão geram uma proposta só', async () => {
  await withService(async (env) => {
    chainReady(env)
    const outcomes = await Promise.all([
      env.service.onOutputFailure(env.detection()),
      env.service.onOutputFailure(env.detection({ failure: { ...LIMIT_FAILURE, evidenceHash: 'hash-outra' } })),
    ])
    assert.deepEqual(outcomes.map((item) => item.action).sort(), ['duplicate', 'proposed'])
    for (let index = 0; index < 50; index++) {
      assert.equal((await env.service.onOutputFailure(env.detection())).action, 'duplicate')
    }
    assert.equal(env.repository.listSwitchEvents().length, 1)
    assert.equal(env.channel('account-chain:proposal').length, 1)
  })
})

test('confirm duplo (em sequência e ao mesmo tempo) gera um ticket só; decline depois de confirm é NOT_PENDING', async () => {
  await withService(async (env) => {
    chainReady(env)
    const proposal = await proposeFromSession1(env)
    const [first, second] = await Promise.all([
      env.service.confirm({ proposalId: proposal.id, destinationAccountId: 'conta-b' }),
      env.service.confirm({ proposalId: proposal.id, destinationAccountId: 'conta-b' }),
    ])
    assert.equal(first.ok, true)
    assert.equal(second.ok, true)
    assert.equal(first.ticket, proposal.id)
    assert.equal(second.ticket, proposal.id)
    assert.deepEqual([first.alreadyConfirmed, second.alreadyConfirmed].sort(), [false, true])

    const third = await env.service.confirm({ proposalId: proposal.id, destinationAccountId: 'conta-b' })
    assert.equal(third.alreadyConfirmed, true)
    assert.deepEqual(await env.service.confirm({ proposalId: proposal.id, destinationAccountId: 'conta-c' }), {
      ok: false,
      code: 'NOT_PENDING',
    })

    const event = env.repository.getSwitchEvent(proposal.id)
    assert.equal(event.state, 'confirmed')
    assert.equal(event.expiresAt, new Date(START_MS + 2 * MINUTE).toISOString(), 'ticket vale 2 min')
    assert.deepEqual(await env.service.decline({ proposalId: proposal.id, reason: 'later' }), { ok: false, code: 'NOT_PENDING' })
  })
})

test('I2, I3 e I8: só ticket confirmado, da mesma conta, gera um processo; a mesma sessão depois é idempotente', async () => {
  await withService(async (env) => {
    chainReady(env)
    const proposal = await proposeFromSession1(env)

    assert.equal(
      env.service.beginTicketSpawn({ ticket: proposal.id, accountId: 'conta-b', sessionId: 'nova' }).code,
      'TICKET_NOT_CONFIRMED',
      'sem confirm nenhum spawn nasce da cadeia',
    )
    assert.equal(env.service.beginTicketSpawn({ ticket: 'nao-existe', accountId: 'conta-b', sessionId: 'nova' }).code, 'TICKET_NOT_FOUND')

    await env.service.confirm({ proposalId: proposal.id, destinationAccountId: 'conta-b' })
    assert.equal(
      env.service.beginTicketSpawn({ ticket: proposal.id, accountId: 'conta-c', sessionId: 'nova' }).code,
      'TICKET_ACCOUNT_MISMATCH',
    )

    const began = env.service.beginTicketSpawn({ ticket: proposal.id, accountId: 'conta-b', sessionId: 'nova' })
    assert.deepEqual(began, { ok: true, alreadySpawned: false, eventId: proposal.id, lineageId: 'linhagem-1', hop: 1 })
    assert.equal(env.service.beginTicketSpawn({ ticket: proposal.id, accountId: 'conta-b', sessionId: 'nova' }).code, 'TICKET_IN_USE')

    assert.deepEqual(env.service.finishTicketSpawn({ ticket: proposal.id, sessionId: 'nova', ok: true }), { ok: true, state: 'spawned' })
    const event = env.repository.getSwitchEvent(proposal.id)
    assert.equal(event.targetSessionId, 'nova')
    assert.equal(event.spawnedAt, env.nowIso())

    assert.equal(env.service.beginTicketSpawn({ ticket: proposal.id, accountId: 'conta-b', sessionId: 'nova' }).alreadySpawned, true)
    assert.equal(env.service.beginTicketSpawn({ ticket: proposal.id, accountId: 'conta-b', sessionId: 'outra' }).code, 'TICKET_USED')
  })
})

test('spawn do destino que falha vira spawn_failed, sem retry; o ticket não serve de novo', async () => {
  await withService(async (env) => {
    chainReady(env)
    const proposal = await proposeFromSession1(env)
    await env.service.confirm({ proposalId: proposal.id, destinationAccountId: 'conta-b' })
    env.service.beginTicketSpawn({ ticket: proposal.id, accountId: 'conta-b', sessionId: 'nova' })
    assert.deepEqual(env.service.finishTicketSpawn({ ticket: proposal.id, sessionId: 'nova', ok: false }), {
      ok: true,
      state: 'spawn_failed',
    })
    assert.equal(env.service.beginTicketSpawn({ ticket: proposal.id, accountId: 'conta-b', sessionId: 'nova' }).code, 'TICKET_NOT_CONFIRMED')
    assert.equal((await env.service.onOutputFailure(env.detection())).action, 'duplicate', 'a mesma evidência não repropõe')
  })
})

test('prazo: proposta com mais de 30 min e ticket com mais de 2 min são recusados e vencem', async () => {
  await withService(async (env) => {
    chainReady(env)
    const proposal = await proposeFromSession1(env)
    env.advance(30 * MINUTE)
    assert.equal((await env.service.confirm({ proposalId: proposal.id, destinationAccountId: 'conta-b' })).code, 'EXPIRED')
    assert.equal(env.repository.getSwitchEvent(proposal.id).state, 'expired')

    env.addSession('sessao-2')
    env.recordLogin('conta-b')
    const second = await env.service.onOutputFailure(
      env.detection({ sessionId: 'sessao-2', lineageId: 'linhagem-2', failure: { ...LIMIT_FAILURE, evidenceHash: 'hash-2' } }),
    )
    await env.service.confirm({ proposalId: second.event.id, destinationAccountId: 'conta-b' })
    env.advance(2 * MINUTE)
    assert.equal(
      env.service.beginTicketSpawn({ ticket: second.event.id, accountId: 'conta-b', sessionId: 'nova' }).code,
      'TICKET_EXPIRED',
    )
    assert.equal(env.repository.getSwitchEvent(second.event.id).state, 'expired')
  })
})

test('a origem que saiu, o bloco fixado ou a cadeia desligada vencem a proposta sem executar', async () => {
  await withService(async (env) => {
    chainReady(env)
    const proposal = await proposeFromSession1(env)
    assert.deepEqual(env.service.setSessionMode({ sessionId: 'sessao-1', mode: 'pinned' }), { ok: true })
    assert.equal(env.repository.getSwitchEvent(proposal.id).state, 'expired')
    assert.equal((await env.service.confirm({ proposalId: proposal.id, destinationAccountId: 'conta-b' })).code, 'EXPIRED')

    env.addSession('sessao-2')
    const second = await env.service.onOutputFailure(
      env.detection({ sessionId: 'sessao-2', lineageId: 'l2', failure: { ...LIMIT_FAILURE, evidenceHash: 'hash-2' } }),
    )
    env.sessions.delete('sessao-2')
    const gone = await env.service.confirm({ proposalId: second.event.id, destinationAccountId: 'conta-b' })
    assert.deepEqual(gone, { ok: false, code: 'EXPIRED', reason: 'origem-saiu' })

    env.addSession('sessao-3')
    const third = await env.service.onOutputFailure(
      env.detection({ sessionId: 'sessao-3', lineageId: 'l3', failure: { ...LIMIT_FAILURE, evidenceHash: 'hash-3' } }),
    )
    assert.equal(env.service.onSessionExit('sessao-3'), 1)
    assert.equal(env.repository.getSwitchEvent(third.event.id).state, 'expired')

    env.addSession('sessao-4')
    const fourth = await env.service.onOutputFailure(
      env.detection({ sessionId: 'sessao-4', lineageId: 'l4', failure: { ...LIMIT_FAILURE, evidenceHash: 'hash-4' } }),
    )
    const settings = env.service.updateSettings({ enabled: false, expectedRevision: env.repository.readSettings().revision })
    assert.equal(settings.ok, true)
    assert.equal(env.repository.getSwitchEvent(fourth.event.id).state, 'expired')
  })
})

test('SUPERSEDED: o recomendado perdeu o login entre a proposta e o confirm; nasce outra proposta, sem trocar sozinho', async () => {
  await withService(async (env) => {
    chainReady(env)
    const proposal = await proposeFromSession1(env)
    env.advance(16 * MINUTE)
    env.recordLogin('conta-c')
    env.loginResults.set('conta-b', 'logged_out')

    const result = await env.service.confirm({ proposalId: proposal.id, destinationAccountId: 'conta-b' })
    assert.equal(result.code, 'SUPERSEDED')
    assert.deepEqual(env.checkCalls, ['conta-b'], 'login vencido é conferido de novo no confirm')
    assert.equal(env.repository.getSwitchEvent(proposal.id).state, 'superseded')
    assert.equal(result.proposal.state, 'proposed')
    assert.equal(result.proposal.toAccountId, 'conta-c')
    assert.equal(result.proposal.evidenceHash, proposal.evidenceHash)
    assert.equal(env.repository.findOpenSwitchEventForSession('sessao-1').id, result.proposal.id)
    assert.equal(env.repository.getSwitchEvent(result.proposal.id).state, 'proposed', 'a nova também espera confirmação')
  })
})

test('destino escolhido pela pessoa que ficou inapto é NOT_ELIGIBLE; fora da lista, origem ou visitado também', async () => {
  await withService(async (env) => {
    chainReady(env)
    const proposal = await proposeFromSession1(env)
    assert.equal((await env.service.confirm({ proposalId: proposal.id, destinationAccountId: 'conta-a' })).code, 'NOT_ELIGIBLE')
    assert.equal((await env.service.confirm({ proposalId: proposal.id, destinationAccountId: 'conta-z' })).code, 'NOT_ELIGIBLE')

    env.recordLogin('conta-c', 'logged_out')
    const chosen = await env.service.confirm({ proposalId: proposal.id, destinationAccountId: 'conta-c' })
    assert.deepEqual(chosen, { ok: false, code: 'NOT_ELIGIBLE', reason: 'deslogada' })
    assert.equal(env.repository.getSwitchEvent(proposal.id).state, 'proposed')
  })
})

test('SOURCE_ACTIVE: origem ainda escrevendo pede um segundo aceite; com o aceite passa e fica gravado', async () => {
  await withService(async (env) => {
    chainReady(env)
    const proposal = await proposeFromSession1(env)
    env.sessions.get('sessao-1').lastOutputAt = env.clock.ms - 1000

    assert.deepEqual(await env.service.confirm({ proposalId: proposal.id, destinationAccountId: 'conta-b' }), {
      ok: false,
      code: 'SOURCE_ACTIVE',
    })
    assert.equal(env.repository.getSwitchEvent(proposal.id).state, 'proposed', 'sem bloqueio: a proposta continua')

    const acked = await env.service.confirm({
      proposalId: proposal.id,
      destinationAccountId: 'conta-b',
      acknowledgeSourceActive: true,
      transcriptChars: 1234,
    })
    assert.equal(acked.ok, true)
    assert.equal(env.repository.getSwitchEvent(proposal.id).sourceActiveAck, true)
    // O tamanho do contexto que o renderer vai levar fica no registro (só o número).
    assert.equal(env.repository.getSwitchEvent(proposal.id).transcriptChars, 1234)
  })
})

test('escolher outro candidato apto grava chosen_by person; o recomendado grava chain', async () => {
  await withService(async (env) => {
    chainReady(env)
    const proposal = await proposeFromSession1(env)
    const result = await env.service.confirm({ proposalId: proposal.id, destinationAccountId: 'conta-c' })
    assert.equal(result.ok, true)
    assert.deepEqual(result.destination, { accountId: 'conta-c', providerId: 'claude', label: 'Claude Max' })
    const event = env.repository.getSwitchEvent(proposal.id)
    assert.equal(event.chosenBy, 'person')
    assert.equal(event.toAccountId, 'conta-c')
    assert.equal(event.toProviderId, 'claude', 'a troca pode cruzar provedores (decisão 2)')
  })
})

test('I6: "Agora não" silencia a mesma evidência; evidência nova gera proposta nova', async () => {
  await withService(async (env) => {
    chainReady(env)
    const proposal = await proposeFromSession1(env)
    assert.deepEqual(await env.service.decline({ proposalId: proposal.id, reason: 'later' }), { ok: true, cooldownReleased: false })
    assert.equal(env.repository.getSwitchEvent(proposal.id).state, 'declined')
    assert.ok(env.repository.getCooldown('conta-a'), 'recusar a troca não tira a conta da espera')

    assert.equal((await env.service.onOutputFailure(env.detection())).action, 'silenced')
    const fresh = await env.service.onOutputFailure(env.detection({ failure: { ...LIMIT_FAILURE, evidenceHash: 'hash-nova' } }))
    assert.equal(fresh.action, 'proposed')
  })
})

test('"Não era limite": dismissed, espera da origem liberada, propostas irmãs vencem e a evidência fica silenciada', async () => {
  await withService(async (env) => {
    chainReady(env)
    env.addSession('sessao-2')
    const proposal = await proposeFromSession1(env)
    const sibling = await env.service.onOutputFailure(env.detection({ sessionId: 'sessao-2', lineageId: 'l2' }))
    assert.equal(sibling.action, 'proposed')

    assert.deepEqual(await env.service.decline({ proposalId: proposal.id, reason: 'not-a-limit' }), {
      ok: true,
      cooldownReleased: true,
    })
    assert.equal(env.repository.getSwitchEvent(proposal.id).state, 'dismissed')
    assert.equal(env.repository.getCooldown('conta-a').releasedBy, 'nao_era_limite')
    assert.equal(env.repository.getSwitchEvent(sibling.event.id).state, 'expired')
    assert.equal((await env.service.onOutputFailure(env.detection())).action, 'silenced')
  })
})

test('no_candidate: todas as contas fora; nenhuma volta antes do reset e o motivo fica registrado', async () => {
  await withService(async (env) => {
    env.enableChain(['conta-a', 'conta-b'])
    env.addSession('sessao-1')
    env.repository.upsertCooldown({
      accountId: 'conta-b',
      providerId: 'codex',
      failureClass: 'limit',
      detectedAt: env.nowIso(),
      untilAt: new Date(START_MS + 60 * MINUTE).toISOString(),
      untilSource: 'texto',
    })
    const outcome = await env.service.onOutputFailure(env.detection())
    assert.equal(outcome.action, 'no_candidate')
    const event = env.repository.getSwitchEvent(outcome.event.id)
    assert.equal(event.state, 'no_candidate')
    assert.match(event.reason, /nenhuma conta apta agora/)
    assert.deepEqual(
      event.candidates.map((item) => [item.accountId, item.reason]),
      [
        ['conta-a', 'em-espera'],
        ['conta-b', 'em-espera'],
      ],
    )
    assert.equal(env.channel('account-chain:proposal').length, 0)
  })
})

test('checagem de login preguiçosa: na ordem da estratégia, no máximo 3 por proposta, parando na primeira apta', async () => {
  await withService(
    async (env) => {
      env.enableChain(['conta-a', 'd1', 'd2', 'd3', 'd4', 'd5'])
      env.addSession('sessao-1')
      env.loginResults.set('d1', 'logged_out')
      env.loginResults.set('d2', 'logged_in')

      const outcome = await env.service.onOutputFailure(env.detection())
      assert.equal(outcome.event.toAccountId, 'd2')
      assert.deepEqual(env.checkCalls, ['d1', 'd2'], 'para na primeira apta')

      env.checkCalls.length = 0
      env.addSession('sessao-2', { accountId: 'd2' })
      for (const id of ['d3', 'd4', 'd5']) env.loginResults.set(id, 'logged_out')
      const second = await env.service.onOutputFailure(
        env.detection({ sessionId: 'sessao-2', accountId: 'd2', lineageId: 'l2', failure: { ...LIMIT_FAILURE, evidenceHash: 'h2' } }),
      )
      assert.equal(second.action, 'no_candidate')
      assert.deepEqual(env.checkCalls, ['d3', 'd4', 'd5'], 'teto de 3 checagens por proposta')
    },
    {
      accounts: Object.fromEntries(
        ['conta-a', 'd1', 'd2', 'd3', 'd4', 'd5'].map((id) => [id, { providerId: 'codex', label: id.toUpperCase() }]),
      ),
    },
  )
})

test('I5: teto de saltos por linhagem vira no_candidate; a origem e as contas visitadas nunca são destino', async () => {
  await withService(async (env) => {
    env.enableChain(['conta-a', 'conta-b', 'conta-c'], { maxHopsPerLineage: 2 })
    env.addSession('sessao-1')
    env.recordLogin('conta-b')
    env.recordLogin('conta-c')

    // Salto 1: A → B.
    const first = await proposeFromSession1(env)
    await env.service.confirm({ proposalId: first.id, destinationAccountId: 'conta-b' })
    env.service.beginTicketSpawn({ ticket: first.id, accountId: 'conta-b', sessionId: 'sessao-b' })
    env.service.finishTicketSpawn({ ticket: first.id, sessionId: 'sessao-b', ok: true })

    // B bate o limite; A (visitada) ainda está em espera e não pode ser destino.
    env.addSession('sessao-b', { accountId: 'conta-b' })
    env.advance(5 * MINUTE)
    env.recordLogin('conta-a')
    env.recordLogin('conta-c')
    env.repository.releaseCooldown({ accountId: 'conta-a', releasedBy: 'manual', releasedAt: env.nowIso() })
    const second = await env.service.onOutputFailure(
      env.detection({ sessionId: 'sessao-b', accountId: 'conta-b', failure: { ...LIMIT_FAILURE, evidenceHash: 'hash-b' } }),
    )
    assert.equal(second.event.toAccountId, 'conta-c')
    assert.equal(second.event.hop, 2)
    const visited = second.event.candidates.find((item) => item.accountId === 'conta-a')
    assert.equal(visited.reason, 'ja-visitada-na-linhagem', 'A→B→A não acontece')
    assert.equal((await env.service.confirm({ proposalId: second.event.id, destinationAccountId: 'conta-a' })).code, 'NOT_ELIGIBLE')

    await env.service.confirm({ proposalId: second.event.id, destinationAccountId: 'conta-c' })
    env.service.beginTicketSpawn({ ticket: second.event.id, accountId: 'conta-c', sessionId: 'sessao-c' })
    env.service.finishTicketSpawn({ ticket: second.event.id, sessionId: 'sessao-c', ok: true })

    // Terceira troca na mesma linhagem passa do teto (2).
    env.addSession('sessao-c', { accountId: 'conta-c', providerId: 'claude' })
    const third = await env.service.onOutputFailure(
      env.detection({ sessionId: 'sessao-c', accountId: 'conta-c', providerId: 'claude', failure: { ...LIMIT_FAILURE, evidenceHash: 'hash-c' } }),
    )
    assert.equal(third.action, 'no_candidate')
    assert.match(third.event.reason, /teto de 2 trocas nesta linhagem/)
  })
})

test('sessão já continuada pela cadeia não recebe outra proposta, mas continua avisando', async () => {
  await withService(async (env) => {
    chainReady(env)
    const proposal = await proposeFromSession1(env)
    await env.service.confirm({ proposalId: proposal.id, destinationAccountId: 'conta-b' })
    env.service.beginTicketSpawn({ ticket: proposal.id, accountId: 'conta-b', sessionId: 'nova' })
    env.service.finishTicketSpawn({ ticket: proposal.id, sessionId: 'nova', ok: true })

    const again = await env.service.onOutputFailure(env.detection({ failure: { ...LIMIT_FAILURE, evidenceHash: 'hash-depois' } }))
    assert.equal(again.action, 'noticed')
    assert.equal(env.repository.findOpenSwitchEventForSession('sessao-1'), null)
  })
})

test('post_switch_failure: auth no bloco novo nos primeiros 3 min volta ao evento que o criou e põe o destino em espera', async () => {
  await withService(async (env) => {
    chainReady(env)
    const proposal = await proposeFromSession1(env)
    await env.service.confirm({ proposalId: proposal.id, destinationAccountId: 'conta-b' })
    env.service.beginTicketSpawn({ ticket: proposal.id, accountId: 'conta-b', sessionId: 'nova' })
    env.service.finishTicketSpawn({ ticket: proposal.id, sessionId: 'nova', ok: true })
    env.addSession('nova', { accountId: 'conta-b', lineageId: 'linhagem-1' })
    env.advance(MINUTE)

    await env.service.onOutputFailure(
      env.detection({
        sessionId: 'nova',
        accountId: 'conta-b',
        failure: { failureClass: 'auth', scope: 'account', evidence: 'Not logged in', evidenceHash: 'h-auth' },
      }),
    )
    assert.equal(env.repository.getSwitchEvent(proposal.id).postSwitchFailure, 'auth')
    const cooldown = env.repository.getCooldown('conta-b')
    assert.equal(cooldown.failureClass, 'auth')
    assert.equal(cooldown.untilAt, null, 'login perdido espera até uma checagem')
    assert.equal(env.channel('account-chain:detection').at(-1).postSwitchFailure, true)

    // Depois da janela de 3 min, uma falha nova não é atribuída à troca.
    env.addSession('outra-nova', { accountId: 'conta-c' })
    env.repository.insertSwitchEvent({
      id: 'antigo',
      kind: 'continuation',
      state: 'spawned',
      sourceSessionId: 'x',
      fromProviderId: 'codex',
      reason: 'r',
      proposedAt: env.nowIso(),
      spawnedAt: new Date(env.clock.ms - 4 * MINUTE).toISOString(),
      expiresAt: env.nowIso(),
      targetSessionId: 'outra-nova',
    })
    await env.service.onOutputFailure(
      env.detection({
        sessionId: 'outra-nova',
        accountId: 'conta-c',
        failure: { failureClass: 'billing', scope: 'account', evidence: 'Credit balance is too low', evidenceHash: 'h-bill' },
      }),
    )
    assert.equal(env.repository.getSwitchEvent('antigo').postSwitchFailure, null)
  })
})

test('sessões da mesma conta no mesmo incidente compartilham incident_key e a espera não encurta', async () => {
  await withService(async (env) => {
    chainReady(env)
    env.addSession('sessao-2')
    const first = await proposeFromSession1(env)
    env.advance(MINUTE)
    const second = await env.service.onOutputFailure(env.detection({ sessionId: 'sessao-2', lineageId: 'l2' }))

    assert.equal(second.action, 'proposed')
    assert.equal(second.event.incidentKey, first.incidentKey)
    assert.equal(env.repository.listCooldowns().length, 1)
    assert.equal(env.repository.getCooldown('conta-a').untilAt, new Date(START_MS + MINUTE + 3 * 60 * MINUTE).toISOString())
  })
})

test('I4 recuperação no início: nada pendente sobrevive nem é executado; registro ilegível não apaga membros', async () => {
  await withService(async (env) => {
    chainReady(env)
    env.addSession('sessao-2')
    env.addSession('sessao-3')
    const proposed = await proposeFromSession1(env)
    const confirmed = await env.service.onOutputFailure(env.detection({ sessionId: 'sessao-2', lineageId: 'l2' }))
    await env.service.confirm({ proposalId: confirmed.event.id, destinationAccountId: 'conta-b' })
    const spawning = await env.service.onOutputFailure(env.detection({ sessionId: 'sessao-3', lineageId: 'l3' }))
    await env.service.confirm({ proposalId: spawning.event.id, destinationAccountId: 'conta-b' })
    env.service.beginTicketSpawn({ ticket: spawning.event.id, accountId: 'conta-b', sessionId: 'nova' })
    env.accounts.delete('conta-c')

    const summary = env.service.recoverOnStartup()
    assert.equal(summary.expired, 2)
    assert.equal(summary.spawnFailed, 1)
    assert.equal(summary.removed.members, 1, 'conta que sumiu sai da lista')
    assert.equal(env.repository.getSwitchEvent(proposed.id).state, 'expired')
    assert.equal(env.repository.getSwitchEvent(confirmed.event.id).state, 'expired')
    assert.equal(env.repository.getSwitchEvent(spawning.event.id).state, 'spawn_failed')
    assert.deepEqual(env.repository.listOpenSwitchEvents(), [])

    assert.equal((await env.service.confirm({ proposalId: proposed.id, destinationAccountId: 'conta-b' })).code, 'EXPIRED')
    assert.equal(
      env.service.beginTicketSpawn({ ticket: confirmed.event.id, accountId: 'conta-b', sessionId: 'nova-2' }).code,
      'TICKET_EXPIRED',
    )
    assert.equal(env.service.finishTicketSpawn({ ticket: spawning.event.id, sessionId: 'nova', ok: true }).code, 'NOT_SPAWNING')
    assert.ok(env.repository.getCooldown('conta-a'), 'reiniciar não tira a conta da espera')
  })

  await withService(
    async (env) => {
      env.enableChain(['conta-a', 'conta-b'])
      const summary = env.service.recoverOnStartup()
      assert.deepEqual(summary.removed, { members: 0, cooldowns: 0, loginChecks: 0 })
      assert.equal(env.repository.listMembers().length, 2)
    },
    { accountsUnreadable: true },
  )
})

test('liberar espera: limite sai direto; login só com checagem OK posterior; crédito só depois de conferir', async () => {
  await withService(async (env) => {
    chainReady(env)
    await proposeFromSession1(env)
    assert.deepEqual(await env.service.releaseCooldown({ accountId: 'conta-a', reason: 'manual' }), { ok: true, released: true })
    assert.equal(env.repository.getCooldown('conta-a').releasedBy, 'manual')
    assert.equal(env.repository.listOpenSwitchEvents().length, 0, 'espera da origem liberada vence a proposta')

    env.repository.upsertCooldown({
      accountId: 'conta-b',
      providerId: 'codex',
      failureClass: 'billing',
      detectedAt: env.nowIso(),
      untilAt: null,
      untilSource: 'checagem',
    })
    env.advance(MINUTE)
    env.loginResults.set('conta-b', 'logged_out')
    assert.deepEqual(await env.service.releaseCooldown({ accountId: 'conta-b', reason: 'recharged' }), {
      ok: false,
      code: 'CHECK_REQUIRED',
      loginStatus: 'logged_out',
    })
    env.advance(MINUTE)
    env.loginResults.set('conta-b', 'logged_in')
    assert.deepEqual(await env.service.releaseCooldown({ accountId: 'conta-b', reason: 'recharged' }), { ok: true, released: true })
    assert.equal(env.repository.getCooldown('conta-b').releasedBy, 'recarregou')
    assert.equal((await env.service.releaseCooldown({ accountId: 'conta-b', reason: 'porque-sim' })).code, 'INVALID')
  })
})

test('espera de login sai sozinha com checagem logged_in posterior à detecção (varredura)', async () => {
  await withService(async (env) => {
    env.repository.upsertCooldown({
      accountId: 'conta-a',
      providerId: 'codex',
      failureClass: 'auth',
      detectedAt: env.nowIso(),
      untilAt: null,
      untilSource: 'checagem',
    })
    env.service.sweep()
    assert.equal(env.repository.getCooldown('conta-a').releasedAt, null)
    env.advance(MINUTE)
    env.recordLogin('conta-a')
    assert.deepEqual(env.service.sweep(), { expired: 0, cooldownsReleased: 1 })
    assert.equal(env.repository.getCooldown('conta-a').releasedBy, 'checagem')
  })
})

test('bloco "Automática (cadeia)": só contas do provedor pedido; sem apta, recusa com os motivos e nunca cai no sistema', async () => {
  await withService(async (env) => {
    env.enableChain()
    env.recordLogin('conta-c')
    assert.equal((await env.service.previewLaunch({ providerId: 'openia' })).code, 'NO_CANDIDATE')

    const codex = await env.service.previewLaunch({ providerId: 'codex' })
    assert.equal(codex.code, 'NO_CANDIDATE')
    assert.deepEqual(
      codex.reasons.map((item) => [item.accountId, item.reason]),
      [
        ['conta-a', 'login-nao-conferido'],
        ['conta-b', 'login-nao-conferido'],
      ],
    )

    const claude = await env.service.previewLaunch({ providerId: 'claude' })
    assert.equal(claude.ok, true)
    assert.equal(claude.proposal.kind, 'launch')
    assert.equal(claude.proposal.toAccountId, 'conta-c')
    assert.deepEqual(claude.proposal.candidates.map((item) => item.accountId), ['conta-c'])

    const confirmed = await env.service.confirm({ proposalId: claude.proposal.id, destinationAccountId: 'conta-c' })
    assert.equal(confirmed.ok, true)
    assert.equal(env.service.beginTicketSpawn({ ticket: confirmed.ticket, accountId: 'conta-c', sessionId: 'bloco' }).ok, true)

    env.service.updateSettings({ enabled: false, expectedRevision: env.repository.readSettings().revision })
    assert.equal((await env.service.previewLaunch({ providerId: 'claude' })).code, 'CHAIN_DISABLED')
  })
})

test('rodízio: o cursor vem do último destino que nasceu, passado à política', async () => {
  await withService(async (env) => {
    chainReady(env)
    const proposal = await proposeFromSession1(env)
    assert.equal(env.policy.calls.rank.at(-1).lastDestinationAccountId, null)
    await env.service.confirm({ proposalId: proposal.id, destinationAccountId: 'conta-c' })
    env.service.beginTicketSpawn({ ticket: proposal.id, accountId: 'conta-c', sessionId: 'nova' })
    env.service.finishTicketSpawn({ ticket: proposal.id, sessionId: 'nova', ok: true })

    env.addSession('sessao-2')
    await env.service.onOutputFailure(env.detection({ sessionId: 'sessao-2', lineageId: 'l2', failure: { ...LIMIT_FAILURE, evidenceHash: 'h2' } }))
    assert.equal(env.policy.calls.rank.at(-1).lastDestinationAccountId, 'conta-c')
  })
})

test('ligar a cadeia pela primeira vez cria a lista com todas as contas, em ordem e desabilitadas; conta nova entra no fim', async () => {
  await withService(async (env) => {
    const enabled = env.service.updateSettings({ enabled: true, expectedRevision: 0 })
    assert.equal(enabled.ok, true)
    assert.deepEqual(
      env.repository.listMembers().map((item) => [item.accountId, item.enabled]),
      [
        ['conta-a', false],
        ['conta-b', false],
        ['conta-c', false],
      ],
    )
    assert.equal(env.service.updateSettings({ strategy: 'round_robin', expectedRevision: 0 }).code, 'REVISION_CONFLICT')

    env.accounts.set('conta-d', { providerId: 'gemini', label: 'Gemini' })
    const state = env.service.getState()
    assert.deepEqual(state.members.map((item) => item.accountId), ['conta-a', 'conta-b', 'conta-c', 'conta-d'])
    assert.equal(state.members.every((item) => item.eligible === false && item.reason === 'membro-desabilitado'), true)

    const updated = env.service.updateMembers({
      members: [
        { accountId: 'conta-b', enabled: true, billingDeclared: 'assinatura', multiplierDeclared: 20 },
        { accountId: 'conta-a', enabled: false },
      ],
      expectedRevision: state.revision,
    })
    assert.equal(updated.ok, true)
    assert.deepEqual(env.repository.listMembers().map((item) => [item.accountId, item.providerId, item.multiplierDeclared]), [
      ['conta-b', 'codex', 20],
      ['conta-a', 'codex', null],
    ])
    assert.equal(env.service.updateMembers({ members: [{ accountId: 'conta-z', enabled: true }], expectedRevision: updated.revision }).code, 'UNKNOWN_ACCOUNT')
  })
})

test('passagem manual por causa de uma detecção fica no registro com motivo, horário e escolha da pessoa', async () => {
  await withService(async (env) => {
    env.addSession('fixo', { accountMode: 'pinned' })
    await env.service.onOutputFailure(env.detection({ sessionId: 'fixo', accountMode: 'pinned' }))
    const result = env.service.recordManual({ sourceSessionId: 'fixo', toAccountId: 'conta-c', toProviderId: 'claude', reasonClass: 'limit' })
    assert.equal(result.ok, true)
    const event = env.repository.getSwitchEvent(result.eventId)
    assert.equal(event.kind, 'manual')
    assert.equal(event.state, 'accepted')
    assert.equal(event.chosenBy, 'person')
    assert.equal(event.toLabel, 'Claude Max')
    assert.equal(event.decidedAt, env.nowIso())
    assert.equal(event.incidentKey, `conta-a|${env.repository.getCooldown('conta-a').detectedAt}`)
    assert.equal(env.service.recordManual({ sourceSessionId: 'sumiu', toProviderId: 'codex', reasonClass: 'limit' }).code, 'SESSION_NOT_FOUND')
  })
})

test('I9: segredo sentinela na evidência não chega a banco, push, log nem retorno', async () => {
  await withService(async (env) => {
    chainReady(env)
    const evidence = `You’ve hit your usage limit. ${SENTINELS.join(' ')}`
    const outcome = await env.service.onOutputFailure(env.detection({ failure: { ...LIMIT_FAILURE, evidence } }))
    const forbidden = { failureClass: 'auth', scope: 'account', ambiguous: true, evidence: `403 ${SENTINELS[0]}`, evidenceHash: 'h-403' }
    await env.service.onOutputFailure(env.detection({ sessionId: 'outra', failure: forbidden }))
    const confirmed = await env.service.confirm({ proposalId: outcome.event.id, destinationAccountId: 'conta-b' })

    const everything = JSON.stringify({
      outcome,
      confirmed,
      state: env.service.getState(),
      history: env.service.history({ limit: 50 }),
      cooldowns: env.repository.listCooldowns({ includeReleased: true }),
      emitted: env.emitted,
      logged: env.logged,
    })
    for (const sentinel of SENTINELS) {
      assert.equal(everything.includes(sentinel), false, `vazou ${sentinel.slice(0, 12)}…`)
    }
  })
})

test('detecção malformada é descartada sem lançar; política que lança deixa a conta fora (fail-closed)', async () => {
  await withService(async (env) => {
    chainReady(env)
    assert.deepEqual(await env.service.onOutputFailure(null), { action: 'invalid' })
    assert.deepEqual(await env.service.onOutputFailure({ sessionId: 's', providerId: 'codex', failure: { failureClass: 'x' } }), {
      action: 'invalid',
    })
    assert.equal(normalizeDetection(env.detection({ accountId: null, accountMode: 'chain' })).accountMode, 'pinned')

    env.policy.evaluateEligibility = () => {
      throw new Error('bug')
    }
    const outcome = await env.service.onOutputFailure(env.detection())
    assert.equal(outcome.action, 'no_candidate')
    assert.equal(outcome.event.candidates.every((item) => item.reason === 'erro-na-avaliacao'), true)
  })
})

test('"Conferir login agora" roda a checagem por conta, devolve o resultado sem identidade e libera espera de login', async () => {
  await withService(async (env) => {
    env.repository.upsertCooldown({
      accountId: 'conta-a',
      providerId: 'codex',
      failureClass: 'auth',
      detectedAt: env.nowIso(),
      untilAt: null,
      untilSource: 'checagem',
    })
    env.advance(MINUTE)
    env.loginResults.set('conta-a', 'logged_in')
    env.loginResults.set('conta-b', 'logged_out')

    const result = await env.service.checkLoginNow({ accountIds: ['conta-a', 'conta-b', 'conta-a'] })
    assert.equal(result.ok, true)
    assert.deepEqual(env.checkCalls.sort(), ['conta-a', 'conta-b'], 'conta repetida é conferida uma vez')
    assert.deepEqual(result.results.map((item) => [item.accountId, item.loginCheck.status]), [
      ['conta-a', 'logged_in'],
      ['conta-b', 'logged_out'],
    ])
    assert.equal('identityKey' in result.results[0].loginCheck, false)
    assert.equal(env.repository.getCooldown('conta-a').releasedBy, 'checagem')
    assert.equal((await env.service.checkLoginNow({ accountIds: [''] })).code, 'INVALID')
  })
})

test('varredor de prazo vence propostas pelo relógio do serviço e para quando pedido', async () => {
  await withService(async (env) => {
    chainReady(env)
    const proposal = await proposeFromSession1(env)
    env.advance(31 * MINUTE)
    const stop = env.service.startExpirySweeper({ intervalMs: 5 })
    try {
      await new Promise((resolve) => setTimeout(resolve, 40))
    } finally {
      stop()
    }
    assert.equal(env.repository.getSwitchEvent(proposal.id).state, 'expired')
    assert.ok(env.channel('account-chain:changed').some((item) => item.reason === 'sweep'))
  })
})

test('terminal antigo que avisa "limite resetou" depois da troca ganha só um aviso, sem espera nem proposta', async () => {
  await withService(async (env) => {
    chainReady(env)
    const resetNotice = { failureClass: 'unknown', scope: 'account', evidence: 'Your usage limit has reset', evidenceHash: 'h-reset', notice: 'limit_reset' }
    assert.equal((await env.service.onOutputFailure(env.detection({ failure: resetNotice }))).action, 'ignored')

    const proposal = await proposeFromSession1(env)
    await env.service.confirm({ proposalId: proposal.id, destinationAccountId: 'conta-b' })
    env.service.beginTicketSpawn({ ticket: proposal.id, accountId: 'conta-b', sessionId: 'nova' })
    env.service.finishTicketSpawn({ ticket: proposal.id, sessionId: 'nova', ok: true })
    const eventsBefore = env.repository.listSwitchEvents().length

    assert.equal((await env.service.onOutputFailure(env.detection({ failure: resetNotice }))).action, 'source_resumed')
    assert.equal(env.channel('account-chain:detection').at(-1).action, 'source_resumed')
    assert.equal(env.repository.listSwitchEvents().length, eventsBefore)
  })
})

'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { createStorageDatabase } = require('./sqlite-database.cjs')
const { createAccountChainRepository } = require('./account-chain-repository.cjs')

const NOW = '2026-09-28T12:00:00.000Z'
const LATER = '2026-09-28T12:30:00.000Z'

function withRepository(action) {
  const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-account-chain-repo-'))
  const database = createStorageDatabase({ databaseDir })
  try {
    return action(createAccountChainRepository(database), database)
  } finally {
    // No Windows o arquivo SQLite não pode ser apagado com a conexão aberta.
    database.close()
    fs.rmSync(databaseDir, { recursive: true, force: true })
  }
}

function member(accountId, overrides = {}) {
  return { accountId, providerId: 'codex', enabled: false, ...overrides }
}

function proposal(id, overrides = {}) {
  return {
    id,
    kind: 'continuation',
    state: 'proposed',
    sourceSessionId: 'sessao-1',
    lineageId: 'linhagem-1',
    fromAccountId: 'conta-a',
    fromProviderId: 'codex',
    fromLabel: 'Pessoal',
    toAccountId: 'conta-b',
    toProviderId: 'codex',
    toLabel: 'Trabalho',
    failureClass: 'limit',
    reason: 'Limite de uso da conta Pessoal',
    strategy: 'manual',
    chosenBy: 'chain',
    candidates: [{ accountId: 'conta-b', eligible: true }],
    detectedAt: NOW,
    proposedAt: NOW,
    expiresAt: LATER,
    ...overrides,
  }
}

function limitCooldown(overrides = {}) {
  return {
    accountId: 'conta-a',
    providerId: 'codex',
    failureClass: 'limit',
    detectedAt: NOW,
    untilAt: '2026-09-28T16:40:00.000Z',
    untilSource: 'texto',
    evidence: 'You’ve hit your usage limit.',
    evidenceHash: 'abc123',
    sessionId: 'sessao-1',
    ...overrides,
  }
}

test('sem linha de settings a cadeia está DESLIGADA, em ordem manual, revisão 0', () => {
  withRepository((repo) => {
    assert.deepEqual(repo.readSettings(), {
      exists: false,
      enabled: false,
      strategy: 'manual',
      maxHopsPerLineage: 3,
      revision: 0,
      updatedAt: null,
    })
    assert.deepEqual(repo.listMembers(), [])
  })
})

test('settings: CAS aplica com a revisão esperada e devolve o atual no conflito', () => {
  withRepository((repo) => {
    const first = repo.updateSettings({ expectedRevision: 0, enabled: true, nowIso: NOW })
    assert.equal(first.applied, true)
    assert.equal(first.settings.revision, 1)
    assert.equal(first.settings.enabled, true)
    assert.equal(first.settings.strategy, 'manual', 'ligar pela primeira vez começa em ordem manual')

    const stale = repo.updateSettings({ expectedRevision: 0, strategy: 'round_robin', nowIso: LATER })
    assert.equal(stale.applied, false)
    assert.equal(stale.settings.revision, 1)
    assert.equal(stale.settings.strategy, 'manual')

    const second = repo.updateSettings({ expectedRevision: 1, strategy: 'most_capacity', maxHopsPerLineage: 5, nowIso: LATER })
    assert.equal(second.applied, true)
    assert.deepEqual(
      { enabled: second.settings.enabled, strategy: second.settings.strategy, hops: second.settings.maxHopsPerLineage, revision: second.settings.revision },
      { enabled: true, strategy: 'most_capacity', hops: 5, revision: 2 },
    )
  })
})

test('settings: estratégia, teto de saltos e tipos fora do contrato são recusados', () => {
  withRepository((repo) => {
    assert.throws(() => repo.updateSettings({ expectedRevision: 0, strategy: 'aleatoria', nowIso: NOW }), /Valor inválido/)
    assert.throws(() => repo.updateSettings({ expectedRevision: 0, maxHopsPerLineage: 11, nowIso: NOW }), /fora da faixa/)
    assert.throws(() => repo.updateSettings({ expectedRevision: 0, enabled: 'sim', nowIso: NOW }), /verdadeiro ou falso/)
    assert.throws(() => repo.updateSettings({ expectedRevision: -1, nowIso: NOW }), /Revisão inválida/)
    assert.throws(() => repo.updateSettings({ expectedRevision: 0, nowIso: 'ontem' }), /Horário inválido/)
    assert.equal(repo.readSettings().exists, false)
  })
})

test('membros: a lista é regravada inteira e reordena sem colisão, preservando created_at', () => {
  withRepository((repo) => {
    const created = repo.replaceMembers({
      members: [member('a'), member('b', { providerId: 'claude', enabled: true, multiplierDeclared: 20 }), member('c')],
      expectedRevision: 0,
      nowIso: NOW,
    })
    assert.deepEqual(created, { applied: true, revision: 1 })
    assert.equal(repo.readSettings().enabled, false, 'gravar membros não liga a cadeia')

    const reordered = repo.replaceMembers({
      members: [member('c'), member('a'), member('b', { providerId: 'claude', enabled: true, billingDeclared: 'assinatura', multiplierDeclared: 20 })],
      expectedRevision: 1,
      nowIso: LATER,
    })
    assert.equal(reordered.applied, true)
    const members = repo.listMembers()
    assert.deepEqual(
      members.map((item) => [item.accountId, item.position]),
      [
        ['c', 0],
        ['a', 1],
        ['b', 2],
      ],
    )
    const b = members.find((item) => item.accountId === 'b')
    assert.equal(b.createdAt, NOW)
    assert.equal(b.updatedAt, LATER)
    assert.equal(b.billingDeclared, 'assinatura')
    assert.equal(b.multiplierDeclared, 20)
    assert.equal(b.enabled, true)
  })
})

test('membros: revisão velha não grava e devolve a lista atual; conta repetida e provedor fora da lista lançam', () => {
  withRepository((repo) => {
    repo.replaceMembers({ members: [member('a')], expectedRevision: 0, nowIso: NOW })
    const conflict = repo.replaceMembers({ members: [member('z')], expectedRevision: 0, nowIso: LATER })
    assert.equal(conflict.applied, false)
    assert.equal(conflict.settings.revision, 1)
    assert.deepEqual(conflict.members.map((item) => item.accountId), ['a'])

    assert.throws(
      () => repo.replaceMembers({ members: [member('a'), member('a')], expectedRevision: 1, nowIso: LATER }),
      /repetida/,
    )
    assert.throws(
      () => repo.replaceMembers({ members: [member('a', { providerId: 'outro' })], expectedRevision: 1, nowIso: LATER }),
      /Valor inválido/,
    )
    assert.throws(
      () => repo.replaceMembers({ members: [member('a', { multiplierDeclared: 0.5 })], expectedRevision: 1, nowIso: LATER }),
      /fora da faixa/,
    )
    assert.deepEqual(repo.listMembers().map((item) => item.accountId), ['a'])
  })
})

test('índice parcial único: no máximo uma proposta aberta por sessão, também escrevendo por fora do repositório', () => {
  withRepository((repo, database) => {
    assert.equal(repo.insertSwitchEvent(proposal('p-1')).inserted, true)

    const second = repo.insertSwitchEvent(proposal('p-2'))
    assert.equal(second.inserted, false)
    assert.equal(second.code, 'OPEN_EVENT_EXISTS')
    assert.equal(second.event.id, 'p-1')

    assert.throws(
      () =>
        database.connection
          .prepare(
            `INSERT INTO account_switch_events (id, kind, state, source_session_id, from_provider_id, reason, proposed_at, expires_at)
             VALUES ('p-cru', 'continuation', 'confirmed', 'sessao-1', 'codex', 'x', ?, ?)`,
          )
          .run(NOW, LATER),
      /UNIQUE constraint failed/,
    )

    // Um aviso (estado final) da mesma sessão não disputa o índice.
    assert.equal(repo.insertSwitchEvent(proposal('aviso-1', { kind: 'notice', state: 'noticed' })).inserted, true)

    // Recusada a primeira, a sessão pode receber proposta nova (evidência nova).
    repo.transitionSwitchEvent({ id: 'p-1', fromState: 'proposed', toState: 'declined', expectedRevision: 1 })
    assert.equal(repo.insertSwitchEvent(proposal('p-3')).inserted, true)

    const duplicate = repo.insertSwitchEvent(proposal('p-3', { sourceSessionId: 'outra' }))
    assert.equal(duplicate.code, 'DUPLICATE_ID')
  })
})

test('transição por CAS: aplica uma vez, recusa revisão ou estado velhos e transição fora da máquina', () => {
  withRepository((repo) => {
    repo.insertSwitchEvent(proposal('p-1'))
    const confirmed = repo.transitionSwitchEvent({
      id: 'p-1',
      fromState: 'proposed',
      toState: 'confirmed',
      expectedRevision: 1,
      patch: { decidedAt: LATER, sourceActiveAck: true, expiresAt: '2026-09-28T12:32:00.000Z' },
    })
    assert.equal(confirmed.applied, true)
    assert.equal(confirmed.event.state, 'confirmed')
    assert.equal(confirmed.event.revision, 2)
    assert.equal(confirmed.event.decidedAt, LATER)
    assert.equal(confirmed.event.sourceActiveAck, true)

    const again = repo.transitionSwitchEvent({ id: 'p-1', fromState: 'proposed', toState: 'confirmed', expectedRevision: 1 })
    assert.equal(again.applied, false, 'confirm duplo não aplica duas vezes')
    assert.equal(again.event.revision, 2)

    const staleRevision = repo.transitionSwitchEvent({ id: 'p-1', fromState: 'confirmed', toState: 'spawning', expectedRevision: 1 })
    assert.equal(staleRevision.applied, false)

    const spawning = repo.transitionSwitchEvent({
      id: 'p-1',
      fromState: 'confirmed',
      toState: 'spawning',
      expectedRevision: 2,
      patch: { targetSessionId: 'sessao-nova' },
    })
    assert.equal(spawning.applied, true)
    const spawned = repo.transitionSwitchEvent({
      id: 'p-1',
      fromState: 'spawning',
      toState: 'spawned',
      expectedRevision: 3,
      patch: { spawnedAt: LATER, transcriptChars: 4096 },
    })
    assert.equal(spawned.event.state, 'spawned')
    assert.equal(spawned.event.targetSessionId, 'sessao-nova')

    // Alteração no mesmo estado (falha logo após a troca) é permitida por CAS.
    const failure = repo.transitionSwitchEvent({
      id: 'p-1',
      fromState: 'spawned',
      toState: 'spawned',
      expectedRevision: 4,
      patch: { postSwitchFailure: 'auth' },
    })
    assert.equal(failure.event.postSwitchFailure, 'auth')

    assert.throws(
      () => repo.transitionSwitchEvent({ id: 'p-1', fromState: 'spawned', toState: 'proposed', expectedRevision: 5 }),
      /não existe/,
    )
    assert.throws(
      () => repo.transitionSwitchEvent({ id: 'p-1', fromState: 'spawned', toState: 'spawned', expectedRevision: 5, patch: { kind: 'launch' } }),
      /não pode ser alterado/,
    )
    assert.throws(
      () => repo.transitionSwitchEvent({ id: 'p-1', fromState: 'spawned', toState: 'spawned', expectedRevision: 5, patch: { sourceSessionId: 'x' } }),
      /não pode ser alterado/,
    )
  })
})

test('evento: motivo longo, estado ou tipo fora do contrato são recusados antes do banco', () => {
  withRepository((repo) => {
    assert.throws(() => repo.insertSwitchEvent(proposal('x', { reason: 'm'.repeat(401) })), /400/)
    assert.throws(() => repo.insertSwitchEvent(proposal('x', { state: 'talvez' })), /Valor inválido/)
    assert.throws(() => repo.insertSwitchEvent(proposal('x', { kind: 'magica' })), /Valor inválido/)
    assert.throws(() => repo.insertSwitchEvent(proposal('x', { candidates: 'a,b' })), /lista/)
    assert.throws(() => repo.insertSwitchEvent(proposal('x', { expiresAt: undefined })), /Horário inválido/)
    assert.deepEqual(repo.listSwitchEvents(), [])
  })
})

test('espera: nunca encurta uma espera ativa; mais tarde vence; até checagem vence qualquer horário', () => {
  withRepository((repo) => {
    const first = repo.upsertCooldown(limitCooldown())
    assert.equal(first.applied, true)
    assert.equal(first.cooldown.revision, 1)

    const earlier = repo.upsertCooldown(limitCooldown({ detectedAt: LATER, untilAt: '2026-09-28T16:00:00.000Z', sessionId: 'sessao-2' }))
    assert.equal(earlier.applied, false)
    assert.equal(earlier.cooldown.untilAt, '2026-09-28T16:40:00.000Z')
    assert.equal(earlier.cooldown.detectedAt, NOW, 'o incidente continua o da primeira detecção')

    const same = repo.upsertCooldown(limitCooldown({ sessionId: 'sessao-3' }))
    assert.equal(same.applied, false, 'o mesmo fim não reescreve a linha')

    const later = repo.upsertCooldown(limitCooldown({ untilAt: '2026-09-28T17:00:00.000Z', untilSource: 'medicao' }))
    assert.equal(later.applied, true)
    assert.equal(later.cooldown.untilAt, '2026-09-28T17:00:00.000Z')
    assert.equal(later.cooldown.revision, 2)

    const auth = repo.upsertCooldown(limitCooldown({ failureClass: 'auth', untilAt: null, untilSource: 'checagem' }))
    assert.equal(auth.applied, true)
    assert.equal(auth.cooldown.untilAt, null)

    const afterAuth = repo.upsertCooldown(limitCooldown({ untilAt: '2026-09-29T17:00:00.000Z' }))
    assert.equal(afterAuth.applied, false, 'um horário não encurta a espera até checagem')
    assert.equal(repo.getCooldown('conta-a').failureClass, 'auth')
  })
})

test('espera: liberar com revisão velha não aplica; liberada, uma detecção nova abre outra espera', () => {
  withRepository((repo) => {
    repo.upsertCooldown(limitCooldown())
    repo.upsertCooldown(limitCooldown({ untilAt: '2026-09-28T18:00:00.000Z' }))

    const stale = repo.releaseCooldown({ accountId: 'conta-a', releasedBy: 'nao_era_limite', releasedAt: LATER, expectedRevision: 1 })
    assert.equal(stale.applied, false)
    assert.equal(stale.cooldown.releasedAt, null)

    const released = repo.releaseCooldown({ accountId: 'conta-a', releasedBy: 'nao_era_limite', releasedAt: LATER, expectedRevision: 2 })
    assert.equal(released.applied, true)
    assert.equal(released.cooldown.releasedBy, 'nao_era_limite')
    assert.deepEqual(repo.listCooldowns(), [])
    assert.equal(repo.listCooldowns({ includeReleased: true }).length, 1)

    assert.equal(
      repo.releaseCooldown({ accountId: 'conta-a', releasedBy: 'manual', releasedAt: LATER }).applied,
      false,
      'liberar de novo não aplica',
    )
    assert.throws(() => repo.releaseCooldown({ accountId: 'conta-a', releasedBy: 'porque-sim', releasedAt: LATER }), /Valor inválido/)

    const reopened = repo.upsertCooldown(limitCooldown({ detectedAt: LATER, untilAt: '2026-09-28T13:00:00.000Z' }))
    assert.equal(reopened.applied, true, 'espera liberada não segura a próxima, mesmo com fim mais cedo')
    assert.equal(reopened.cooldown.releasedAt, null)
    assert.equal(reopened.cooldown.detectedAt, LATER)
  })
})

test('espera: classe que não põe conta em espera e evidência longa são recusadas', () => {
  withRepository((repo) => {
    assert.throws(() => repo.upsertCooldown(limitCooldown({ failureClass: 'network' })), /Valor inválido/)
    assert.throws(() => repo.upsertCooldown(limitCooldown({ evidence: 'e'.repeat(201) })), /200/)
    assert.deepEqual(repo.listCooldowns({ includeReleased: true }), [])
  })
})

test('checagem de login: a mais antiga não sobrescreve a mais nova', () => {
  withRepository((repo) => {
    const check = {
      accountId: 'conta-a',
      providerId: 'codex',
      status: 'logged_in',
      checkedAt: LATER,
      source: 'checagem',
      durationMs: 4200,
      method: 'ChatGPT',
      billingDetected: 'assinatura',
      identityKey: 'fp-1',
      identityStatus: 'matched',
    }
    assert.equal(repo.recordLoginCheck(check).applied, true)
    const older = repo.recordLoginCheck({ ...check, status: 'logged_out', checkedAt: NOW })
    assert.equal(older.applied, false)
    assert.equal(older.check.status, 'logged_in')
    assert.equal(older.check.apiKeySourcePresent, false)

    const newer = repo.recordLoginCheck({ ...check, status: 'logged_out', checkedAt: '2026-09-28T13:00:00.000Z', apiKeySourcePresent: true })
    assert.equal(newer.applied, true)
    assert.equal(newer.check.status, 'logged_out')
    assert.equal(newer.check.apiKeySourcePresent, true)
    assert.throws(() => repo.recordLoginCheck({ ...check, status: 'talvez' }), /Valor inválido/)
  })
})

test('recoverOnStartup: nada pendente sobrevive nem é executado; esperas vencidas saem; contas sumidas saem do resto', () => {
  withRepository((repo) => {
    repo.replaceMembers({ members: [member('conta-a'), member('conta-sumida')], expectedRevision: 0, nowIso: NOW })
    repo.insertSwitchEvent(proposal('proposta', { sourceSessionId: 's-1' }))
    repo.insertSwitchEvent(proposal('confirmada', { sourceSessionId: 's-2' }))
    repo.transitionSwitchEvent({ id: 'confirmada', fromState: 'proposed', toState: 'confirmed', expectedRevision: 1 })
    repo.insertSwitchEvent(proposal('nascendo', { sourceSessionId: 's-3' }))
    repo.transitionSwitchEvent({ id: 'nascendo', fromState: 'proposed', toState: 'confirmed', expectedRevision: 1 })
    repo.transitionSwitchEvent({ id: 'nascendo', fromState: 'confirmed', toState: 'spawning', expectedRevision: 2 })
    repo.insertSwitchEvent(proposal('aviso', { kind: 'notice', state: 'noticed', sourceSessionId: 's-4' }))
    repo.upsertCooldown(limitCooldown({ untilAt: '2026-09-28T12:10:00.000Z' }))
    repo.upsertCooldown(limitCooldown({ accountId: 'conta-sumida', failureClass: 'auth', untilAt: null, untilSource: 'checagem' }))
    repo.recordLoginCheck({ accountId: 'conta-sumida', providerId: 'codex', status: 'logged_in', checkedAt: NOW, source: 'checagem' })
    const revisionBefore = repo.readSettings().revision

    const result = repo.recoverOnStartup({ nowIso: LATER, knownAccountIds: ['conta-a'] })
    assert.deepEqual(result, {
      expired: 2,
      spawnFailed: 1,
      cooldownsReleased: 1,
      removed: { members: 1, cooldowns: 1, loginChecks: 1 },
    })

    assert.equal(repo.getSwitchEvent('proposta').state, 'expired')
    assert.equal(repo.getSwitchEvent('confirmada').state, 'expired')
    assert.equal(repo.getSwitchEvent('nascendo').state, 'spawn_failed')
    assert.equal(repo.getSwitchEvent('aviso').state, 'noticed')
    assert.deepEqual(repo.listOpenSwitchEvents(), [])

    const cooldown = repo.getCooldown('conta-a')
    assert.equal(cooldown.releasedBy, 'vencimento')
    assert.equal(cooldown.releasedAt, '2026-09-28T12:10:00.000Z', 'venceu na hora do fim, não na hora do início do app')

    assert.deepEqual(repo.listMembers().map((item) => item.accountId), ['conta-a'])
    assert.equal(repo.getCooldown('conta-sumida'), null)
    assert.equal(repo.getLoginCheck('conta-sumida'), null)
    assert.equal(repo.readSettings().revision, revisionBefore + 1, 'a interface precisa ver que a lista mudou')
    assert.equal(repo.listSwitchEvents().length, 4, 'o registro de trocas fica')
  })
})

test('recoverOnStartup: sem a lista de contas (registro ilegível) nenhum membro é apagado', () => {
  withRepository((repo) => {
    repo.replaceMembers({ members: [member('conta-a')], expectedRevision: 0, nowIso: NOW })
    const result = repo.recoverOnStartup({ nowIso: LATER, knownAccountIds: null })
    assert.deepEqual(result.removed, { members: 0, cooldowns: 0, loginChecks: 0 })
    assert.deepEqual(repo.listMembers().map((item) => item.accountId), ['conta-a'])
  })
})

test('prazo: propostas e tickets vencidos viram expired; o spawn em andamento não', () => {
  withRepository((repo) => {
    repo.insertSwitchEvent(proposal('vencida', { sourceSessionId: 's-1', expiresAt: '2026-09-28T12:05:00.000Z' }))
    repo.insertSwitchEvent(proposal('ticket', { sourceSessionId: 's-2', expiresAt: '2026-09-28T12:05:00.000Z' }))
    repo.transitionSwitchEvent({ id: 'ticket', fromState: 'proposed', toState: 'confirmed', expectedRevision: 1 })
    repo.insertSwitchEvent(proposal('no-prazo', { sourceSessionId: 's-3', expiresAt: LATER }))

    const expired = repo.expireDueSwitchEvents('2026-09-28T12:10:00.000Z')
    assert.deepEqual(expired.map((event) => [event.id, event.state]), [
      ['vencida', 'expired'],
      ['ticket', 'expired'],
    ])
    assert.equal(repo.getSwitchEvent('no-prazo').state, 'proposed')
  })
})

test('retenção: ficam as N mais recentes e uma linha aberta nunca é apagada', () => {
  withRepository((repo) => {
    const at = (minute) => `2026-09-28T12:${String(minute).padStart(2, '0')}:00.000Z`
    repo.insertSwitchEvent(proposal('aberta-antiga', { sourceSessionId: 's-aberta', proposedAt: at(0) }))
    for (let minute = 1; minute <= 10; minute++) {
      repo.insertSwitchEvent(proposal(`aviso-${minute}`, { kind: 'notice', state: 'noticed', sourceSessionId: `s-${minute}`, proposedAt: at(minute) }))
    }

    assert.equal(repo.pruneSwitchEvents({ keep: 5 }), 5)
    const ids = repo.listSwitchEvents().map((event) => event.id)
    assert.deepEqual(ids, ['aviso-10', 'aviso-9', 'aviso-8', 'aviso-7', 'aviso-6', 'aberta-antiga'])
  })
})

test('candidates_json corrompido vira item corrupted sem derrubar a lista', () => {
  withRepository((repo, database) => {
    repo.insertSwitchEvent(proposal('boa', { sourceSessionId: 's-1' }))
    repo.insertSwitchEvent(proposal('ruim', { sourceSessionId: 's-2', proposedAt: LATER }))
    database.connection.prepare("UPDATE account_switch_events SET candidates_json = '{quebrado' WHERE id = 'ruim'").run()

    const [ruim, boa] = repo.listSwitchEvents()
    assert.equal(ruim.id, 'ruim')
    assert.equal(ruim.corrupted, true)
    assert.deepEqual(ruim.candidates, [])
    assert.equal(boa.corrupted, false)
    assert.deepEqual(boa.candidates, [{ accountId: 'conta-b', eligible: true }])
  })
})

test('histórico pagina pelo horário da proposta, com teto de página', () => {
  withRepository((repo) => {
    for (let index = 0; index < 3; index++) {
      repo.insertSwitchEvent(
        proposal(`e-${index}`, { kind: 'notice', state: 'noticed', sourceSessionId: `s-${index}`, proposedAt: `2026-09-28T12:0${index}:00.000Z` }),
      )
    }
    assert.deepEqual(repo.listSwitchEvents({ limit: 2 }).map((event) => event.id), ['e-2', 'e-1'])
    assert.deepEqual(repo.listSwitchEvents({ before: '2026-09-28T12:01:00.000Z' }).map((event) => event.id), ['e-0'])
    assert.throws(() => repo.listSwitchEvents({ limit: 51 }), /fora da faixa/)
  })
})

test('esquecer uma conta tira membro, espera e checagem e sobe a revisão; o registro fica', () => {
  withRepository((repo) => {
    repo.replaceMembers({ members: [member('conta-a'), member('conta-b')], expectedRevision: 0, nowIso: NOW })
    repo.upsertCooldown(limitCooldown())
    repo.recordLoginCheck({ accountId: 'conta-a', providerId: 'codex', status: 'logged_in', checkedAt: NOW, source: 'checagem' })
    repo.insertSwitchEvent(proposal('evento'))

    assert.deepEqual(repo.forgetAccount('conta-a', LATER), { members: 1, cooldowns: 1, loginChecks: 1 })
    assert.deepEqual(repo.listMembers().map((item) => item.accountId), ['conta-b'])
    assert.equal(repo.readSettings().revision, 2)
    assert.equal(repo.getSwitchEvent('evento').fromLabel, 'Pessoal')
  })
})

test('sobrevive a reabrir o banco (depois de reiniciar o app)', () => {
  const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-account-chain-restart-'))
  try {
    const first = createStorageDatabase({ databaseDir })
    const repo = createAccountChainRepository(first)
    repo.updateSettings({ expectedRevision: 0, enabled: true, nowIso: NOW })
    repo.replaceMembers({ members: [member('conta-a', { enabled: true })], expectedRevision: 1, nowIso: NOW })
    repo.upsertCooldown(limitCooldown({ untilAt: null, failureClass: 'billing', untilSource: 'checagem' }))
    first.close()

    const second = createStorageDatabase({ databaseDir })
    try {
      const reopened = createAccountChainRepository(second)
      assert.equal(reopened.readSettings().enabled, true)
      assert.equal(reopened.readSettings().revision, 2)
      assert.deepEqual(reopened.listMembers().map((item) => [item.accountId, item.enabled]), [['conta-a', true]])
      assert.equal(reopened.getCooldown('conta-a').failureClass, 'billing', 'reiniciar não tira a conta da espera')
    } finally {
      second.close()
    }
  } finally {
    fs.rmSync(databaseDir, { recursive: true, force: true })
  }
})

test('evidência por sessão: devolve o evento mais recente da mesma sessão e da mesma evidência', () => {
  withRepository((repo) => {
    repo.insertSwitchEvent(proposal('antigo', { state: 'declined', evidenceHash: 'hash-1', proposedAt: NOW }))
    repo.insertSwitchEvent(proposal('novo', { state: 'dismissed', evidenceHash: 'hash-1', proposedAt: LATER }))
    repo.insertSwitchEvent(proposal('outra-sessao', { state: 'declined', sourceSessionId: 'sessao-2', evidenceHash: 'hash-1' }))
    repo.insertSwitchEvent(proposal('outra-evidencia', { state: 'declined', evidenceHash: 'hash-2' }))

    assert.equal(repo.findLatestSwitchEventForEvidence({ sessionId: 'sessao-1', evidenceHash: 'hash-1' }).id, 'novo')
    assert.equal(repo.findLatestSwitchEventForEvidence({ sessionId: 'sessao-3', evidenceHash: 'hash-1' }), null)
  })
})

test('troca que fez nascer a sessão, sessão sucedida e cursor do rodízio saem do registro', () => {
  withRepository((repo) => {
    assert.equal(repo.findLastSpawnedDestination(), null)
    assert.equal(repo.hasSpawnedFromSession('sessao-1'), false)

    repo.insertSwitchEvent(
      proposal('nasceu', { state: 'spawned', targetSessionId: 'sessao-nova', spawnedAt: NOW, toAccountId: 'conta-b' }),
    )
    repo.insertSwitchEvent(
      proposal('falhou', {
        state: 'spawn_failed',
        sourceSessionId: 'sessao-2',
        targetSessionId: 'sessao-outra',
        spawnedAt: LATER,
        toAccountId: 'conta-c',
      }),
    )
    repo.insertSwitchEvent(
      proposal('manual', { kind: 'manual', state: 'accepted', sourceSessionId: 'sessao-3', toAccountId: 'conta-d', proposedAt: LATER }),
    )

    assert.equal(repo.findSpawnedSwitchEventForTarget('sessao-nova').id, 'nasceu')
    assert.equal(repo.findSpawnedSwitchEventForTarget('sessao-outra'), null, 'spawn que falhou não é a origem da sessão')
    assert.equal(repo.hasSpawnedFromSession('sessao-1'), true)
    assert.equal(repo.hasSpawnedFromSession('sessao-2'), false)
    assert.deepEqual(
      repo.findLastSpawnedDestination(),
      { accountId: 'conta-b', providerId: 'codex', spawnedAt: NOW },
      'falha de spawn e passagem manual não gastam a vez do rodízio',
    )
  })
})

test('espera: estender uma espera ativa da mesma classe mantém o detected_at da primeira detecção (chave do incidente)', () => {
  withRepository((repo) => {
    repo.upsertCooldown(limitCooldown())
    const extended = repo.upsertCooldown(
      limitCooldown({ detectedAt: LATER, untilAt: '2026-09-28T17:00:00.000Z', sessionId: 'sessao-2' }),
    )
    assert.equal(extended.applied, true)
    assert.equal(extended.cooldown.untilAt, '2026-09-28T17:00:00.000Z')
    assert.equal(extended.cooldown.detectedAt, NOW, 'outra sessão da mesma conta entra no mesmo incidente')

    const auth = repo.upsertCooldown(
      limitCooldown({ failureClass: 'auth', detectedAt: LATER, untilAt: null, untilSource: 'checagem' }),
    )
    assert.equal(auth.cooldown.detectedAt, LATER, 'classe nova abre incidente novo: checagem antiga não a libera')
  })
})

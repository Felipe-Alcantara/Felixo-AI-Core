import { describe, expect, it } from 'vitest'
import {
  CHAIN_CONFLICT_MESSAGE,
  CHAIN_UNAVAILABLE_MESSAGE,
  applyProposalEvent,
  changeSessionAccountMode,
  confirmChainLaunch,
  createAccountChainStore,
  getAccountChainBridge,
  previewChainLaunch,
} from './account-chain-client'
import {
  createFakeBridge,
  makeDetection,
  makeMember,
  makeProposal,
  makeState,
} from './__fixtures__/account-chain-fixtures'

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('getAccountChainBridge', () => {
  it('sem o namespace devolve null em vez de lançar', () => {
    expect(getAccountChainBridge(undefined)).toBeNull()
    expect(getAccountChainBridge({})).toBeNull()
    expect(getAccountChainBridge({ felixo: {} })).toBeNull()
  })
})

describe('createAccountChainStore', () => {
  it('sem a ponte fica indisponível e recusa mutações sem quebrar', async () => {
    const store = createAccountChainStore(null)
    const release = store.retain()
    expect(store.getSnapshot()).toMatchObject({ status: 'unavailable', message: CHAIN_UNAVAILABLE_MESSAGE })
    expect(await store.updateSettings({ enabled: true })).toEqual({
      ok: false,
      message: CHAIN_UNAVAILABLE_MESSAGE,
    })
    release()
  })

  it('ao montar busca o estado e recupera as propostas pendentes', async () => {
    const pending = makeProposal()
    const bridge = createFakeBridge({}, makeState({ pendingProposals: [pending] }))
    const store = createAccountChainStore(bridge)
    const release = store.retain()
    await flush()
    expect(store.getSnapshot().status).toBe('ready')
    expect(store.getSnapshot().state?.pendingProposals).toEqual([pending])
    release()
  })

  it('um consumidor a mais não duplica a assinatura; o último a sair a desliga', async () => {
    const bridge = createFakeBridge()
    const store = createAccountChainStore(bridge)
    const first = store.retain()
    const second = store.retain()
    await flush()
    expect(bridge.calls.filter((call) => call.method === 'getState')).toHaveLength(1)
    expect(bridge.listenerCount()).toBe(3)
    first()
    first()
    expect(bridge.listenerCount()).toBe(3)
    second()
    expect(bridge.listenerCount()).toBe(0)
  })

  it('mutação manda a revisão atual e aplica o estado devolvido', async () => {
    const next = makeState({ revision: 2, settings: { enabled: false, strategy: 'manual', maxHopsPerLineage: 3, updatedAt: null } })
    const bridge = createFakeBridge({ updateSettings: () => ({ ok: true, state: next }) })
    const store = createAccountChainStore(bridge)
    store.retain()
    await flush()
    expect(await store.updateSettings({ enabled: false })).toEqual({ ok: true })
    expect(bridge.calls.find((call) => call.method === 'updateSettings')?.params).toEqual({
      enabled: false,
      expectedRevision: 1,
    })
    expect(store.getSnapshot().state?.revision).toBe(2)
  })

  it('conflito de revisão mostra a versão atual e avisa', async () => {
    const current = makeState({ revision: 7 })
    const bridge = createFakeBridge({
      updateMembers: () => ({ ok: false, code: 'REVISION_CONFLICT', current }),
    })
    const store = createAccountChainStore(bridge)
    store.retain()
    await flush()
    const result = await store.updateMembers([makeMember({ enabled: false })])
    expect(result).toEqual({ ok: false, message: CHAIN_CONFLICT_MESSAGE, conflict: true })
    expect(store.getSnapshot()).toMatchObject({ message: CHAIN_CONFLICT_MESSAGE })
    expect(store.getSnapshot().state?.revision).toBe(7)
    expect(bridge.calls.find((call) => call.method === 'updateMembers')?.params).toEqual({
      members: [{ accountId: 'conta-a', enabled: false, billingDeclared: null, multiplierDeclared: null }],
      expectedRevision: 1,
    })
  })

  it('falha do main vira mensagem, não exceção', async () => {
    const bridge = createFakeBridge({
      getState: () => {
        throw new Error('ipc caiu')
      },
    })
    const store = createAccountChainStore(bridge)
    store.retain()
    await flush()
    expect(store.getSnapshot()).toMatchObject({ status: 'error' })
    expect(store.getSnapshot().message).toMatch(/processo principal/)
  })

  it('pushes: estado novo, proposta aberta e fechada, detecção por sessão', async () => {
    const bridge = createFakeBridge()
    const store = createAccountChainStore(bridge)
    store.retain()
    await flush()
    const proposal = makeProposal()
    bridge.emitProposal({ type: 'opened', proposal })
    expect(store.getSnapshot().state?.pendingProposals.map((item) => item.id)).toEqual(['proposta-1'])
    bridge.emitProposal({ type: 'closed', proposalId: 'proposta-1', state: 'expired', sourceSessionId: 'canvas:bloco-1' })
    expect(store.getSnapshot().state?.pendingProposals).toEqual([])

    bridge.emitDetection(makeDetection())
    expect(store.getSnapshot().detections['canvas:bloco-1']?.outcome).toBe('proposed')
    store.clearDetection('canvas:bloco-1')
    expect(store.getSnapshot().detections['canvas:bloco-1']).toBeUndefined()

    bridge.emitChanged(makeState({ revision: 9 }))
    expect(store.getSnapshot().state?.revision).toBe(9)
  })

  it('conferir login e liberar espera recarregam o estado', async () => {
    const bridge = createFakeBridge()
    const store = createAccountChainStore(bridge)
    store.retain()
    await flush()
    await store.checkLogin(['a', 'b', 'c', 'd', 'e', 'f'])
    expect(bridge.calls.find((call) => call.method === 'checkLogin')?.params).toEqual({
      accountIds: ['a', 'b', 'c', 'd', 'e'],
    })
    expect(await store.releaseCooldown('conta-a', 'not-a-limit')).toEqual({ ok: true, requiresCheck: false })
    expect(bridge.calls.filter((call) => call.method === 'getState').length).toBe(3)
  })
})

describe('applyProposalEvent', () => {
  it('reabrir a mesma proposta substitui, não duplica', () => {
    const state = makeState({ pendingProposals: [makeProposal()] })
    const next = applyProposalEvent(state, { type: 'opened', proposal: makeProposal({ recommendedAccountId: 'conta-c' }) })
    expect(next.pendingProposals).toHaveLength(1)
    expect(next.pendingProposals[0].recommendedAccountId).toBe('conta-c')
  })
})

describe('changeSessionAccountMode', () => {
  it('fixar grava mesmo sem o serviço; voltar para a cadeia não', async () => {
    expect(await changeSessionAccountMode(null, 'canvas:b', 'pinned')).toEqual({ persist: true, message: null })
    expect(await changeSessionAccountMode(null, 'canvas:b', 'chain')).toEqual({
      persist: false,
      message: CHAIN_UNAVAILABLE_MESSAGE,
    })
  })

  it('manda a sessão e o modo; recusa do main só grava quando é fixar', async () => {
    const bridge = createFakeBridge({ setSessionMode: () => ({ ok: false, message: 'sessão encerrada' }) })
    expect(await changeSessionAccountMode(bridge, 'canvas:b', 'chain')).toEqual({
      persist: false,
      message: 'sessão encerrada',
    })
    expect(await changeSessionAccountMode(bridge, 'canvas:b', 'pinned')).toEqual({
      persist: true,
      message: 'sessão encerrada',
    })
    expect(bridge.calls.map((call) => call.params)).toEqual([
      { sessionId: 'canvas:b', mode: 'chain' },
      { sessionId: 'canvas:b', mode: 'pinned' },
    ])
  })
})

describe('Automática (cadeia): prévia e confirmação', () => {
  it('prévia pronta diz a conta; sem conta apta recusa com os motivos', async () => {
    const pronta = await previewChainLaunch(createFakeBridge(), 'codex')
    expect(pronta).toMatchObject({ status: 'ready' })
    const recusada = await previewChainLaunch(
      createFakeBridge({
        previewLaunch: () => ({
          ok: false,
          code: 'NO_CANDIDATE',
          reasons: [{ accountId: 'a', providerId: 'codex', label: 'Pessoal', reason: 'em-espera', reasonText: null }],
        }),
      }),
      'codex',
    )
    expect(recusada).toEqual({
      status: 'refused',
      message: 'Nenhuma conta apta agora; o bloco não vai abrir no Login do sistema. Pessoal (Codex): em espera',
    })
    expect(await previewChainLaunch(null, 'codex')).toEqual({ status: 'refused', message: CHAIN_UNAVAILABLE_MESSAGE })
  })

  it('confirma o destino mostrado e devolve o ticket', async () => {
    const bridge = createFakeBridge()
    const result = await confirmChainLaunch(bridge, makeProposal({ kind: 'launch' }))
    expect(bridge.calls[0]).toEqual({
      method: 'confirm',
      params: { proposalId: 'proposta-1', destinationAccountId: 'conta-b' },
    })
    expect(result).toEqual({
      ok: true,
      launch: { ticket: 'proposta-1', accountId: 'conta-b', providerId: 'codex', label: 'Trabalho', proposalId: 'proposta-1' },
    })
  })

  it('destino que mudou nunca é aceito sozinho: devolve a nova prévia e o motivo', async () => {
    const nova = makeProposal({ kind: 'launch', recommendedAccountId: 'conta-c' })
    const result = await confirmChainLaunch(
      createFakeBridge({ confirm: () => ({ ok: false, code: 'SUPERSEDED', proposal: nova }) }),
      makeProposal({ kind: 'launch' }),
    )
    expect(result).toMatchObject({ ok: false, preview: { status: 'ready', summary: expect.stringContaining('Reserva') } })
  })

  it('sem destino recomendado não chama o main', async () => {
    const bridge = createFakeBridge()
    expect(await confirmChainLaunch(bridge, makeProposal({ recommendedAccountId: null }))).toMatchObject({ ok: false })
    expect(bridge.calls).toEqual([])
  })
})

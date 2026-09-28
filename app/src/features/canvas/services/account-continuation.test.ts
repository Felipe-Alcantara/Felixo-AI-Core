import { describe, expect, it } from 'vitest'
import {
  performContinuation,
  prepareRedactedTranscript,
  type ContinuationEnv,
  type ContinuationNodeOptions,
} from './account-continuation'
import { createFakeBridge, makeProposal } from './__fixtures__/account-chain-fixtures'

const TRANSCRIPT = { text: 'trabalho em andamento\n[redigido]', chars: 32, lines: 2 }

function env(overrides: Partial<ContinuationEnv> = {}) {
  const created: Array<{ sourceId: string; options: ContinuationNodeOptions }> = []
  const marked: Array<[string, string]> = []
  const base: ContinuationEnv = {
    bridge: createFakeBridge(),
    findNodeByOrigin: () => null,
    getSource: () => ({ command: 'codex', args: ['--model', 'gpt-5'], label: 'Codex · repo', cwd: '/repo' }),
    createNode: (sourceId, options) => {
      created.push({ sourceId, options })
      return 'bloco-2'
    },
    markSource: (sourceId, successorId) => marked.push([sourceId, successorId]),
    now: () => new Date('2026-09-28T17:33:00.000Z'),
    timeOptions: { timeZone: 'America/Sao_Paulo' },
    ...overrides,
  }
  return { env: base, created, marked }
}

const request = {
  proposal: makeProposal(),
  sourceNodeId: 'bloco-1',
  destinationAccountId: 'conta-b',
  autoSubmit: true,
  acknowledgeSourceActive: false,
  transcript: TRANSCRIPT,
}

describe('prepareRedactedTranscript', () => {
  it('redige no main e conta linhas do texto redigido', async () => {
    const bridge = createFakeBridge()
    const result = await prepareRedactedTranscript(bridge, 'chave sk-abc123\nfim')
    expect(result).toEqual({ ok: true, text: 'chave [redigido]\nfim', chars: 20, lines: 2 })
  })

  it('sem a ponte ou com falha, nada é enviado', async () => {
    expect((await prepareRedactedTranscript(null, 'x')).ok).toBe(false)
    const falha = createFakeBridge({ redactTranscript: () => ({ ok: false, message: 'grande demais' }) })
    expect(await prepareRedactedTranscript(falha, 'x')).toEqual({ ok: false, message: 'grande demais' })
  })
})

describe('performContinuation', () => {
  it('confirma no main e cria o bloco na conta de destino, modo cadeia, com ticket e origem', async () => {
    const bridge = createFakeBridge()
    const { env: e, created, marked } = env({ bridge })
    const outcome = await performContinuation(request, e)

    expect(outcome).toEqual({ ok: true, nodeId: 'bloco-2', reused: false })
    expect(bridge.calls).toEqual([
      {
        method: 'confirm',
        params: { proposalId: 'proposta-1', destinationAccountId: 'conta-b', transcriptChars: 32 },
      },
    ])
    expect(created).toHaveLength(1)
    const options = created[0].options
    expect(options).toMatchObject({
      command: 'codex',
      args: ['--model', 'gpt-5'],
      cwd: '/repo',
      label: 'Codex · repo · continuação (Trabalho)',
      accountId: 'conta-b',
      providerId: 'codex',
      accountMode: 'chain',
      chainTicket: 'proposta-1',
      chainOrigin: {
        switchEventId: 'proposta-1',
        fromNodeId: 'bloco-1',
        reasonClass: 'limit',
        decidedAt: '2026-09-28T17:33:00.000Z',
      },
      handoffAutoSubmit: true,
    })
    expect(options.handoffText).toContain('atingiu o limite de uso (detectado pelo app às 14:32)')
    expect(options.handoffText).toContain('[redigido]')
    // O bloco antigo só ganha a marca; nada é escrito nele.
    expect(marked).toEqual([['bloco-1', 'bloco-2']])
  })

  it('clique duplo: bloco que já nasceu desta troca é reaproveitado, sem novo confirm', async () => {
    const bridge = createFakeBridge()
    const { env: e, created } = env({ bridge, findNodeByOrigin: () => 'bloco-2' })
    expect(await performContinuation(request, e)).toEqual({ ok: true, nodeId: 'bloco-2', reused: true })
    expect(bridge.calls).toEqual([])
    expect(created).toEqual([])
  })

  it('terminal antigo ativo: nada abre e o código pede a segunda confirmação', async () => {
    const bridge = createFakeBridge({ confirm: () => ({ ok: false, code: 'SOURCE_ACTIVE' }) })
    const { env: e, created, marked } = env({ bridge })
    const outcome = await performContinuation(request, e)
    expect(outcome).toMatchObject({ ok: false, code: 'SOURCE_ACTIVE' })
    expect(created).toEqual([])
    expect(marked).toEqual([])

    await performContinuation({ ...request, acknowledgeSourceActive: true }, e)
    expect(bridge.calls.at(-1)?.params).toMatchObject({ acknowledgeSourceActive: true })
  })

  it('destino que mudou devolve a proposta nova e não cria nada', async () => {
    const nova = makeProposal({ recommendedAccountId: 'conta-c' })
    const bridge = createFakeBridge({ confirm: () => ({ ok: false, code: 'SUPERSEDED', proposal: nova }) })
    const { env: e, created } = env({ bridge })
    const outcome = await performContinuation(request, e)
    expect(outcome).toMatchObject({ ok: false, code: 'SUPERSEDED', proposal: nova })
    expect(created).toEqual([])
  })

  it('sem submissão automática o contexto vai esperando a pessoa', async () => {
    const { env: e, created } = env()
    await performContinuation({ ...request, autoSubmit: false }, e)
    expect(created[0].options.handoffAutoSubmit).toBe(false)
  })

  it('origem que sumiu não confirma nada', async () => {
    const bridge = createFakeBridge()
    const { env: e } = env({ bridge, getSource: () => null })
    expect(await performContinuation(request, e)).toMatchObject({ ok: false })
    expect(bridge.calls).toEqual([])
  })
})

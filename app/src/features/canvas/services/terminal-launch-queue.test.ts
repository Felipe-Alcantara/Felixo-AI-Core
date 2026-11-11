import { describe, expect, it, vi } from 'vitest'
import type { AccountSwitchProposal } from '../../shared/types/account-chain'
import type { ChainLaunchConfirmation, ChainLaunchPreview } from './account-chain-client'
import type { NewTerminalOptions } from './new-terminal-options'
import { startLaunchQueue, type QueuedLaunch } from './terminal-launch-queue'

const proposal = (id: string, accountId: string) =>
  ({ id, recommendedAccountId: accountId }) as unknown as AccountSwitchProposal

const chainItem = (label: string, proposalId: string, accountId: string): QueuedLaunch => ({
  options: { label, providerId: 'claude', accountId: '__cadeia__', command: 'claude' } as NewTerminalOptions,
  chain: { proposal: proposal(proposalId, accountId), summary: `Vai abrir na conta ${accountId}.` },
})

describe('startLaunchQueue', () => {
  it('confirma cada item da cadeia só ao iniciar e abre com o ticket recém-gerado (antes vencia em 2 min na fila)', async () => {
    const fixed: QueuedLaunch = { options: { label: 'Fixa', providerId: 'codex', accountId: 'conta-fixa' } as NewTerminalOptions }
    const confirm = vi.fn(async (item: AccountSwitchProposal): Promise<ChainLaunchConfirmation> => ({
      ok: true,
      launch: { ticket: `ticket-${item.id}`, accountId: `destino-${item.id}`, providerId: 'claude', label: null, proposalId: item.id },
    }))
    const preview = vi.fn()

    const result = await startLaunchQueue([chainItem('A', 'p1', 'x'), fixed, chainItem('B', 'p2', 'y')], { confirm, preview })

    expect(confirm.mock.calls.map(([item]) => item.id)).toEqual(['p1', 'p2'])
    expect(preview).not.toHaveBeenCalled()
    expect(result.remaining).toEqual([])
    expect(result.toOpen.map((item) => [item.label, item.accountId, item.accountMode, item.chainTicket])).toEqual([
      ['A', 'destino-p1', 'chain', 'ticket-p1'],
      ['Fixa', 'conta-fixa', undefined, undefined],
      ['B', 'destino-p2', 'chain', 'ticket-p2'],
    ])
  })

  it('a conta que deixou de ser apta não abre noutra: o item fica na fila com o motivo e a nova conta sugerida', async () => {
    const recalculated: ChainLaunchPreview = { status: 'ready', proposal: proposal('p9', 'z'), summary: 'Vai abrir na conta z.' }
    const confirm = vi.fn(async (item: AccountSwitchProposal): Promise<ChainLaunchConfirmation> =>
      item.id === 'p1'
        ? { ok: false, message: 'A conta x ficou sem limite.', preview: recalculated }
        : { ok: true, launch: { ticket: 't2', accountId: 'y', providerId: 'claude', label: null, proposalId: 'p2' } },
    )

    const result = await startLaunchQueue([chainItem('A', 'p1', 'x'), chainItem('B', 'p2', 'y')], { confirm, preview: vi.fn() })

    expect(result.toOpen.map((item) => item.label)).toEqual(['B'])
    expect(result.remaining).toHaveLength(1)
    expect(result.remaining[0].options.label).toBe('A')
    expect(result.remaining[0].chain).toEqual({ proposal: recalculated.proposal, summary: 'Vai abrir na conta z.', message: 'A conta x ficou sem limite.' })
  })

  it('proposta vencida sem prévia nova: pede uma prévia para o item voltar à fila com a conta atual', async () => {
    const fresh: ChainLaunchPreview = { status: 'ready', proposal: proposal('p5', 'w'), summary: 'Vai abrir na conta w.' }
    const preview = vi.fn(async () => fresh)
    const confirm = vi.fn(async (): Promise<ChainLaunchConfirmation> => ({ ok: false, message: 'A proposta venceu.' }))

    const result = await startLaunchQueue([chainItem('A', 'p1', 'x')], { confirm, preview })

    expect(preview).toHaveBeenCalledWith('claude')
    expect(result.toOpen).toEqual([])
    expect(result.remaining[0].chain).toEqual({ proposal: fresh.proposal, summary: 'Vai abrir na conta w.', message: 'A proposta venceu.' })
  })

  it('sem conta apta nem prévia nova, o item fica com a proposta antiga e o motivo, e nunca abre no Login do sistema', async () => {
    const preview = vi.fn(async (): Promise<ChainLaunchPreview> => ({ status: 'refused', message: 'Nenhuma conta apta.' }))
    const confirm = vi.fn(async (): Promise<ChainLaunchConfirmation> => ({ ok: false, message: 'Nenhuma conta apta agora.' }))
    const item = chainItem('A', 'p1', 'x')

    const result = await startLaunchQueue([item], { confirm, preview })

    expect(result.toOpen).toEqual([])
    expect(result.remaining[0].chain).toEqual({ ...item.chain, message: 'Nenhuma conta apta agora.' })
  })
})

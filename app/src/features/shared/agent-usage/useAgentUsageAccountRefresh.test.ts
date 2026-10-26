import { describe, expect, it, vi } from 'vitest'
import { refreshAgentUsageAccount } from './useAgentUsageAccountRefresh'
import type { AgentUsageDashboard } from './agent-usage'

describe('refreshAgentUsageAccount', () => {
  const conta = { id: 'conta-a' }
  const painel = (extras: Partial<AgentUsageDashboard> = {}): AgentUsageDashboard => ({ ok: true, accounts: [], ...extras })

  function montar(resposta: () => Promise<AgentUsageDashboard>, ativo = true) {
    const eventos: string[] = []
    const api = { refreshAccount: vi.fn(resposta) }
    const sink = {
      onDashboard: vi.fn((dashboard: AgentUsageDashboard) => eventos.push(`painel:${dashboard.accounts?.length ?? 0}`)),
      onMessage: vi.fn((mensagem: string | null) => eventos.push(`mensagem:${mensagem}`)),
      isActive: () => ativo,
    }
    return { api, sink, eventos }
  }

  it('pede só a conta clicada, limpa a mensagem antiga e entrega o painel novo', async () => {
    const { api, sink, eventos } = montar(async () => painel({ accounts: [{} as never] }))

    await refreshAgentUsageAccount(api, conta, sink)

    expect(api.refreshAccount).toHaveBeenCalledExactlyOnceWith('conta-a')
    expect(eventos).toEqual(['mensagem:null', 'painel:1', 'mensagem:null'])
  })

  it('o teto de tempo estourado entrega o painel que já existia e deixa o motivo escrito', async () => {
    const { api, sink, eventos } = montar(async () => painel({ refreshError: 'A consulta não respondeu em 90 s.' }))

    await refreshAgentUsageAccount(api, conta, sink)

    expect(eventos).toEqual(['mensagem:null', 'painel:0', 'mensagem:A consulta não respondeu em 90 s.'])
  })

  it('resposta de falha mostra a mensagem do processo principal, ou a padrão, e não troca o painel', async () => {
    for (const [resposta, esperada] of [
      [{ ok: false, message: 'Conta de agente não encontrada.' }, 'Conta de agente não encontrada.'],
      [{ ok: false }, 'Não foi possível atualizar esta conta.'],
    ] as const) {
      const { api, sink, eventos } = montar(async () => resposta)

      await refreshAgentUsageAccount(api, conta, sink)

      expect(eventos).toEqual(['mensagem:null', `mensagem:${esperada}`])
      expect(sink.onDashboard).not.toHaveBeenCalled()
    }
  })

  it('a chamada que falha por exceção vira mensagem, e não derruba o painel', async () => {
    const { api, sink, eventos } = montar(async () => {
      throw new Error('canal fechado')
    })

    await expect(refreshAgentUsageAccount(api, conta, sink)).resolves.toBeUndefined()

    expect(eventos).toEqual(['mensagem:null', 'mensagem:Não foi possível falar com o processo principal.'])
  })

  it('fora do app desktop (sem a ponte) avisa em vez de falhar calado', async () => {
    const { sink, eventos } = montar(async () => painel())

    await refreshAgentUsageAccount(undefined, conta, sink)

    expect(eventos).toEqual(['mensagem:Este painel só funciona no app desktop.'])
  })

  it('resposta que chega depois de o painel fechar não escreve em nenhum estado', async () => {
    for (const resposta of [async () => painel(), async () => ({ ok: false, message: 'x' }), async () => Promise.reject(new Error('x'))]) {
      const { api, sink, eventos } = montar(resposta, false)

      await refreshAgentUsageAccount(api, conta, sink)

      // Só a limpeza da mensagem antiga, que acontece antes de o painel poder fechar.
      expect(eventos).toEqual(['mensagem:null'])
      expect(sink.onDashboard).not.toHaveBeenCalled()
    }
  })
})

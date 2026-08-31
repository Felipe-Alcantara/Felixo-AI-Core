import { describe, expect, it } from 'vitest'
import {
  agentRequestAction,
  applyAgentRequestResult,
  describeAgentRequest,
  formatRequestTime,
  pickPendingRequest,
} from './fetch-all-agent-requests'
import type { FetchAllAgentRequest, FetchAllPlan } from '../../types'

function pedido(overrides: Partial<FetchAllAgentRequest> = {}): FetchAllAgentRequest {
  return {
    id: 'p1',
    acao: 'executar-plano',
    comCommit: false,
    estado: 'pendente',
    pedidoEm: '2026-08-24T12:00:00.000Z',
    origem: '/projeto',
    ...overrides,
  }
}

const PLANO: FetchAllPlan = {
  upToDate: [],
  toPull: [],
  toPush: [],
  problems: [],
  total: 0,
}

describe('pickPendingRequest', () => {
  it('ignora pedidos já resolvidos', () => {
    const aceito = pedido({ id: 'a', estado: 'aceito' })
    const pendente = pedido({ id: 'b' })

    expect(pickPendingRequest([aceito, pendente])?.id).toBe('b')
  })

  it('atende o mais antigo primeiro', () => {
    const antigo = pedido({ id: 'antigo', pedidoEm: '2026-08-24T11:00:00.000Z' })
    const novo = pedido({ id: 'novo', pedidoEm: '2026-08-24T12:00:00.000Z' })

    expect(pickPendingRequest([antigo, novo])?.id).toBe('antigo')
  })

  it('lista vazia ou ausente não inventa pedido', () => {
    expect(pickPendingRequest([])).toBeNull()
    expect(pickPendingRequest(null)).toBeNull()
  })
})

describe('describeAgentRequest', () => {
  it('diz explicitamente que nada foi executado', () => {
    // Sem esta frase o aviso pode ser lido como notificação de algo já feito.
    expect(describeAgentRequest(pedido())).toContain('Nada foi executado')
  })

  it('distingue o pedido com commit do pedido sem commit', () => {
    expect(describeAgentRequest(pedido())).toContain('pull e push')
    expect(describeAgentRequest(pedido())).not.toContain('commit')
    expect(describeAgentRequest(pedido({ comCommit: true }))).toContain('commit')
  })

  it('mostra de onde o pedido veio', () => {
    expect(describeAgentRequest(pedido({ origem: '/repos/x' }))).toContain('/repos/x')
    expect(describeAgentRequest(pedido({ origem: '' }))).not.toContain('a partir de')
  })
})

describe('agentRequestAction', () => {
  it('não oferece escrita enquanto não há plano na tela', () => {
    // A pessoa nunca autoriza no escuro: sem plano visível, só dá para varrer.
    expect(agentRequestAction(null, false)).toBe('varrer')
  })

  it('oferece aplicar quando há um plano para revisar', () => {
    expect(agentRequestAction(PLANO, false)).toBe('aplicar')
  })

  it('não oferece nada enquanto uma passada está em andamento', () => {
    expect(agentRequestAction(PLANO, true)).toBe('aguardar')
    expect(agentRequestAction(null, true)).toBe('aguardar')
  })
})

describe('applyAgentRequestResult', () => {
  it('mantém o plano e mostra o diagnóstico quando a execução falha', () => {
    expect(
      applyAgentRequestResult(
        {
          ok: false,
          message: 'O plano não tem nenhuma ação segura.',
          resultado: { ok: false, message: 'O plano não tem nenhuma ação segura.' },
        },
        true,
      ),
    ).toEqual({
      error: 'O plano não tem nenhuma ação segura.',
      clearPlan: false,
      results: null,
      reportPath: '',
    })
  })

  it('só limpa o plano depois de uma execução aceita e bem-sucedida', () => {
    expect(
      applyAgentRequestResult(
        {
          ok: true,
          resultado: {
            ok: true,
            results: [],
            reportPath: '/relatorios/fetch-all/execucao.md',
          },
        },
        true,
      ),
    ).toEqual({
      error: null,
      clearPlan: true,
      results: [],
      reportPath: '/relatorios/fetch-all/execucao.md',
    })
  })

  it('não altera o plano ao recusar o pedido', () => {
    expect(applyAgentRequestResult({ ok: true }, false)).toEqual({
      error: null,
      clearPlan: false,
      results: null,
      reportPath: '',
    })
  })
})

describe('formatRequestTime', () => {
  it('data inválida vira string vazia em vez de "Invalid Date"', () => {
    expect(formatRequestTime(pedido({ pedidoEm: 'nao-e-data' }))).toBe('')
  })

  it('formata a hora do pedido', () => {
    expect(formatRequestTime(pedido())).toMatch(/^\d{2}:\d{2}$/)
  })
})

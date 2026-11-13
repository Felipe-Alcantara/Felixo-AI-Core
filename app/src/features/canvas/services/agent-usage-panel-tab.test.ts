import { afterEach, describe, expect, it } from 'vitest'
import {
  consumeRequestedAgentUsageTab,
  requestAgentUsageTab,
  subscribeAgentUsageTabRequests,
} from './agent-usage-panel-tab'

describe('aba pedida ao painel "Limites e uso"', () => {
  afterEach(() => {
    consumeRequestedAgentUsageTab()
  })

  it('com o painel fechado, o pedido espera a montagem e vale uma vez', () => {
    requestAgentUsageTab('cadeia')
    expect(consumeRequestedAgentUsageTab()).toBe('cadeia')
    expect(consumeRequestedAgentUsageTab()).toBeNull()
  })

  it('com o painel aberto, o pedido chega na hora e não sobra para a próxima montagem', () => {
    // "Configurar cadeia" com o painel já aberto não trocava de aba: o pedido só era lido ao montar.
    const recebidos: string[] = []
    const cancelar = subscribeAgentUsageTabRequests((tab) => recebidos.push(tab))
    requestAgentUsageTab('cadeia')
    expect(recebidos).toEqual(['cadeia'])
    expect(consumeRequestedAgentUsageTab()).toBeNull()

    cancelar()
    requestAgentUsageTab('trocas')
    expect(recebidos).toEqual(['cadeia'])
    expect(consumeRequestedAgentUsageTab()).toBe('trocas')
  })
})

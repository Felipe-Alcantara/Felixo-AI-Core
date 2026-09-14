import { describe, expect, it } from 'vitest'
import {
  applyWriteRequestResult,
  describeWriteRequest,
  findTargetLabel,
  formatWriteRequestTime,
  pickPendingWriteRequest,
  previewWriteContent,
} from './canvas-write-agent-requests'
import type { CanvasWriteAgentRequest } from '../../types'

function pedido(overrides: Partial<CanvasWriteAgentRequest> = {}): CanvasWriteAgentRequest {
  return {
    id: 'p1',
    acao: 'canvas-escrever',
    idDoElemento: 'n1',
    conteudo: 'texto do agente',
    estado: 'pendente',
    pedidoEm: '2026-09-14T12:00:00.000Z',
    origem: 'terminal-abc',
    ...overrides,
  }
}

describe('pickPendingWriteRequest', () => {
  it('ignora pedidos já resolvidos', () => {
    const aceito = pedido({ id: 'a', estado: 'aceito' })
    const pendente = pedido({ id: 'b' })
    expect(pickPendingWriteRequest([aceito, pendente])?.id).toBe('b')
  })

  it('atende o mais antigo primeiro', () => {
    const antigo = pedido({ id: 'antigo', pedidoEm: '2026-09-14T11:00:00.000Z' })
    const novo = pedido({ id: 'novo', pedidoEm: '2026-09-14T12:00:00.000Z' })
    expect(pickPendingWriteRequest([antigo, novo])?.id).toBe('antigo')
  })

  it('lista vazia ou ausente não inventa pedido', () => {
    expect(pickPendingWriteRequest([])).toBeNull()
    expect(pickPendingWriteRequest(null)).toBeNull()
  })
})

describe('findTargetLabel', () => {
  it('usa data.label quando existe', () => {
    const nodes = [{ id: 'n1', data: { label: 'Minha nota' } }]
    expect(findTargetLabel(pedido(), nodes)).toBe('Minha nota')
  })

  it('cai pra primeira linha do texto quando não há label', () => {
    const nodes = [{ id: 'n1', data: { text: 'Primeira linha\nresto' } }]
    expect(findTargetLabel(pedido(), nodes)).toBe('Primeira linha')
  })

  it('cai pro id quando o nó não existe mais ou não tem nada pra mostrar', () => {
    expect(findTargetLabel(pedido(), [])).toBe('n1')
  })
})

describe('describeWriteRequest', () => {
  it('diz explicitamente que nada foi escrito', () => {
    expect(describeWriteRequest(pedido(), [])).toContain('Nada foi escrito')
  })

  it('mostra o rótulo do alvo e a origem', () => {
    const nodes = [{ id: 'n1', data: { label: 'Ideias' } }]
    const texto = describeWriteRequest(pedido(), nodes)
    expect(texto).toContain('"Ideias"')
    expect(texto).toContain('terminal-abc')
  })
})

describe('previewWriteContent', () => {
  it('devolve o conteúdo inteiro quando é curto', () => {
    expect(previewWriteContent(pedido({ conteudo: 'curto' }))).toBe('curto')
  })

  it('trunca conteúdo grande, sem estourar a tela', () => {
    const grande = 'x'.repeat(500)
    const preview = previewWriteContent(pedido({ conteudo: grande }))
    expect(preview.length).toBeLessThan(300)
    expect(preview.endsWith('…')).toBe(true)
  })
})

describe('applyWriteRequestResult', () => {
  it('mostra erro quando o IPC falha', () => {
    expect(applyWriteRequestResult({ ok: false, message: 'deu ruim' }, true)).toEqual({
      error: 'deu ruim',
      applied: false,
    })
  })

  it('não aplica nada ao recusar', () => {
    expect(applyWriteRequestResult({ ok: true }, false)).toEqual({ error: null, applied: false })
  })

  it('mostra o motivo quando a escrita em si falhou (ex.: elemento sumiu)', () => {
    expect(
      applyWriteRequestResult({ ok: true, resultado: { ok: false, message: 'sumiu' } }, true),
    ).toEqual({ error: 'sumiu', applied: false })
  })

  it('marca como aplicado só quando aceito e bem-sucedido', () => {
    expect(applyWriteRequestResult({ ok: true, resultado: { ok: true } }, true)).toEqual({
      error: null,
      applied: true,
    })
  })
})

describe('formatWriteRequestTime', () => {
  it('data inválida vira string vazia', () => {
    expect(formatWriteRequestTime(pedido({ pedidoEm: 'nao-e-data' }))).toBe('')
  })

  it('formata a hora do pedido', () => {
    expect(formatWriteRequestTime(pedido())).toMatch(/^\d{2}:\d{2}$/)
  })
})

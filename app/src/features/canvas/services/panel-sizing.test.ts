import { describe, expect, it } from 'vitest'
import {
  clampPanelWidth,
  getDefaultPanelWidth,
  getNodeSizeScale,
  getPanelMaxHeight,
  getPanelMaxWidth,
  readPanelWidth,
  scaleNodeSize,
  writePanelWidth,
} from './panel-sizing'

/** Notebook do relato: 1366x768, viewport útil de 1320x738. */
const SMALL = 1320
const LARGE = 1920

function fakeStorage(values: Record<string, string> = {}) {
  const store = new Map(Object.entries(values))
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    read: () => Object.fromEntries(store),
  }
}

describe('largura padrão do painel', () => {
  it('encolhe na tela pequena e mantém o tamanho de antes na grande', () => {
    // O painel de prompts ocupava 672px fixos: 51% de 1320.
    expect(getDefaultPanelWidth(SMALL, 'xl')).toBe(528)
    expect(getDefaultPanelWidth(LARGE, 'xl')).toBe(700)

    expect(getDefaultPanelWidth(SMALL, 'sm')).toBe(317)
    expect(getDefaultPanelWidth(LARGE, 'sm')).toBe(380)
  })

  it('sempre deixa canvas visível ao lado do painel', () => {
    for (const size of ['sm', 'md', 'lg', 'xl'] as const) {
      expect(getDefaultPanelWidth(SMALL, size)).toBeLessThanOrEqual(SMALL - 300)
    }
  })

  it('não inverte o intervalo quando a tela é menor que o mínimo do painel', () => {
    const width = clampPanelWidth(900, 320, 'xl')

    expect(width).toBeGreaterThan(0)
    expect(width).toBeLessThanOrEqual(getPanelMaxWidth(320, 'xl'))
  })
})

describe('largura arrastada', () => {
  it('lembra o valor escolhido', () => {
    const storage = fakeStorage()
    writePanelWidth(storage, 'prompts', 610)

    expect(readPanelWidth(storage, 'prompts', SMALL, 'xl')).toBe(610)
  })

  it('traz para a faixa um valor arrastado em tela maior', () => {
    // 900px cabiam no monitor grande; no notebook cobririam quase tudo.
    const storage = fakeStorage({ 'felixo:canvas-panel-width:prompts': '900' })
    const width = readPanelWidth(storage, 'prompts', SMALL, 'xl')

    expect(width).toBe(getPanelMaxWidth(SMALL, 'xl'))
    expect(width).toBeLessThan(900)
  })

  it('ignora lixo salvo e volta ao sugerido', () => {
    const storage = fakeStorage({ 'felixo:canvas-panel-width:prompts': 'não é número' })

    expect(readPanelWidth(storage, 'prompts', SMALL, 'xl')).toBe(
      getDefaultPanelWidth(SMALL, 'xl'),
    )
  })

  it('guarda a largura por painel, sem um mexer no outro', () => {
    const storage = fakeStorage()
    writePanelWidth(storage, 'prompts', 600)
    writePanelWidth(storage, 'git', 300)

    expect(readPanelWidth(storage, 'prompts', SMALL, 'xl')).toBe(600)
    expect(readPanelWidth(storage, 'git', SMALL, 'sm')).toBe(
      clampPanelWidth(300, SMALL, 'sm'),
    )
  })

  it('sobrevive a um armazenamento que lança', () => {
    const throwing = {
      getItem: () => {
        throw new Error('bloqueado')
      },
      setItem: () => {
        throw new Error('bloqueado')
      },
    }

    expect(readPanelWidth(throwing, 'prompts', SMALL, 'xl')).toBe(
      getDefaultPanelWidth(SMALL, 'xl'),
    )
    expect(() => writePanelWidth(throwing, 'prompts', 500)).not.toThrow()
  })
})

describe('altura do painel', () => {
  it('reserva topo e rodapé em vez de encostar nos dois extremos', () => {
    // Antes: 80vh (590) começando a 64px do topo, em 738 de janela.
    expect(getPanelMaxHeight(738)).toBe(626)
    expect(getPanelMaxHeight(738) + 64).toBeLessThan(738)
  })

  it('mantém altura utilizável mesmo numa janela muito baixa', () => {
    expect(getPanelMaxHeight(200)).toBe(240)
  })
})

describe('tamanho dos blocos do canvas', () => {
  it('encolhe o bloco na tela pequena sem deformar a proporção', () => {
    const terminal = scaleNodeSize({ width: 520, height: 360 }, SMALL)

    expect(terminal).toEqual({ width: 429, height: 297 })
    expect(terminal.width / terminal.height).toBeCloseTo(520 / 360, 2)
  })

  it('não aumenta bloco em monitor grande', () => {
    expect(scaleNodeSize({ width: 520, height: 360 }, LARGE)).toEqual({
      width: 520,
      height: 360,
    })
  })

  it('tem piso para o bloco não nascer ilegível', () => {
    expect(getNodeSizeScale(600)).toBe(0.72)
    expect(getNodeSizeScale(0)).toBe(1)
  })
})

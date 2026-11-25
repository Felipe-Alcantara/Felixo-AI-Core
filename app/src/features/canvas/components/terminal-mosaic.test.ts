import { describe, expect, it } from 'vitest'
import {
  MOSAIC_DIVIDER,
  MOSAIC_MIN_PANE,
  clampMosaicRatio,
  insertMosaicPane,
  layoutMosaic,
  mosaicPaneIds,
  neighborMosaicPane,
  presetMosaic,
  removeMosaicPane,
  replaceMosaicPane,
  setMosaicRatio,
  swapMosaicPanes,
  type MosaicNode,
  type MosaicRect,
} from './terminal-mosaic'

const AREA: MosaicRect = { x: 0, y: 0, width: 1600, height: 900 }
const ids = (n: number) => Array.from({ length: n }, (_, i) => `a${i + 1}`)

/** Os painéis e as faixas cobrem a área inteira: soma das áreas igual, nada fora, nada sobreposto. */
function expectTiles(tree: MosaicNode | null, area = AREA) {
  const { panes, dividers } = layoutMosaic(tree, area)
  const rects = [...panes, ...dividers.map((d) => d.rect)]
  const total = rects.reduce((sum, r) => sum + r.width * r.height, 0)
  expect(total).toBe(area.width * area.height)
  for (const r of rects) {
    expect(r.x).toBeGreaterThanOrEqual(area.x)
    expect(r.y).toBeGreaterThanOrEqual(area.y)
    expect(r.x + r.width).toBeLessThanOrEqual(area.x + area.width)
    expect(r.y + r.height).toBeLessThanOrEqual(area.y + area.height)
  }
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      const a = rects[i]
      const b = rects[j]
      const sobrepoe = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
      expect(sobrepoe).toBe(false)
    }
  }
}

describe('mosaico de terminais', () => {
  it('qualquer arranjo de 1 a 8 agentes ocupa a área inteira, sem buraco e sem sobreposição', () => {
    for (let n = 1; n <= 8; n += 1) {
      for (const preset of ['auto', 'colunas', 'linhas', 'grade'] as const) {
        const tree = presetMosaic(ids(n), preset, AREA)
        // Colunas, linhas e grade seguem a ordem; no auto o novo entra ao lado do maior painel.
        if (preset === 'auto') expect([...mosaicPaneIds(tree)].sort()).toEqual([...ids(n)].sort())
        else expect(mosaicPaneIds(tree)).toEqual(ids(n))
        expectTiles(tree)
      }
    }
  })

  it('o agente novo divide ao meio o maior painel, pelo lado mais comprido (bspwm)', () => {
    let tree = insertMosaicPane(null, 'a', { area: AREA })
    tree = insertMosaicPane(tree, 'b', { area: AREA })
    // Área larga: lado a lado.
    expect(tree).toMatchObject({ kind: 'split', direction: 'row', ratio: 0.5 })

    tree = insertMosaicPane(tree, 'c', { area: AREA })
    const { panes } = layoutMosaic(tree, AREA)
    const c = panes.find((p) => p.id === 'c')!
    const a = panes.find((p) => p.id === 'a')!
    // Os dois painéis eram altos (797×900): o terceiro empilha embaixo do primeiro.
    expect(c.x).toBe(a.x)
    expect(c.y).toBeGreaterThan(a.y)
    expectTiles(tree)
  })

  it('com alvo, divide exatamente o painel pedido (o que está em foco)', () => {
    let tree = presetMosaic(['a', 'b'], 'colunas', AREA)!
    tree = insertMosaicPane(tree, 'c', { target: 'b', area: AREA })
    const { panes } = layoutMosaic(tree, AREA)
    const b = panes.find((p) => p.id === 'b')!
    const c = panes.find((p) => p.id === 'c')!
    expect(c.x).toBe(b.x)
    expect(c.width).toBe(b.width)
    expect(mosaicPaneIds(tree)).toEqual(['a', 'b', 'c'])
  })

  it('a grade com 3 agentes não deixa célula vazia: o terceiro ocupa a linha de baixo inteira', () => {
    const { panes } = layoutMosaic(presetMosaic(ids(3), 'grade', AREA), AREA)
    const [a1, a2, a3] = panes
    expect(a1.y).toBe(a2.y)
    expect(a3.y).toBeGreaterThan(a1.y)
    expect(a3.width).toBe(AREA.width)
  })

  it('tirar um painel devolve o espaço ao irmão; tirar o último esvazia', () => {
    const tree = presetMosaic(['a', 'b', 'c'], 'colunas', AREA)!
    const sem = removeMosaicPane(tree, 'b')!
    expect(mosaicPaneIds(sem)).toEqual(['a', 'c'])
    expectTiles(sem)
    expect(removeMosaicPane(removeMosaicPane(sem, 'a'), 'c')).toBeNull()
    expect(removeMosaicPane(tree, 'inexistente')).toBe(tree)
  })

  it('trocar e substituir mantêm a forma da árvore', () => {
    const tree = presetMosaic(['a', 'b', 'c'], 'grade', AREA)!
    const antes = layoutMosaic(tree, AREA).panes
    const trocada = swapMosaicPanes(tree, 'a', 'c')
    const depois = layoutMosaic(trocada, AREA).panes
    expect(depois.find((p) => p.id === 'c')).toMatchObject({ x: antes[0].x, y: antes[0].y, width: antes[0].width })
    expect(mosaicPaneIds(replaceMosaicPane(tree, 'b', 'z'))).toEqual(['a', 'z', 'c'])
    // Substituir por quem já está no mosaico não duplica.
    expect(replaceMosaicPane(tree, 'b', 'a')).toBe(tree)
  })

  it('arrastar a divisória muda só aquela proporção, presa ao piso dos dois lados', () => {
    const tree = presetMosaic(['a', 'b'], 'colunas', AREA)!
    const [divisoria] = layoutMosaic(tree, AREA).dividers
    expect(divisoria.path).toBe('')

    const ajustada = setMosaicRatio(tree, '', clampMosaicRatio(divisoria, 0.7))
    const [a, b] = layoutMosaic(ajustada, AREA).panes
    expect(a.width).toBeGreaterThan(b.width)
    expectTiles(ajustada)

    // Puxar até a borda para no piso: nenhum lado fica menor que o mínimo.
    const presa = clampMosaicRatio(divisoria, 0.999)
    const [, bPreso] = layoutMosaic(setMosaicRatio(tree, '', presa), AREA).panes
    expect(bPreso.width).toBeGreaterThanOrEqual(MOSAIC_MIN_PANE.width)
    // Área menor que dois pisos: fica no meio em vez de inverter.
    expect(clampMosaicRatio({ direction: 'row', area: { x: 0, y: 0, width: 300, height: 400 } }, 0.9)).toBe(0.5)
  })

  it('as divisórias aninhadas têm caminho próprio e mudam só a sua divisão', () => {
    const tree = presetMosaic(ids(4), 'grade', AREA)!
    const { dividers } = layoutMosaic(tree, AREA)
    expect(dividers.map((d) => d.path).sort()).toEqual(['', 'f', 's'])
    const mexida = setMosaicRatio(tree, 'f', 0.3)
    const antes = layoutMosaic(tree, AREA).panes
    const depois = layoutMosaic(mexida, AREA).panes
    // Só a linha de cima mudou.
    expect(depois[0].width).toBeLessThan(antes[0].width)
    expect(depois[2]).toEqual(antes[2])
    expect(depois[3]).toEqual(antes[3])
  })

  it('o vizinho vem da geometria, como o focus left/right/up/down do i3', () => {
    const tree = presetMosaic(ids(3), 'grade', AREA)!
    expect(neighborMosaicPane(tree, AREA, 'a1', 'right')).toBe('a2')
    expect(neighborMosaicPane(tree, AREA, 'a2', 'left')).toBe('a1')
    expect(neighborMosaicPane(tree, AREA, 'a1', 'down')).toBe('a3')
    expect(neighborMosaicPane(tree, AREA, 'a2', 'down')).toBe('a3')
    // Sem vizinho naquele lado: fica onde está (não dá a volta).
    expect(neighborMosaicPane(tree, AREA, 'a1', 'left')).toBe('a1')
    expect(neighborMosaicPane(tree, AREA, 'a3', 'down')).toBe('a3')
  })

  it('a faixa entre painéis tem a espessura fixa e fica entre os dois lados', () => {
    const tree = presetMosaic(['a', 'b'], 'colunas', AREA)!
    const { panes, dividers } = layoutMosaic(tree, AREA)
    expect(dividers[0].rect.width).toBe(MOSAIC_DIVIDER)
    expect(dividers[0].rect.x).toBe(panes[0].x + panes[0].width)
    expect(panes[1].x).toBe(dividers[0].rect.x + MOSAIC_DIVIDER)
  })
})

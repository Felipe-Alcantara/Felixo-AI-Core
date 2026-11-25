import { describe, expect, it } from 'vitest'
import {
  drawerPaneShortcut,
  MAX_DRAWER_PANES,
  reduceDrawerPanes,
  type DrawerPanes,
  type DrawerPanesAction,
} from './terminal-drawer-panes'
import { layoutMosaic, mosaicPaneIds } from './terminal-mosaic'

function run(...actions: DrawerPanesAction[]): DrawerPanes | null {
  return actions.reduce<DrawerPanes | null>((state, action) => reduceDrawerPanes(state, action), null)
}

const open = (id: string, sideBySide = false): DrawerPanesAction => ({ type: 'open', id, sideBySide })
const AREA = { x: 0, y: 0, width: 1600, height: 900 }

describe('reduceDrawerPanes', () => {
  it('abre o primeiro agente como painel único em foco', () => {
    expect(run(open('a'))).toMatchObject({ panes: ['a'], focused: 'a', zoomed: false, tree: { kind: 'pane', id: 'a' } })
  })

  it('o clique comum troca o painel em foco, como a gaveta sempre fez', () => {
    expect(run(open('a'), open('b'))).toMatchObject({ panes: ['b'], focused: 'b' })
  })

  it('abrir ao lado acrescenta um painel e passa o foco', () => {
    const state = run(open('a'), open('b', true))
    expect(state).toMatchObject({ panes: ['a', 'b'], focused: 'b' })
  })

  it('o clique comum com 2 painéis troca só o que está em foco, no mesmo lugar do mosaico', () => {
    const state = run(open('a'), open('b', true), { type: 'focus', id: 'a' }, open('c'))
    expect(state).toMatchObject({ panes: ['c', 'b'], focused: 'c' })
  })

  it('abrir um agente que já está num painel só leva o foco até ele', () => {
    const state = run(open('a'), open('b', true), open('a', true))
    expect(state).toMatchObject({ panes: ['a', 'b'], focused: 'a' })
  })

  it('a lista de painéis é sempre a árvore do mosaico na ordem de leitura', () => {
    const state = run(open('a'), open('b', true), open('c', true), open('d', true))!
    expect(state.panes).toEqual(mosaicPaneIds(state.tree))
    expect([...state.panes].sort()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('o agente novo divide o painel pedido (beside), não necessariamente o que está em foco', () => {
    const base = run(open('a'), open('b', true), { type: 'focus', id: 'b' })!
    const state = reduceDrawerPanes(base, { type: 'open', id: 'c', sideBySide: true, beside: 'a', area: AREA })!
    const { panes } = layoutMosaic(state.tree, AREA)
    const a = panes.find((p) => p.id === 'a')!
    const c = panes.find((p) => p.id === 'c')!
    // a tinha 797×900 (alto): o c entra embaixo dele, na mesma coluna.
    expect(c.x).toBe(a.x)
    expect(c.y).toBeGreaterThan(a.y)
    expect(state.focused).toBe('c')
  })

  it(`no teto de ${MAX_DRAWER_PANES}, o pedido seguinte troca o painel sem foco usado há mais tempo`, () => {
    const ids = Array.from({ length: MAX_DRAWER_PANES }, (_, i) => `p${i}`)
    const cheio = run(open(ids[0]), ...ids.slice(1).map((id) => open(id, true)), { type: 'focus', id: 'p0' })!
    expect(cheio.panes).toHaveLength(MAX_DRAWER_PANES)

    const state = reduceDrawerPanes(cheio, open('novo', true))!
    expect(state.panes).toHaveLength(MAX_DRAWER_PANES)
    // p0 foi tocado por último; p1 é o mais antigo dos sem foco: o novo fica no lugar dele.
    expect(state.panes).not.toContain('p1')
    expect(state.panes).toContain('novo')
    expect(state.focused).toBe('novo')
    const antes = layoutMosaic(cheio.tree, AREA).panes.find((p) => p.id === 'p1')
    const depois = layoutMosaic(state.tree, AREA).panes.find((p) => p.id === 'novo')
    expect(depois).toMatchObject({ x: antes!.x, y: antes!.y, width: antes!.width, height: antes!.height })
  })

  it('fechar o painel em foco passa o foco ao usado mais recentemente', () => {
    const state = run(open('a'), open('b', true), open('c', true), { type: 'close-pane', id: 'c' })
    expect(state).toMatchObject({ panes: ['a', 'b'], focused: 'b' })
  })

  it('fechar um painel sem foco não mexe no foco e o espaço vai para o vizinho', () => {
    const state = run(open('a'), open('b', true), { type: 'close-pane', id: 'a' })
    expect(state).toMatchObject({ panes: ['b'], focused: 'b', tree: { kind: 'pane', id: 'b' } })
  })

  it('fechar o último painel fecha a gaveta', () => {
    expect(run(open('a'), { type: 'close-pane', id: 'a' })).toBeNull()
  })

  it('o zoom só existe com 2 ou mais painéis e some quando sobra um', () => {
    expect(run(open('a'), { type: 'toggle-zoom' })?.zoomed).toBe(false)
    const zoomed = run(open('a'), open('b', true), { type: 'toggle-zoom' })
    expect(zoomed?.zoomed).toBe(true)
    expect(reduceDrawerPanes(zoomed, { type: 'close-pane', id: 'a' })?.zoomed).toBe(false)
  })

  it('voltar do zoom devolve o mesmo arranjo', () => {
    const before = run(open('a'), open('b', true), open('c', true))
    const after = reduceDrawerPanes(reduceDrawerPanes(before, { type: 'toggle-zoom' }), { type: 'toggle-zoom' })
    expect(after).toEqual(before)
  })

  it('foco em id desconhecido e auto repetido não criam estado novo', () => {
    const state = run(open('a'), open('b', true))
    expect(reduceDrawerPanes(state, { type: 'focus', id: 'zzz' })).toBe(state)
    expect(reduceDrawerPanes(state, { type: 'set-layout', layout: 'auto' })).toBe(state)
  })

  it('um arranjo pronto refaz a árvore com os mesmos agentes e fica marcado', () => {
    const state = run(open('a'), open('b', true), open('c', true))!
    const grade = reduceDrawerPanes(state, { type: 'set-layout', layout: 'grade', area: AREA })!
    expect(grade.layout).toBe('grade')
    expect([...grade.panes].sort()).toEqual(['a', 'b', 'c'])
    const linhas = reduceDrawerPanes(grade, { type: 'set-layout', layout: 'linhas', area: AREA })!
    const rects = layoutMosaic(linhas.tree, AREA).panes
    expect(new Set(rects.map((r) => r.x))).toEqual(new Set([0]))
  })

  it('arrastar a divisória muda a proporção e mantém os agentes', () => {
    const state = run(open('a'), open('b', true))!
    const arrastado = reduceDrawerPanes(state, { type: 'resize', path: '', ratio: 0.3 })!
    expect(arrastado.tree).toMatchObject({ kind: 'split', ratio: 0.3 })
    expect(arrastado.panes).toEqual(state.panes)
    expect(arrastado.focused).toBe(state.focused)
  })

  it('trocar dois painéis de lugar troca também a ordem de leitura', () => {
    const state = run(open('a'), open('b', true))!
    const trocado = reduceDrawerPanes(state, { type: 'swap', a: 'a', b: 'b' })!
    expect(trocado.panes).toEqual(['b', 'a'])
    expect(reduceDrawerPanes(state, { type: 'swap', a: 'a', b: 'zzz' })).toBe(state)
  })
})

describe('drawerPaneShortcut', () => {
  const key = (k: string, mods: Partial<Record<'altKey' | 'shiftKey' | 'ctrlKey' | 'metaKey', boolean>> = {}) =>
    drawerPaneShortcut({ key: k, altKey: true, shiftKey: true, ctrlKey: false, metaKey: false, ...mods })

  it('Alt+Shift+setas movem o foco e Alt+Shift+Z dá zoom', () => {
    expect(key('ArrowLeft')).toEqual({ type: 'move', direction: 'left' })
    expect(key('ArrowDown')).toEqual({ type: 'move', direction: 'down' })
    expect(key('Z')).toEqual({ type: 'zoom' })
  })

  it('deixa passar o Alt+setas do Claude Code e as demais teclas', () => {
    expect(key('ArrowUp', { shiftKey: false })).toBeNull()
    expect(key('Z', { altKey: false })).toBeNull()
    expect(key('ArrowUp', { ctrlKey: true })).toBeNull()
    expect(key('a')).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import {
  drawerPaneShortcut,
  MAX_DRAWER_PANES,
  neighborPane,
  reduceDrawerPanes,
  resolveDrawerGeometry,
  type DrawerPanes,
  type DrawerPanesAction,
} from './terminal-drawer-panes'

function run(...actions: DrawerPanesAction[]): DrawerPanes | null {
  return actions.reduce<DrawerPanes | null>((state, action) => reduceDrawerPanes(state, action), null)
}

const open = (id: string, sideBySide = false): DrawerPanesAction => ({ type: 'open', id, sideBySide })

describe('reduceDrawerPanes', () => {
  it('abre o primeiro agente como painel único em foco', () => {
    expect(run(open('a'))).toMatchObject({ panes: ['a'], focused: 'a', zoomed: false })
  })

  it('o clique comum troca o painel em foco, como a gaveta sempre fez', () => {
    expect(run(open('a'), open('b'))).toMatchObject({ panes: ['b'], focused: 'b' })
  })

  it('abrir ao lado acrescenta um painel e passa o foco', () => {
    const state = run(open('a'), open('b', true))
    expect(state).toMatchObject({ panes: ['a', 'b'], focused: 'b' })
  })

  it('o clique comum com 2 painéis troca só o que está em foco', () => {
    const state = run(open('a'), open('b', true), { type: 'focus', id: 'a' }, open('c'))
    expect(state).toMatchObject({ panes: ['c', 'b'], focused: 'c' })
  })

  it('abrir um agente que já está num painel só leva o foco até ele', () => {
    const state = run(open('a'), open('b', true), open('a', true))
    expect(state).toMatchObject({ panes: ['a', 'b'], focused: 'a' })
  })

  it('no teto de 4, o 5º pedido troca o painel sem foco usado há mais tempo', () => {
    const state = run(
      open('a'),
      open('b', true),
      open('c', true),
      open('d', true),
      { type: 'focus', id: 'a' },
      open('e', true),
    )
    expect(state?.panes).toHaveLength(MAX_DRAWER_PANES)
    // a foi tocado por último; b é o mais antigo dos sem foco.
    expect(state?.panes).toEqual(['a', 'e', 'c', 'd'])
    expect(state?.focused).toBe('e')
  })

  it('fechar o painel em foco passa o foco ao usado mais recentemente', () => {
    const state = run(open('a'), open('b', true), open('c', true), { type: 'close-pane', id: 'c' })
    expect(state).toMatchObject({ panes: ['a', 'b'], focused: 'b' })
  })

  it('fechar um painel sem foco não mexe no foco', () => {
    const state = run(open('a'), open('b', true), { type: 'close-pane', id: 'a' })
    expect(state).toMatchObject({ panes: ['b'], focused: 'b' })
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
    const after = reduceDrawerPanes(
      reduceDrawerPanes(before, { type: 'toggle-zoom' }),
      { type: 'toggle-zoom' },
    )
    expect(after).toEqual(before)
  })

  it('foco em id desconhecido e layout repetido não criam estado novo', () => {
    const state = run(open('a'), open('b', true))
    expect(reduceDrawerPanes(state, { type: 'focus', id: 'zzz' })).toBe(state)
    expect(reduceDrawerPanes(state, { type: 'set-layout', layout: 'auto' })).toBe(state)
  })
})

describe('resolveDrawerGeometry', () => {
  const base = { layout: 'auto', zoomed: false } as const

  it('painel único e zoom ocupam a gaveta inteira', () => {
    expect(resolveDrawerGeometry({ ...base, count: 1 }, 1800)).toEqual({ cols: 1, rows: 1, stacked: false })
    expect(resolveDrawerGeometry({ ...base, count: 4, zoomed: true }, 1800)).toEqual({ cols: 1, rows: 1, stacked: false })
  })

  it('maximizada em 1920, 2 agentes ficam lado a lado e 4 viram 2x2', () => {
    expect(resolveDrawerGeometry({ ...base, count: 2 }, 1800)).toEqual({ cols: 2, rows: 1, stacked: false })
    expect(resolveDrawerGeometry({ ...base, count: 4 }, 1800)).toEqual({ cols: 2, rows: 2, stacked: false })
    expect(resolveDrawerGeometry({ ...base, count: 3 }, 1800)).toEqual({ cols: 2, rows: 2, stacked: false })
  })

  it('divisão horizontal empilha, qualquer que seja a largura', () => {
    expect(resolveDrawerGeometry({ layout: 'linhas', zoomed: false, count: 3 }, 1800)).toEqual({ cols: 1, rows: 3, stacked: false })
  })

  it('abaixo de 440 px por painel (janela 1008x655, gaveta de 453), empilha', () => {
    expect(resolveDrawerGeometry({ ...base, count: 2 }, 453)).toEqual({ cols: 1, rows: 2, stacked: true })
    expect(resolveDrawerGeometry({ ...base, count: 4 }, 720)).toEqual({ cols: 1, rows: 4, stacked: true })
    expect(resolveDrawerGeometry({ layout: 'colunas', zoomed: false, count: 3 }, 1200)).toEqual({ cols: 1, rows: 3, stacked: true })
  })

  it('exatamente 440 px por painel ainda cabe', () => {
    expect(resolveDrawerGeometry({ ...base, count: 2 }, 880)).toEqual({ cols: 2, rows: 1, stacked: false })
  })
})

describe('neighborPane', () => {
  const four = ['a', 'b', 'c', 'd']

  it('navega a grade 2x2 nas quatro direções', () => {
    expect(neighborPane(four, 2, 'a', 'right')).toBe('b')
    expect(neighborPane(four, 2, 'a', 'down')).toBe('c')
    expect(neighborPane(four, 2, 'd', 'left')).toBe('c')
    expect(neighborPane(four, 2, 'd', 'up')).toBe('b')
  })

  it('não dá a volta nas bordas', () => {
    expect(neighborPane(four, 2, 'a', 'left')).toBe('a')
    expect(neighborPane(four, 2, 'a', 'up')).toBe('a')
    expect(neighborPane(four, 2, 'd', 'right')).toBe('d')
    expect(neighborPane(four, 2, 'd', 'down')).toBe('d')
  })

  it('na grade com 3, o último cobre a linha de baixo inteira', () => {
    const three = ['a', 'b', 'c']
    expect(neighborPane(three, 2, 'b', 'down')).toBe('c')
    expect(neighborPane(three, 2, 'c', 'up')).toBe('a')
    expect(neighborPane(three, 2, 'c', 'right')).toBe('c')
  })

  it('empilhados (uma coluna), cima e baixo andam pela lista', () => {
    expect(neighborPane(['a', 'b'], 1, 'a', 'down')).toBe('b')
    expect(neighborPane(['a', 'b'], 1, 'b', 'up')).toBe('a')
    expect(neighborPane(['a', 'b'], 1, 'a', 'right')).toBe('a')
  })

  it('em colunas (uma linha), esquerda e direita andam pela lista', () => {
    expect(neighborPane(['a', 'b', 'c'], 3, 'b', 'right')).toBe('c')
    expect(neighborPane(['a', 'b', 'c'], 3, 'b', 'left')).toBe('a')
    expect(neighborPane(['a', 'b', 'c'], 3, 'b', 'down')).toBe('b')
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

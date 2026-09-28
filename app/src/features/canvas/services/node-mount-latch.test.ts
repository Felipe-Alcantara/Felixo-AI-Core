import { describe, expect, it } from 'vitest'
import {
  INITIAL_NODE_MOUNT_LATCH,
  rectsIntersect,
  reduceNodeMountLatch,
  shouldKeepCanvasNodesMounted,
  type NodeMountLatchEvent,
  type NodeMountLatchState,
} from './node-mount-latch'

function run(events: NodeMountLatchEvent[], start: NodeMountLatchState = INITIAL_NODE_MOUNT_LATCH) {
  return events.reduce(reduceNodeMountLatch, start)
}

describe('trava de blocos montados em volta da gaveta do terminal', () => {
  it('começa com a virtualização ligada', () => {
    expect(shouldKeepCanvasNodesMounted(INITIAL_NODE_MOUNT_LATCH)).toBe(false)
  })

  it('mantém tudo montado com a gaveta aberta', () => {
    expect(shouldKeepCanvasNodesMounted(run([{ type: 'drawer-opened' }]))).toBe(true)
  })

  it('logo depois de fechar ainda segura: o layout novo precisa assentar antes de religar', () => {
    // Soltar no mesmo lote do fechamento fazia o React Flow medir os visíveis
    // com a largura antiga e desmontar/remontar os cartões da faixa da gaveta.
    const fechando = run([{ type: 'drawer-opened' }, { type: 'drawer-closed', generation: 1 }])
    expect(shouldKeepCanvasNodesMounted(fechando)).toBe(true)
  })

  it('assentado sem foco para devolver, religa a virtualização — a trava não é mais permanente', () => {
    const state = run([
      { type: 'drawer-opened' },
      { type: 'drawer-closed', generation: 1 },
      { type: 'settled', generation: 1 },
    ])
    expect(shouldKeepCanvasNodesMounted(state)).toBe(false)
  })

  it('segura enquanto o foco devolvido está num bloco fora da área visível e solta quando sai', () => {
    const noGatilho = run([
      { type: 'drawer-opened' },
      { type: 'drawer-closed', generation: 1 },
      { type: 'focus-restored-to-node', generation: 1 },
    ])
    expect(shouldKeepCanvasNodesMounted(noGatilho)).toBe(true)

    const saiu = reduceNodeMountLatch(noGatilho, { type: 'restored-focus-left', generation: 1 })
    expect(shouldKeepCanvasNodesMounted(saiu)).toBe(false)
  })

  it('evento atrasado de um fechamento antigo não solta a trava de um fechamento novo', () => {
    const state = run([
      { type: 'drawer-opened' },
      { type: 'drawer-closed', generation: 1 },
      { type: 'focus-restored-to-node', generation: 1 },
      { type: 'drawer-opened' },
      { type: 'drawer-closed', generation: 2 },
      { type: 'focus-restored-to-node', generation: 2 },
      // O ouvinte de foco do primeiro fechamento dispara depois.
      { type: 'restored-focus-left', generation: 1 },
      { type: 'settled', generation: 1 },
    ])
    expect(shouldKeepCanvasNodesMounted(state)).toBe(true)
    expect(shouldKeepCanvasNodesMounted(
      reduceNodeMountLatch(state, { type: 'restored-focus-left', generation: 2 }),
    )).toBe(false)
  })

  it('reabrir a gaveta enquanto o fechamento assentava volta a segurar, e eventos velhos não soltam', () => {
    const state = run([
      { type: 'drawer-opened' },
      { type: 'drawer-closed', generation: 1 },
      { type: 'drawer-opened' },
      { type: 'settled', generation: 1 },
    ])
    expect(state.drawerOpen).toBe(true)
    expect(shouldKeepCanvasNodesMounted(state)).toBe(true)
  })
})

describe('rectsIntersect', () => {
  const container = { left: 0, top: 0, right: 1000, bottom: 700 }

  it('bloco dentro ou cruzando a borda do container conta como visível', () => {
    expect(rectsIntersect({ left: 100, top: 100, right: 300, bottom: 200 }, container)).toBe(true)
    expect(rectsIntersect({ left: 950, top: 650, right: 1200, bottom: 900 }, container)).toBe(true)
  })

  it('bloco fora do container, ou só encostando na borda, não conta', () => {
    expect(rectsIntersect({ left: 1200, top: 100, right: 1400, bottom: 200 }, container)).toBe(false)
    expect(rectsIntersect({ left: -400, top: -300, right: -10, bottom: -5 }, container)).toBe(false)
    expect(rectsIntersect({ left: 1000, top: 0, right: 1100, bottom: 100 }, container)).toBe(false)
  })
})

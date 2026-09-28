import { describe, expect, it } from 'vitest'
import {
  INITIAL_NODE_MOUNT_LATCH,
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

  it('fechar sem foco dentro da gaveta religa a virtualização na hora — a trava não é mais permanente', () => {
    const state = run([
      { type: 'drawer-opened' },
      { type: 'drawer-closed', generation: 1, restoringFocus: false },
    ])
    expect(shouldKeepCanvasNodesMounted(state)).toBe(false)
  })

  it('segura enquanto devolve o foco e enquanto o foco devolvido está no gatilho do cartão', () => {
    const fechando = run([
      { type: 'drawer-opened' },
      { type: 'drawer-closed', generation: 1, restoringFocus: true },
    ])
    expect(shouldKeepCanvasNodesMounted(fechando)).toBe(true)

    const noGatilho = reduceNodeMountLatch(fechando, { type: 'focus-restored-to-node', generation: 1 })
    expect(shouldKeepCanvasNodesMounted(noGatilho)).toBe(true)

    const saiu = reduceNodeMountLatch(noGatilho, { type: 'restored-focus-left', generation: 1 })
    expect(shouldKeepCanvasNodesMounted(saiu)).toBe(false)
  })

  it('foco devolvido para fora de um bloco (ou fallback do canvas) solta a trava', () => {
    const state = run([
      { type: 'drawer-opened' },
      { type: 'drawer-closed', generation: 1, restoringFocus: true },
      { type: 'focus-restore-done', generation: 1 },
    ])
    expect(shouldKeepCanvasNodesMounted(state)).toBe(false)
  })

  it('evento atrasado de um fechamento antigo não solta a trava de um fechamento novo', () => {
    const state = run([
      { type: 'drawer-opened' },
      { type: 'drawer-closed', generation: 1, restoringFocus: true },
      { type: 'focus-restored-to-node', generation: 1 },
      { type: 'drawer-opened' },
      { type: 'drawer-closed', generation: 2, restoringFocus: true },
      { type: 'focus-restored-to-node', generation: 2 },
      // O ouvinte de foco do primeiro fechamento dispara depois.
      { type: 'restored-focus-left', generation: 1 },
    ])
    expect(shouldKeepCanvasNodesMounted(state)).toBe(true)
    expect(shouldKeepCanvasNodesMounted(
      reduceNodeMountLatch(state, { type: 'restored-focus-left', generation: 2 }),
    )).toBe(false)
  })

  it('reabrir a gaveta enquanto o foco era devolvido volta a segurar, e eventos velhos não soltam', () => {
    const state = run([
      { type: 'drawer-opened' },
      { type: 'drawer-closed', generation: 1, restoringFocus: true },
      { type: 'drawer-opened' },
      { type: 'focus-restore-done', generation: 1 },
    ])
    expect(state.drawerOpen).toBe(true)
    expect(shouldKeepCanvasNodesMounted(state)).toBe(true)
  })
})

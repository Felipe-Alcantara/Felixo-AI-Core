import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deleteCanvasEdge,
  deleteCanvasNode,
  loadCanvasEdges,
  loadCanvasNodes,
  saveCanvasEdge,
  saveCanvasNode,
} from './canvas-storage'
import {
  getPersistenceFailures,
  resetPersistenceFailuresForTests,
} from './canvas-persistence-status'
import type { PersistedCanvasNode } from '../types'

const node = {
  id: 'n1',
  type: 'note',
  parentId: null,
  position: { x: 0, y: 0 },
  width: null,
  height: null,
  data: {},
} as PersistedCanvasNode

function stubCanvas(canvas: Record<string, unknown>) {
  vi.stubGlobal('window', { felixo: { canvas } })
}

describe('canvas-storage: falhas de gravação e leitura aparecem', () => {
  beforeEach(() => {
    resetPersistenceFailuresForTests()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('canvas:list com ok:false é falha, não canvas vazio', async () => {
    stubCanvas({ list: vi.fn().mockResolvedValue({ ok: false, message: 'banco travado' }) })
    expect(await loadCanvasNodes()).toEqual({ nodes: [], failed: true })
    expect(getPersistenceFailures()).toEqual(['banco travado'])
  })

  it('canvas:list que lança também é falha; lista vazia de verdade não é', async () => {
    stubCanvas({ list: vi.fn().mockRejectedValue(new Error('IPC caiu')) })
    expect((await loadCanvasNodes()).failed).toBe(true)

    resetPersistenceFailuresForTests()
    stubCanvas({ list: vi.fn().mockResolvedValue({ ok: true, nodes: [] }) })
    expect(await loadCanvasNodes()).toEqual({ nodes: [], failed: false })
    expect(getPersistenceFailures()).toEqual([])
  })

  it('save/delete de bloco e de conexão com ok:false ficam registrados até dar certo', async () => {
    const failing = { ok: false, message: 'disco cheio' }
    const save = vi.fn().mockResolvedValue(failing)
    stubCanvas({
      save,
      delete: vi.fn().mockResolvedValue(failing),
      saveEdge: vi.fn().mockResolvedValue(failing),
      deleteEdge: vi.fn().mockResolvedValue(failing),
    })
    await saveCanvasNode(node)
    await deleteCanvasNode('n2')
    await saveCanvasEdge({ id: 'e1', source: 'a', target: 'b' })
    await deleteCanvasEdge('e2')
    // Quatro chaves, mas a mensagem de cada tipo é distinta.
    expect(getPersistenceFailures()).toHaveLength(4)

    save.mockResolvedValue({ ok: true })
    await saveCanvasNode(node)
    expect(getPersistenceFailures()).toHaveLength(3)
  })

  it('leitura de conexões com falha é registrada', async () => {
    stubCanvas({ listEdges: vi.fn().mockResolvedValue({ ok: false, message: 'sem acesso' }) })
    expect(await loadCanvasEdges()).toEqual([])
    expect(getPersistenceFailures()).toEqual(['sem acesso'])
  })
})

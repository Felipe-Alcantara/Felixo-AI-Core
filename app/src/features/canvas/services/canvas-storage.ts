import type { Edge } from '@xyflow/react'
import type {
  CanvasTransferBundle,
  PersistedCanvasEdge,
  PersistedCanvasNode,
} from '../types'

/**
 * Thin wrapper over the `window.felixo.canvas` bridge. Each call degrades
 * gracefully when the bridge is unavailable (e.g. web preview), so the canvas
 * still works in-memory without a backend.
 */

export async function loadCanvasNodes(): Promise<PersistedCanvasNode[]> {
  const bridge = window.felixo?.canvas

  if (!bridge) {
    return []
  }

  try {
    const result = await bridge.list()
    return result.ok && Array.isArray(result.nodes)
      ? (result.nodes as PersistedCanvasNode[])
      : []
  } catch {
    return []
  }
}

export async function saveCanvasNode(node: PersistedCanvasNode): Promise<void> {
  const bridge = window.felixo?.canvas

  if (!bridge) {
    return
  }

  try {
    await bridge.save(node)
  } catch {
    // Persistence is best-effort; the in-memory canvas remains usable.
  }
}

export async function deleteCanvasNode(nodeId: string): Promise<void> {
  const bridge = window.felixo?.canvas

  if (!bridge) {
    return
  }

  try {
    await bridge.delete(nodeId)
  } catch {
    // Best effort.
  }
}

export async function clearCanvas(): Promise<{ ok: boolean; message?: string }> {
  const bridge = window.felixo?.canvas

  if (!bridge) {
    return { ok: true }
  }

  try {
    const result = await bridge.clear()
    return result.ok
      ? { ok: true }
      : { ok: false, message: result.message ?? 'Nao foi possivel limpar o canvas.' }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Nao foi possivel limpar o canvas.',
    }
  }
}

type TransferResult = {
  ok: boolean
  message?: string
  bundle?: CanvasTransferBundle
  nodes?: PersistedCanvasNode[]
  edges?: PersistedCanvasEdge[]
}

export async function exportCanvasBundle(
  nodes: PersistedCanvasNode[],
  edges: PersistedCanvasEdge[],
): Promise<TransferResult> {
  const bridge = window.felixo?.canvas
  if (!bridge) {
    return { ok: false, message: 'Exportação disponível apenas no aplicativo.' }
  }

  try {
    const result = await bridge.exportBundle({ nodes, edges })
    if (!result.ok || !result.bundle) {
      return { ok: false, message: result.message ?? 'Não foi possível exportar.' }
    }
    return { ok: true, bundle: result.bundle as CanvasTransferBundle }
  } catch (error) {
    return { ok: false, message: toTransferError(error, 'Não foi possível exportar.') }
  }
}

export async function importCanvasBundle(content: string): Promise<TransferResult> {
  const bridge = window.felixo?.canvas
  if (!bridge) {
    return { ok: false, message: 'Importação disponível apenas no aplicativo.' }
  }

  try {
    const result = await bridge.importBundle(content)
    if (!result.ok || !Array.isArray(result.nodes) || !Array.isArray(result.edges)) {
      return { ok: false, message: result.message ?? 'Não foi possível importar.' }
    }
    return { ok: true, nodes: result.nodes, edges: result.edges }
  } catch (error) {
    return { ok: false, message: toTransferError(error, 'Não foi possível importar.') }
  }
}

export async function validateCanvasBundle(content: string): Promise<TransferResult> {
  const bridge = window.felixo?.canvas
  if (!bridge) {
    return { ok: false, message: 'Importação disponível apenas no aplicativo.' }
  }

  try {
    const result = await bridge.validateImport(content)
    return result.ok
      ? { ok: true }
      : { ok: false, message: result.message ?? 'Arquivo .fxcanvas inválido.' }
  } catch (error) {
    return { ok: false, message: toTransferError(error, 'Arquivo .fxcanvas inválido.') }
  }
}

function toTransferError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export async function loadCanvasEdges(): Promise<Edge[]> {
  const bridge = window.felixo?.canvas

  if (!bridge) {
    return []
  }

  try {
    const result = await bridge.listEdges()
    return result.ok && Array.isArray(result.edges)
      ? result.edges.map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
        }))
      : []
  } catch {
    return []
  }
}

export async function saveCanvasEdge(edge: Edge): Promise<void> {
  const bridge = window.felixo?.canvas

  if (!bridge) {
    return
  }

  try {
    await bridge.saveEdge({ id: edge.id, source: edge.source, target: edge.target })
  } catch {
    // Best effort.
  }
}

export async function deleteCanvasEdge(edgeId: string): Promise<void> {
  const bridge = window.felixo?.canvas

  if (!bridge) {
    return
  }

  try {
    await bridge.deleteEdge(edgeId)
  } catch {
    // Best effort.
  }
}

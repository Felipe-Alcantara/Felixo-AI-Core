import type { Edge } from '@xyflow/react'
import type { PersistedCanvasNode } from '../types'

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

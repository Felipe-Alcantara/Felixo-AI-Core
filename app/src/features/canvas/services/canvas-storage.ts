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

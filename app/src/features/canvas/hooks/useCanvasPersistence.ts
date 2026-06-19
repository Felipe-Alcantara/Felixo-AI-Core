import { useCallback, useEffect, useRef, useState } from 'react'
import type { Node } from '@xyflow/react'
import {
  deleteCanvasNode,
  loadCanvasNodes,
  saveCanvasNode,
} from '../services/canvas-storage'
import type { CanvasNodeData, CanvasNodeType, PersistedCanvasNode } from '../types'

const SAVE_DEBOUNCE_MS = 400

/**
 * Loads persisted canvas nodes once into local state and persists changes
 * (position/size/data) with a short debounce, so dragging a node doesn't write
 * on every frame. Owns the nodes state so the view never needs to sync the
 * loaded data through an effect.
 */
export function useCanvasPersistence() {
  const [nodes, setNodes] = useState<Node[]>([])
  const [hydrated, setHydrated] = useState(false)
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    let cancelled = false
    const timers = saveTimers.current

    void loadCanvasNodes().then((persisted) => {
      if (cancelled) {
        return
      }

      setNodes(persisted.map(toFlowNode))
      setHydrated(true)
    })

    return () => {
      cancelled = true
      timers.forEach((timer) => clearTimeout(timer))
      timers.clear()
    }
  }, [])

  const persistNode = useCallback((node: Node) => {
    const timers = saveTimers.current
    const existing = timers.get(node.id)

    if (existing) {
      clearTimeout(existing)
    }

    timers.set(
      node.id,
      setTimeout(() => {
        timers.delete(node.id)
        void saveCanvasNode(toPersistedNode(node))
      }, SAVE_DEBOUNCE_MS),
    )
  }, [])

  const removeNode = useCallback((nodeId: string) => {
    const timer = saveTimers.current.get(nodeId)

    if (timer) {
      clearTimeout(timer)
      saveTimers.current.delete(nodeId)
    }

    void deleteCanvasNode(nodeId)
  }, [])

  return { nodes, setNodes, hydrated, persistNode, removeNode }
}

function toFlowNode(node: PersistedCanvasNode): Node {
  return {
    id: node.id,
    type: node.type,
    position: node.position,
    data: node.data,
    // Restore group membership; children are clamped to the group bounds.
    ...(node.parentId
      ? { parentId: node.parentId, extent: 'parent' as const }
      : {}),
    ...(node.width && node.height
      ? { width: node.width, height: node.height }
      : {}),
  }
}

function toPersistedNode(node: Node): PersistedCanvasNode {
  return {
    id: node.id,
    type: (node.type ?? 'note') as CanvasNodeType,
    parentId: node.parentId ?? null,
    position: node.position,
    width: node.width ?? null,
    height: node.height ?? null,
    data: stripFunctions(node.data as Record<string, unknown>),
  }
}

/** Persisted data must be plain JSON; drop injected callbacks like onTextChange. */
function stripFunctions(data: Record<string, unknown>): CanvasNodeData {
  const clean: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(data ?? {})) {
    if (typeof value !== 'function') {
      clean[key] = value
    }
  }

  return clean as CanvasNodeData
}

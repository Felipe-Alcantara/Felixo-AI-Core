import { useCallback, useEffect, useRef, useState } from 'react'
import type { Node } from '@xyflow/react'
import {
  deleteCanvasNode,
  loadCanvasNodes,
  saveCanvasNode,
} from '../services/canvas-storage'
import type { CanvasNodeData, CanvasNodeType, PersistedCanvasNode } from '../types'

/** A React Flow node whose `data` is typed as the canvas' own node data. */
export type CanvasFlowNode = Node<CanvasNodeData>

const SAVE_DEBOUNCE_MS = 400

/**
 * Loads persisted canvas nodes once into local state and persists changes
 * (position/size/data) with a short debounce, so dragging a node doesn't write
 * on every frame. Owns the nodes state so the view never needs to sync the
 * loaded data through an effect.
 */
export function useCanvasPersistence() {
  const [nodes, setNodes] = useState<CanvasFlowNode[]>([])
  const [hydrated, setHydrated] = useState(false)
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    let cancelled = false
    const timers = saveTimers.current

    void loadCanvasNodes().then((persisted) => {
      if (cancelled) {
        return
      }

      // A ordem carregada vira índice explícito antes de qualquer outra coisa.
      // Sem isso, um canvas que nunca foi reordenado volta na ordem de
      // `updated_at`: arrastar um bloco reescreve a linha dele, e no próximo
      // início ele aparece no fim do dock — com outro `#N` e, agora, em outra
      // célula do Organizar. O primeiro carregamento congela a ordem que
      // existe; a partir daí ela é identidade, não efeito colateral de salvar.
      const sorted = sortByOrderIndex(persisted)
      const loaded = withOrderIndex(sorted)
      loaded.forEach((node, index) => {
        if (sorted[index] !== node) {
          void saveCanvasNode(node)
        }
      })
      setNodes(loaded.map(toFlowNode))
      setHydrated(true)
    })

    return () => {
      cancelled = true
      timers.forEach((timer) => clearTimeout(timer))
      timers.clear()
    }
  }, [])

  const persistNode = useCallback((node: CanvasFlowNode) => {
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

  const cancelPendingSaves = useCallback(() => {
    saveTimers.current.forEach((timer) => clearTimeout(timer))
    saveTimers.current.clear()
  }, [])

  return {
    nodes,
    setNodes,
    hydrated,
    persistNode,
    removeNode,
    cancelPendingSaves,
  }
}

/**
 * Restores the user's dock ordering (see `OrderedNodeData`). The backend lists
 * nodes by `updated_at`, so persisted order drifts every time a node is saved
 * — the stored `data.orderIndex` is the only stable source of truth. Nodes
 * without one (created before the feature, or never reordered) keep their
 * relative load order and sit after the explicitly ordered ones.
 */
export function sortByOrderIndex(
  nodes: readonly PersistedCanvasNode[],
): PersistedCanvasNode[] {
  return nodes
    .map((node, loadedAt) => ({ node, loadedAt }))
    .sort((left, right) => {
      const leftOrder = left.node.data?.orderIndex
      const rightOrder = right.node.data?.orderIndex
      const leftHas = typeof leftOrder === 'number'
      const rightHas = typeof rightOrder === 'number'

      if (leftHas && rightHas && leftOrder !== rightOrder) {
        return leftOrder - rightOrder
      }
      if (leftHas !== rightHas) {
        return leftHas ? -1 : 1
      }
      return left.loadedAt - right.loadedAt
    })
    .map((entry) => entry.node)
}

/**
 * Carimba em cada bloco o índice que ele ocupa na lista, quando ele ainda não
 * tem esse índice ou tem outro. Devolve o mesmo objeto para quem já está certo,
 * para que quem chama consiga distinguir o que precisa ser gravado.
 */
export function withOrderIndex(
  nodes: readonly PersistedCanvasNode[],
): PersistedCanvasNode[] {
  return nodes.map((node, index) =>
    node.data?.orderIndex === index
      ? node
      : { ...node, data: { ...node.data, orderIndex: index } },
  )
}

export function toFlowNode(node: PersistedCanvasNode): CanvasFlowNode {
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

export function toPersistedNode(node: CanvasFlowNode): PersistedCanvasNode {
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
/** Data keys that are transient (computed at creation/render), never persisted. */
const TRANSIENT_DATA_KEYS = new Set<string>([
  'initialTextReady',
  'handoffText',
  'resumeAgentSession',
])

function stripFunctions(data: Record<string, unknown>): CanvasNodeData {
  const clean: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(data ?? {})) {
    if (typeof value !== 'function' && !TRANSIENT_DATA_KEYS.has(key)) {
      clean[key] = value
    }
  }

  return clean as CanvasNodeData
}

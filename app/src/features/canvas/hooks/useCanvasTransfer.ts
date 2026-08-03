import { useCallback, useState, type ChangeEvent } from 'react'
import type { Edge, Node } from '@xyflow/react'
import { toFlowNode, toPersistedNode } from './useCanvasPersistence'
import {
  clearCanvas,
  exportCanvasBundle,
  importCanvasBundle,
  validateCanvasBundle,
} from '../services/canvas-storage'
import type { PersistedCanvasEdge } from '../types'

function toPersistedEdge(edge: Edge): PersistedCanvasEdge {
  return { id: edge.id, source: edge.source, target: edge.target }
}

function toFlowEdge(edge: PersistedCanvasEdge): Edge {
  return { id: edge.id, source: edge.source, target: edge.target }
}

type TerminalSessionsStore = { clear: () => void }

type UseCanvasTransferOptions = {
  nodes: Node[]
  edges: Edge[]
  store: TerminalSessionsStore
  cancelPendingSaves: () => void
  persistNode: (node: Node) => void
  setNodes: (updater: (current: Node[]) => Node[]) => void
  setEdges: (updater: (current: Edge[]) => Edge[]) => void
  onReset: () => void
}

/**
 * Owns the "whole canvas" bulk operations — clear, export (.fxcanvas) and
 * import — plus the busy flags that gate them. Extracted from CanvasView so
 * the view itself only wires callbacks to the toolbar, instead of also
 * containing the file dialogs / confirm prompts / bundle (de)serialization.
 */
export function useCanvasTransfer({
  nodes,
  edges,
  store,
  cancelPendingSaves,
  persistNode,
  setNodes,
  setEdges,
  onReset,
}: UseCanvasTransferOptions) {
  const [isClearing, setIsClearing] = useState(false)
  const [isTransferring, setIsTransferring] = useState(false)
  const [canvasRevision, setCanvasRevision] = useState(0)

  const clearAll = useCallback(async () => {
    const confirmed = window.confirm(
      'Limpar todo o canvas? Todos os blocos, conexões e arquivos .md do canvas serão excluídos permanentemente.',
    )
    if (!confirmed) {
      return
    }

    setIsClearing(true)
    cancelPendingSaves()
    const result = await clearCanvas()
    setIsClearing(false)

    if (!result.ok) {
      window.alert(result.message ?? 'Não foi possível limpar o canvas.')
      return
    }

    store.clear()
    onReset()
    setNodes(() => [])
    setEdges(() => [])
  }, [cancelPendingSaves, onReset, setEdges, setNodes, store])

  const exportAll = useCallback(async () => {
    setIsTransferring(true)
    const result = await exportCanvasBundle(
      nodes.map(toPersistedNode),
      edges.map(toPersistedEdge),
    )

    if (!result.ok || !result.bundle) {
      setIsTransferring(false)
      window.alert(result.message ?? 'Não foi possível exportar o canvas.')
      return
    }

    let saveResult
    try {
      saveResult = await window.felixo?.files?.saveTextFile({
        defaultPath: `felixo-canvas-${new Date().toISOString().slice(0, 10)}.fxcanvas`,
        content: JSON.stringify(result.bundle, null, 2),
        filters: [{ name: 'Canvas do Felixo', extensions: ['fxcanvas'] }],
      })
    } catch (error) {
      setIsTransferring(false)
      window.alert(error instanceof Error ? error.message : 'Não foi possível exportar.')
      return
    }
    setIsTransferring(false)

    if (saveResult && !saveResult.ok && !saveResult.canceled) {
      window.alert(saveResult.message ?? 'Não foi possível salvar o canvas exportado.')
    }
  }, [edges, nodes])

  const importFile = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (!file) {
        return
      }
      if (file.size > 60 * 1024 * 1024) {
        window.alert('O arquivo .fxcanvas excede o limite de 60 MB.')
        return
      }
      setIsTransferring(true)
      let content: string
      try {
        content = await file.text()
      } catch {
        setIsTransferring(false)
        window.alert('Não foi possível ler o arquivo selecionado.')
        return
      }

      const validation = await validateCanvasBundle(content)
      setIsTransferring(false)
      if (!validation.ok) {
        window.alert(validation.message ?? 'Arquivo .fxcanvas inválido.')
        return
      }
      if (
        !window.confirm(
          'Importar este canvas? O canvas atual e seus arquivos .md serão substituídos permanentemente.',
        )
      ) {
        return
      }

      setIsTransferring(true)
      cancelPendingSaves()
      const result = await importCanvasBundle(content)
      setIsTransferring(false)
      if (!result.ok || !result.nodes || !result.edges) {
        nodes.forEach(persistNode)
        window.alert(result.message ?? 'Não foi possível importar o canvas.')
        return
      }

      store.clear()
      onReset()
      setNodes(() => result.nodes!.map(toFlowNode))
      setEdges(() => result.edges!.map(toFlowEdge))
      setCanvasRevision((revision) => revision + 1)
    },
    [cancelPendingSaves, nodes, onReset, persistNode, setEdges, setNodes, store],
  )

  return {
    isClearing,
    isTransferring,
    isBusy: isClearing || isTransferring,
    canvasRevision,
    clearAll,
    exportAll,
    importFile,
  }
}

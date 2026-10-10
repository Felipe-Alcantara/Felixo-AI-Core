import { useCallback, type Dispatch, type RefObject, type SetStateAction } from 'react'
import type { Edge } from '@xyflow/react'
import { deleteCanvasEdge } from '../services/canvas-storage'
import type { CanvasImageArtifact } from '../types'
import type { CanvasFlowNode } from './useCanvasPersistence'

type ImageNodeActionsOptions = {
  /** Cria o bloco da imagem duplicada; ref porque a função nasce depois no CanvasView. */
  addImageNodeRef: RefObject<
    (artifact: CanvasImageArtifact, position?: { x: number; y: number }) => string
  >
  edgesRef: RefObject<Edge[]>
  nodesRef: RefObject<CanvasFlowNode[]>
  removeNode: (nodeId: string) => void
  setEdges: Dispatch<SetStateAction<Edge[]>>
  setNodes: Dispatch<SetStateAction<CanvasFlowNode[]>>
  updateNodeData: (nodeId: string, patch: Record<string, unknown>) => void
}

/**
 * Ações do bloco de imagem: duplicar o arquivo num bloco ao lado, apontar para
 * outro arquivo quando o original sumiu e apagar uma imagem gerada temporária.
 */
export function useImageNodeActions({
  addImageNodeRef,
  edgesRef,
  nodesRef,
  removeNode,
  setEdges,
  setNodes,
  updateNodeData,
}: ImageNodeActionsOptions) {
  const duplicateImageNode = useCallback(
    async (nodeId: string): Promise<boolean> => {
      const node = nodesRef.current.find((item) => item.id === nodeId)
      const data = node?.data as {
        filePath?: string
        fileLabel?: string
        image?: CanvasImageArtifact
      } | undefined
      const duplicate = window.felixo?.files?.duplicateImage
      if (!node || node.type !== 'file' || !data?.filePath || !duplicate) {
        return false
      }

      const result = await duplicate({
        path: data.filePath,
        name: data.fileLabel,
        prompt: data.image?.prompt,
        model: data.image?.model,
        createdAt: data.image?.createdAt,
        cost: data.image?.cost,
        requestId: data.image?.requestId,
        temporary: data.image?.temporary,
      }).catch(() => null)
      const artifact = result?.artifact ?? result
      if (!result?.ok || !artifact?.path || !artifact?.name || !artifact?.mimeType) {
        return false
      }

      addImageNodeRef.current(artifact as CanvasImageArtifact, {
        x: node.position.x + (node.width ?? 320) + 32,
        y: node.position.y,
      })
      return true
    },
    [addImageNodeRef, nodesRef],
  )

  const repairImageNode = useCallback(
    async (nodeId: string): Promise<boolean> => {
      const pickImage = window.felixo?.files?.pickImage
      if (!pickImage) return false
      const result = await pickImage().catch(() => null)
      const mimeType = result?.type ?? result?.mimeType
      if (!result?.ok || result.canceled || !result.path || !result.name || !mimeType) {
        return false
      }

      updateNodeData(nodeId, {
        filePath: result.path,
        fileLabel: result.name,
        fileKind: 'image',
        image: {
          kind: 'local-image',
          mimeType,
          temporary: false,
        },
      })
      return true
    },
    [updateNodeData],
  )

  const removeTemporaryImageNode = useCallback(
    async (nodeId: string): Promise<boolean> => {
      const node = nodesRef.current.find((item) => item.id === nodeId)
      const data = node?.data as { filePath?: string; image?: { temporary?: boolean } } | undefined
      const removeImage = window.felixo?.files?.removeGeneratedImage
      if (!node || node.type !== 'file' || !data?.filePath || data.image?.temporary !== true || !removeImage) {
        return false
      }

      const result = await removeImage({ path: data.filePath }).catch(() => null)
      if (!result?.ok) return false

      setNodes((current) => current.filter((item) => item.id !== nodeId))
      const relatedEdges = edgesRef.current.filter(
        (edge) => edge.source === nodeId || edge.target === nodeId,
      )
      if (relatedEdges.length > 0) {
        relatedEdges.forEach((edge) => void deleteCanvasEdge(edge.id))
        setEdges((current) => current.filter((edge) => !relatedEdges.some((item) => item.id === edge.id)))
      }
      removeNode(nodeId)
      return true
    },
    [edgesRef, nodesRef, removeNode, setEdges, setNodes],
  )

  return { duplicateImageNode, removeTemporaryImageNode, repairImageNode }
}

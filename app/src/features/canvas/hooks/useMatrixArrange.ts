import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import type { Edge } from '@xyflow/react'
import { arrangeNodesAsMatrix, type ArrangeMode } from '../services/canvas-matrix-layout'
import type { CanvasFlowNode } from './useCanvasPersistence'

const AGENT_MATRIX_MOVING_CLASS = 'felixo-agent-matrix-moving'
/** Must match `.felixo-agent-matrix-moving` in index.css. */
const AGENT_MATRIX_ANIMATION_MS = 320

function addCssClass(current: string | undefined, added: string): string {
  return [...new Set([...(current?.split(/\s+/) ?? []), added].filter(Boolean))].join(' ')
}

function removeCssClass(current: string | undefined, removed: string): string | undefined {
  const next = (current?.split(/\s+/) ?? []).filter(
    (className) => className && className !== removed,
  )
  return next.length > 0 ? next.join(' ') : undefined
}

type MatrixArrangeOptions = {
  edges: Edge[]
  /** Enquadra a matriz na área útil depois de posicionar (ver `useSafeViewport`). */
  fitBoundsSafely: (
    bounds: { x: number; y: number; width: number; height: number },
    duration: number,
  ) => void
  nodes: CanvasFlowNode[]
  performanceMode: boolean
  persistNode: (node: CanvasFlowNode) => void
  setNodes: Dispatch<SetStateAction<CanvasFlowNode[]>>
}

/**
 * "Organizar": leva os blocos para a matriz, com a animação de deslocamento
 * (dispensada no Modo Performance e com movimento reduzido) e o enquadramento
 * do resultado.
 */
export function useMatrixArrange({
  edges,
  fitBoundsSafely,
  nodes,
  performanceMode,
  persistNode,
  setNodes,
}: MatrixArrangeOptions) {
  const agentMatrixAnimationFrameRef = useRef<number | undefined>(undefined)
  const agentMatrixAnimationCleanupRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const agentMatrixAnimationRunRef = useRef(0)

  useEffect(
    () => () => {
      if (agentMatrixAnimationFrameRef.current !== undefined) {
        window.cancelAnimationFrame(agentMatrixAnimationFrameRef.current)
      }
      if (agentMatrixAnimationCleanupRef.current !== undefined) {
        clearTimeout(agentMatrixAnimationCleanupRef.current)
      }
    },
    [],
  )

  // Explicit, opt-in layout for agents that were added at different times.
  // Shells and group children stay exactly where the user put them.
  const organizeCanvasBlocks = useCallback((mode: ArrangeMode = 'single') => {
    // Sem viewport: a matriz é ancorada no bloco mais ao topo-esquerda, então o
    // resultado não muda com pan, zoom ou tamanho de janela. A ordem das
    // células vem da ordem deste array — a mesma do dock e do "#N" do bloco.
    const { nodes: organized, bounds } = arrangeNodesAsMatrix(nodes, edges, mode)
    const targetPositions = new Map(
      organized.flatMap((node, index) => {
        const current = nodes[index]
        return node.position.x !== current.position.x || node.position.y !== current.position.y
          ? [[node.id, node.position] as const]
          : []
      }),
    )
    if (targetPositions.size === 0) {
      return
    }

    // A matriz pode ser maior que a área visível (telas menores, zoom alto).
    // Enquadrar depois de posicionar garante que o usuário veja o resultado
    // inteiro, em vez de achar que "não organizou" porque os blocos saíram
    // do campo de visão.
    const frameMatrix = () => {
      if (!bounds) return
      fitBoundsSafely(bounds, AGENT_MATRIX_ANIMATION_MS)
    }

    const applyTargetPositions = () => {
      setNodes((current) => {
        const next = current.map((node) => {
          const position = targetPositions.get(node.id)
          return position ? { ...node, position } : node
        })
        next.forEach((node, index) => {
          if (targetPositions.has(node.id) && node !== current[index]) {
            persistNode(node)
          }
        })
        return next
      })
    }

    if (performanceMode || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      applyTargetPositions()
      frameMatrix()
      return
    }

    if (agentMatrixAnimationFrameRef.current !== undefined) {
      window.cancelAnimationFrame(agentMatrixAnimationFrameRef.current)
    }
    if (agentMatrixAnimationCleanupRef.current !== undefined) {
      clearTimeout(agentMatrixAnimationCleanupRef.current)
    }

    const run = agentMatrixAnimationRunRef.current + 1
    agentMatrixAnimationRunRef.current = run
    setNodes((current) =>
      current.map((node) =>
        targetPositions.has(node.id)
          ? { ...node, className: addCssClass(node.className, AGENT_MATRIX_MOVING_CLASS) }
          : node,
      ),
    )
    // Two frames ensure the transition class is painted before React Flow gets
    // the new coordinates; otherwise the browser can coalesce both updates and
    // make the nodes teleport.
    agentMatrixAnimationFrameRef.current = window.requestAnimationFrame(() => {
      agentMatrixAnimationFrameRef.current = window.requestAnimationFrame(() => {
        agentMatrixAnimationFrameRef.current = undefined
        if (agentMatrixAnimationRunRef.current !== run) {
          return
        }
        applyTargetPositions()
        frameMatrix()
        agentMatrixAnimationCleanupRef.current = setTimeout(() => {
          if (agentMatrixAnimationRunRef.current !== run) {
            return
          }
          agentMatrixAnimationCleanupRef.current = undefined
          setNodes((current) =>
            current.map((node) =>
              targetPositions.has(node.id)
                ? {
                    ...node,
                    className: removeCssClass(node.className, AGENT_MATRIX_MOVING_CLASS),
                  }
                : node,
            ),
          )
        }, AGENT_MATRIX_ANIMATION_MS)
      })
    })
  }, [nodes, edges, setNodes, persistNode, performanceMode, fitBoundsSafely])

  return organizeCanvasBlocks
}

import { lazy, memo, Suspense, useCallback, useMemo, useRef } from 'react'
import {
  Handle,
  Position,
  NodeResizer,
  useReactFlow,
  type NodeProps,
} from '@xyflow/react'
import { Loader2 } from 'lucide-react'
import { NodeHeader } from './NodeHeader'
import type { ExcalidrawDrawingNodeData } from '../types'
import type { ExcalidrawScene } from './ExcalidrawCanvas'

/**
 * Data carried by an Excalidraw drawing node. `onDataChange` is injected by
 * CanvasView so scene edits flow back into canvas state and storage.
 */
type ExcalidrawDrawingNodeDataWithHandler = ExcalidrawDrawingNodeData & {
  onDataChange?: (nodeId: string, patch: Partial<ExcalidrawDrawingNodeData>) => void
}

// Só baixa/executa `@excalidraw/excalidraw` quando este node é montado de
// verdade — o mesmo padrão de code-splitting de `canvas-tool-loaders.tsx`,
// aplicado a um node do canvas em vez de um painel lateral.
const LazyExcalidrawCanvas = lazy(() => import('./ExcalidrawCanvas'))

const SCENE_SAVE_DEBOUNCE_MS = 600

function parseScene(raw: string | undefined): ExcalidrawScene | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && 'elements' in parsed) {
      return parsed as ExcalidrawScene
    }
    return null
  } catch {
    return null
  }
}

/**
 * Modo avançado do desenho no canvas: o Excalidraw de verdade (formas, texto,
 * setas, cores), lazy-loaded — pro custo de bundle/CPU só existir pra quem
 * escolhe abrir este node, nunca pra quem usa só o node leve ('drawing').
 */
function ExcalidrawDrawingNodeComponent({ id, data, selected }: NodeProps) {
  const nodeData = (data ?? {}) as ExcalidrawDrawingNodeDataWithHandler
  const onDataChange = nodeData.onDataChange
  const initialScene = useMemo(() => parseScene(nodeData.scene), [nodeData.scene])
  const saveTimer = useRef<number | undefined>(undefined)
  const { deleteElements } = useReactFlow()

  const handleSceneChange = useCallback(
    (scene: ExcalidrawScene) => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(() => {
        onDataChange?.(id, { scene: scene.elements.length ? JSON.stringify(scene) : '' })
      }, SCENE_SAVE_DEBOUNCE_MS)
    },
    [id, onDataChange],
  )

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-zinc-700 bg-white shadow-xl">
      <NodeResizer
        isVisible={selected}
        minWidth={360}
        minHeight={280}
        lineClassName="!border-black/20"
        handleClassName="!h-2.5 !w-2.5 !rounded-sm !bg-black/40"
      />
      <Handle type="target" position={Position.Left} className="!bg-black/40" />
      <NodeHeader
        editableValue={nodeData.label ?? ''}
        placeholder="Desenho (Excalidraw)"
        onTitleChange={(label) => onDataChange?.(id, { label })}
        className="bg-zinc-800 text-zinc-100"
        onRemove={() => void deleteElements({ nodes: [{ id }] })}
      />

      <div className="min-h-0 flex-1">
        <Suspense
          fallback={
            <div className="flex h-full w-full items-center justify-center gap-2 bg-zinc-900 text-sm text-zinc-400">
              <Loader2 size={16} className="animate-spin" />
              Carregando Excalidraw…
            </div>
          }
        >
          <LazyExcalidrawCanvas initialScene={initialScene} onSceneChange={handleSceneChange} />
        </Suspense>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-black/40" />
    </div>
  )
}

export const ExcalidrawDrawingNode = memo(ExcalidrawDrawingNodeComponent)

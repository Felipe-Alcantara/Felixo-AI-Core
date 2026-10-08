import { lazy, Suspense } from 'react'
import { NODE_MIN_SIZE } from '../services/node-geometry'
import {
  Handle,
  NodeResizer,
  Position,
  useReactFlow,
  type NodeProps,
} from '@xyflow/react'
import { ListTodo } from 'lucide-react'
import { NodeHeader } from './NodeHeader'
import { readNotionTasksSelection, type NotionTasksSelectionPatch } from '../services/notion-tasks-selection'
import type { NotionTasksNodeData } from '../types'

/** `onDataChange` vem do CanvasView, como no bloco de página web. */
type NotionTasksNodeDataWithHandler = NotionTasksNodeData & {
  onDataChange?: (nodeId: string, patch: Partial<NotionTasksNodeData>) => void
}

const LazyNotionTasksPanel = lazy(() =>
  import('./tools/NotionTasksPanel').then(({ NotionTasksPanel }) => ({
    default: NotionTasksPanel,
  })),
)

/**
 * Bloco persistente do Canvas para a lista de tarefas do Notion.
 *
 * A lista não é uma janela flutuante: ela vive no grafo, pode ser arrastada,
 * redimensionada e reencontrada depois de reabrir o app. A configuração e as
 * ações continuam no mesmo conteúdo, mas o cabeçalho do bloco é o único
 * elemento responsável por movê-lo. A conexão e a database escolhidas ficam no
 * `data` do bloco, para cada bloco reabrir na sua.
 */
export function NotionTasksNode({ id, data, selected }: NodeProps) {
  const { deleteElements } = useReactFlow()
  const nodeData = data as NotionTasksNodeDataWithHandler
  const savedSelection = readNotionTasksSelection(nodeData)
  const saveSelection = (patch: NotionTasksSelectionPatch) => nodeData.onDataChange?.(id, patch)

  return (
    <div className="felixo-canvas-card felixo-canvas-card-notion flex h-full w-full min-h-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-zinc-900 text-zinc-200 shadow-2xl">
      <NodeResizer
        isVisible={selected}
        minWidth={NODE_MIN_SIZE.notionTasks.width}
        minHeight={NODE_MIN_SIZE.notionTasks.height}
      />
      <Handle type="target" position={Position.Left} />
      <NodeHeader
        title="Tarefas Notion"
        icon={<ListTodo size={13} />}
        className="bg-white/4 text-(--f-core-white)"
        onRemove={() => void deleteElements({ nodes: [{ id }] })}
      />
      <div className="nodrag nowheel nopan min-h-0 flex-1 overflow-auto bg-zinc-900 p-3">
        <Suspense
          fallback={
            <div className="flex min-h-40 items-center justify-center text-xs text-zinc-500">
              Carregando tarefas do Notion…
            </div>
          }
        >
          <LazyNotionTasksPanel savedSelection={savedSelection} onSelectionChange={saveSelection} />
        </Suspense>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

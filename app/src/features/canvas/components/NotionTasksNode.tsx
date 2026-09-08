import { lazy, Suspense } from 'react'
import {
  Handle,
  NodeResizer,
  Position,
  useReactFlow,
  type NodeProps,
} from '@xyflow/react'
import { ListTodo } from 'lucide-react'
import { NodeHeader } from './NodeHeader'

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
 * elemento responsável por movê-lo.
 */
export function NotionTasksNode({ id, selected }: NodeProps) {
  const { deleteElements } = useReactFlow()

  return (
    <div className="flex h-full w-full min-h-0 flex-col overflow-hidden rounded-xl border border-violet-300/20 bg-zinc-900 text-zinc-200 shadow-2xl">
      <NodeResizer
        isVisible={selected}
        minWidth={760}
        minHeight={460}
        lineClassName="!border-violet-400/50"
        handleClassName="!h-2.5 !w-2.5 !rounded-sm !bg-violet-400"
      />
      <Handle type="target" position={Position.Left} className="!bg-violet-400" />
      <NodeHeader
        title="Tarefas Notion"
        icon={<ListTodo size={13} />}
        className="bg-violet-950/60 text-violet-100"
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
          <LazyNotionTasksPanel embedded onClose={() => void deleteElements({ nodes: [{ id }] })} />
        </Suspense>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-violet-400" />
    </div>
  )
}

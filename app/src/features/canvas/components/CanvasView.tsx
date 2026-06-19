import { useCallback, useMemo } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useEdgesState,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeTypes,
} from '@xyflow/react'
import { TerminalSquare, StickyNote } from 'lucide-react'
import '@xyflow/react/dist/style.css'
import { TerminalNode } from './TerminalNode'
import { NoteNode } from './NoteNode'
import { NODE_DRAG_HANDLE_CLASS } from './NodeHeader'
import { useCanvasPersistence } from '../hooks/useCanvasPersistence'
import type { CanvasNodeType } from '../types'

const DEFAULT_SIZE: Record<CanvasNodeType, { width: number; height: number }> = {
  terminal: { width: 520, height: 360 },
  note: { width: 220, height: 160 },
}

export function CanvasView() {
  const { nodes, setNodes, persistNode, removeNode } = useCanvasPersistence()
  const [edges, setEdges] = useEdgesState<Edge>([])

  const updateNodeData = useCallback(
    (nodeId: string, patch: Record<string, unknown>) => {
      setNodes((current) => {
        const next = current.map((item) =>
          item.id === nodeId ? { ...item, data: { ...item.data, ...patch } } : item,
        )
        const changed = next.find((item) => item.id === nodeId)
        if (changed) {
          persistNode(changed)
        }
        return next
      })
    },
    [setNodes, persistNode],
  )

  // Inject render-time concerns: the header drag handle (so only the header
  // moves the node) and, for notes, the edit handler. Keeping these out of
  // stored state means persisted data stays plain JSON.
  const renderedNodes = useMemo(
    () =>
      nodes.map((node) => {
        const withHandle = { ...node, dragHandle: `.${NODE_DRAG_HANDLE_CLASS}` }

        return node.type === 'note'
          ? {
              ...withHandle,
              data: { ...node.data, onDataChange: updateNodeData },
            }
          : withHandle
      }),
    [nodes, updateNodeData],
  )

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((current) => {
        const next = applyNodeChanges(changes, current)

        for (const change of changes) {
          if (
            (change.type === 'position' && change.dragging === false) ||
            (change.type === 'dimensions' && change.resizing === false)
          ) {
            const node = next.find((item) => item.id === change.id)
            if (node) {
              persistNode(node)
            }
          }
        }

        return next
      })

      for (const change of changes) {
        if (change.type === 'remove') {
          removeNode(change.id)
        }
      }
    },
    [setNodes, persistNode, removeNode],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((current) => applyEdgeChanges(changes, current)),
    [setEdges],
  )

  const onConnect = useCallback(
    (connection: Connection) => setEdges((current) => addEdge(connection, current)),
    [setEdges],
  )

  const addNode = useCallback(
    (type: CanvasNodeType) => {
      const id = `${type}-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`
      const size = DEFAULT_SIZE[type]
      const node: Node = {
        id,
        type,
        position: {
          x: 120 + Math.random() * 180,
          y: 120 + Math.random() * 120,
        },
        width: size.width,
        height: size.height,
        data: type === 'terminal' ? { label: 'Terminal' } : { text: '' },
      }

      setNodes((current) => [...current, node])
      persistNode(node)
    },
    [setNodes, persistNode],
  )

  const nodeTypes = useMemo<NodeTypes>(
    () => ({ terminal: TerminalNode, note: NoteNode }),
    [],
  )

  return (
    <div className="relative h-full w-full">
      <div className="absolute left-4 top-4 z-10 flex gap-2">
        <button
          type="button"
          onClick={() => addNode('terminal')}
          className="flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-100 shadow-lg ring-1 ring-white/10 hover:bg-zinc-700"
        >
          <TerminalSquare size={16} />
          Terminal
        </button>
        <button
          type="button"
          onClick={() => addNode('note')}
          className="flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-100 shadow-lg ring-1 ring-white/10 hover:bg-zinc-700"
        >
          <StickyNote size={16} />
          Nota
        </button>
      </div>

      <ReactFlow
        nodes={renderedNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={['Delete', 'Backspace']}
      >
        <Background gap={20} color="#1e293b" />
        <Controls position="bottom-left" className="!mb-4 !ml-4" />
        {/* Top-right keeps the minimap clear of the bottom Chat/Canvas toggle. */}
        <MiniMap
          pannable
          zoomable
          position="top-right"
          className="!mr-4 !mt-4 !bg-zinc-900"
        />
      </ReactFlow>
    </div>
  )
}

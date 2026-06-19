import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { Group, StickyNote } from 'lucide-react'
import '@xyflow/react/dist/style.css'
import { TerminalNode } from './TerminalNode'
import { NoteNode } from './NoteNode'
import { GroupNode } from './GroupNode'
import { TerminalMenu } from './TerminalMenu'
import { TerminalDrawer } from './TerminalDrawer'
import { NODE_DRAG_HANDLE_CLASS } from './NodeHeader'
import { TerminalSessionProvider } from '../terminal/TerminalSessionProvider'
import { useCanvasPersistence } from '../hooks/useCanvasPersistence'
import type { CanvasNodeType } from '../types'

const DEFAULT_SIZE: Record<CanvasNodeType, { width: number; height: number }> = {
  group: { width: 480, height: 320 },
  terminal: { width: 520, height: 360 },
  note: { width: 220, height: 160 },
}

type CanvasProject = { id: string; name: string; path: string }

/** True when the dragged node's top-left sits within the group's bounds. */
function isInside(node: Node, group: Node): boolean {
  const gx = group.position.x
  const gy = group.position.y
  const gw = group.width ?? group.measured?.width ?? 0
  const gh = group.height ?? group.measured?.height ?? 0

  return (
    node.position.x >= gx &&
    node.position.y >= gy &&
    node.position.x <= gx + gw &&
    node.position.y <= gy + gh
  )
}

export function CanvasView() {
  return (
    <TerminalSessionProvider>
      <CanvasInner />
    </TerminalSessionProvider>
  )
}

function CanvasInner() {
  const { nodes, setNodes, persistNode, removeNode } = useCanvasPersistence()
  const [edges, setEdges] = useEdgesState<Edge>([])
  const [projects, setProjects] = useState<CanvasProject[]>([])
  const [expandedTerminalId, setExpandedTerminalId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    void window.felixo?.projects?.list().then((result) => {
      if (cancelled || !result.ok || !Array.isArray(result.projects)) {
        return
      }

      const loaded = (result.projects as CanvasProject[]).filter(
        (project) => project && typeof project.path === 'string',
      )
      setProjects(loaded)
    })

    return () => {
      cancelled = true
    }
  }, [])

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
  // moves the node) and, for notes/groups, the edit handler. Keeping these out
  // of stored state means persisted data stays plain JSON.
  const renderedNodes = useMemo(
    () =>
      nodes.map((node) => {
        const withHandle = { ...node, dragHandle: `.${NODE_DRAG_HANDLE_CLASS}` }

        if (node.type === 'note' || node.type === 'group') {
          return {
            ...withHandle,
            data: { ...node.data, onDataChange: updateNodeData },
          }
        }

        if (node.type === 'terminal') {
          return {
            ...withHandle,
            data: { ...node.data, onExpand: setExpandedTerminalId },
          }
        }

        return withHandle
      }),
    [nodes, updateNodeData],
  )

  // Groups must render before their children so they sit behind them.
  const orderedNodes = useMemo(() => {
    const groups = renderedNodes.filter((node) => node.type === 'group')
    const rest = renderedNodes.filter((node) => node.type !== 'group')
    return [...groups, ...rest]
  }, [renderedNodes])

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
    (type: CanvasNodeType, data?: Record<string, unknown>) => {
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
        data: data ?? (type === 'terminal' ? { label: 'Terminal' } : { text: '' }),
      }

      setNodes((current) => [...current, node])
      persistNode(node)
    },
    [setNodes, persistNode],
  )

  const addTerminalNode = useCallback(
    (project?: { name: string; path: string }) => {
      addNode('terminal', {
        label: project ? project.name : 'Terminal',
        ...(project ? { cwd: project.path } : {}),
      })
    },
    [addNode],
  )

  // Drop a node onto a group to make it a child; drop it out to detach. Uses
  // absolute positions, so only top-level nodes (already absolute) are
  // reparented — keeping the hit-test simple and predictable.
  const onNodeDragStop = useCallback(
    (_event: unknown, dragged: Node) => {
      if (dragged.type === 'group' || dragged.parentId) {
        return
      }

      setNodes((current) => {
        const groups = current.filter((node) => node.type === 'group')
        const target = groups.find((group) =>
          isInside(dragged, group),
        )

        if (!target) {
          return current
        }

        const next = current.map((node) =>
          node.id === dragged.id
            ? {
                ...node,
                parentId: target.id,
                extent: 'parent' as const,
                position: {
                  x: dragged.position.x - target.position.x,
                  y: dragged.position.y - target.position.y,
                },
              }
            : node,
        )
        const changed = next.find((node) => node.id === dragged.id)
        if (changed) {
          persistNode(changed)
        }
        return next
      })
    },
    [setNodes, persistNode],
  )

  const nodeTypes = useMemo<NodeTypes>(
    () => ({ terminal: TerminalNode, note: NoteNode, group: GroupNode }),
    [],
  )

  const expandedNode = expandedTerminalId
    ? nodes.find((node) => node.id === expandedTerminalId)
    : undefined
  const expandedTitle =
    (expandedNode?.data as { label?: string } | undefined)?.label ?? 'Terminal'

  return (
    <div className="flex h-full w-full">
      <div className="relative h-full min-w-0 flex-1">
      <div className="absolute left-4 top-4 z-10 flex gap-2">
        <TerminalMenu projects={projects} onAdd={addTerminalNode} />
        <button
          type="button"
          onClick={() => addNode('note')}
          className="flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-100 shadow-lg ring-1 ring-white/10 hover:bg-zinc-700"
        >
          <StickyNote size={16} />
          Nota
        </button>
        <button
          type="button"
          onClick={() => addNode('group', { label: 'Grupo' })}
          className="flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-100 shadow-lg ring-1 ring-white/10 hover:bg-zinc-700"
        >
          <Group size={16} />
          Grupo
        </button>
      </div>

      <ReactFlow
        nodes={orderedNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
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
          className="!mr-4 !mt-4"
          bgColor="#18181b"
          maskColor="rgba(0, 0, 0, 0.6)"
          nodeColor="#3f3f46"
          nodeStrokeColor="#52525b"
        />
      </ReactFlow>
      </div>

      {expandedTerminalId && (
        <TerminalDrawer
          sessionId={expandedTerminalId}
          title={expandedTitle}
          onClose={() => setExpandedTerminalId(null)}
        />
      )}
    </div>
  )
}

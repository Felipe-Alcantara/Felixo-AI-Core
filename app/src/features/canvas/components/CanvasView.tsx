import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useEdgesState,
  SelectionMode,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeTypes,
} from '@xyflow/react'
import { FileText, Group, Hand, MousePointer2, StickyNote } from 'lucide-react'
import '@xyflow/react/dist/style.css'
import { TerminalNode } from './TerminalNode'
import { NoteNode } from './NoteNode'
import { GroupNode } from './GroupNode'
import { FileNode } from './FileNode'
import { TerminalMenu } from './TerminalMenu'
import { TerminalDrawer } from './TerminalDrawer'
import { NODE_DRAG_HANDLE_CLASS } from './NodeHeader'
import { TerminalSessionProvider } from '../terminal/TerminalSessionProvider'
import { useTerminalSessions } from '../terminal/terminal-session-context'
import {
  DEFAULT_FILE_LINK_PROMPT,
  buildFileLinkPrompt,
} from '../services/file-link-prompt'
import { CanvasToolsMenu, type CanvasTool } from './tools/CanvasToolsMenu'
import { ProjectsPanel } from './tools/ProjectsPanel'
import { NotesPanel } from './tools/NotesPanel'
import { ModelsPanel } from './tools/ModelsPanel'
import { PromptsPanel } from './tools/PromptsPanel'
import { GitPanel } from './tools/GitPanel'
import { SettingsPanel } from './tools/SettingsPanel'
import { useCanvasPersistence } from '../hooks/useCanvasPersistence'
import {
  deleteCanvasEdge,
  loadCanvasEdges,
  saveCanvasEdge,
} from '../services/canvas-storage'
import type { CanvasNodeType } from '../types'

const DEFAULT_SIZE: Record<CanvasNodeType, { width: number; height: number }> = {
  group: { width: 480, height: 320 },
  file: { width: 320, height: 260 },
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

/**
 * If a connection links a file block and a terminal block, resolve the file's
 * absolute path and type a short context line into the terminal so the running
 * agent learns it can read/edit that file.
 */
async function announceFileToTerminal(
  connection: Connection,
  nodes: Node[],
  store: { sendText: (id: string, text: string) => void },
  template: string,
): Promise<void> {
  const a = nodes.find((node) => node.id === connection.source)
  const b = nodes.find((node) => node.id === connection.target)
  if (!a || !b) {
    return
  }

  const fileNode = a.type === 'file' ? a : b.type === 'file' ? b : null
  const terminalNode = a.type === 'terminal' ? a : b.type === 'terminal' ? b : null
  if (!fileNode || !terminalNode) {
    return
  }

  const fileName = (fileNode.data as { fileName?: string } | undefined)?.fileName
  if (!fileName) {
    return
  }

  const resolved = await window.felixo?.canvasFiles?.resolve({ name: fileName })
  if (!resolved?.ok || !resolved.path) {
    return
  }

  const command = (terminalNode.data as { command?: string } | undefined)?.command
  const agentName = command ? command : 'este agente'
  store.sendText(
    terminalNode.id,
    buildFileLinkPrompt(template, resolved.path, agentName),
  )
}

/** True only when the keyboard event originates from the bare canvas (not a
 *  field, terminal or panel) — so 'Q' toggles the mode only there. */
function isCanvasFocused(target: HTMLElement | null): boolean {
  if (!target) {
    return true
  }

  // The React Flow pane (and document body) count as "the canvas"; anything
  // inside an input/terminal/panel does not.
  return (
    target === document.body ||
    target.classList.contains('react-flow__pane') ||
    target.closest('.react-flow__pane') !== null
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
  const store = useTerminalSessions()
  const { nodes, setNodes, persistNode, removeNode } = useCanvasPersistence()
  const [edges, setEdges] = useEdgesState<Edge>([])
  const [projects, setProjects] = useState<CanvasProject[]>([])
  const [expandedTerminalId, setExpandedTerminalId] = useState<string | null>(null)
  // 'select' = drag draws a selection box; 'pan' = drag grabs and moves the canvas.
  const [canvasMode, setCanvasMode] = useState<'select' | 'pan'>('select')
  const [activeTool, setActiveTool] = useState<CanvasTool | null>(null)
  // Editable instruction injected when a file links to a terminal.
  const fileLinkPromptRef = useRef(DEFAULT_FILE_LINK_PROMPT)

  useEffect(() => {
    void window.felixo?.canvas?.getFileLinkPrompt().then((result) => {
      if (result?.ok && typeof result.prompt === 'string' && result.prompt.trim()) {
        fileLinkPromptRef.current = result.prompt
      }
    })
  }, [])

  // 'Q' toggles select/pan, but only when the canvas itself is focused — never
  // while typing in a field, terminal or tool panel.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'q' || event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      if (!isCanvasFocused(event.target as HTMLElement | null)) {
        return
      }

      setCanvasMode((mode) => (mode === 'select' ? 'pan' : 'select'))
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Hydrate persisted connections once.
  useEffect(() => {
    let cancelled = false
    void loadCanvasEdges().then((loaded) => {
      if (!cancelled) {
        setEdges(loaded)
      }
    })
    return () => {
      cancelled = true
    }
  }, [setEdges])

  const reloadProjects = useCallback(() => {
    void window.felixo?.projects?.list().then((result) => {
      if (result?.ok && Array.isArray(result.projects)) {
        setProjects(
          (result.projects as CanvasProject[]).filter(
            (project) => project && typeof project.path === 'string',
          ),
        )
      }
    })
  }, [])

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

        if (node.type === 'note' || node.type === 'group' || node.type === 'file') {
          return {
            ...withHandle,
            data: { ...node.data, onDataChange: updateNodeData },
          }
        }

        if (node.type === 'terminal') {
          return {
            ...withHandle,
            data: {
              ...node.data,
              onExpand: setExpandedTerminalId,
              onDataChange: updateNodeData,
            },
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
    (changes: EdgeChange[]) => {
      for (const change of changes) {
        if (change.type === 'remove') {
          void deleteCanvasEdge(change.id)
        }
      }
      setEdges((current) => applyEdgeChanges(changes, current))
    },
    [setEdges],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((current) => {
        const next = addEdge(connection, current)
        const created = next.find(
          (edge) =>
            edge.source === connection.source && edge.target === connection.target,
        )
        if (created) {
          void saveCanvasEdge(created)
        }
        return next
      })

      // When a file block connects to a terminal, tell that terminal's agent
      // about the file so it can read/edit it.
      void announceFileToTerminal(connection, nodes, store, fileLinkPromptRef.current)
    },
    [setEdges, nodes, store],
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

  const addFileNode = useCallback(() => {
    const fileName = `nota-${Date.now()}.md`
    // Create the file on disk so it exists for agents and the watcher.
    void window.felixo?.canvasFiles?.write({ name: fileName, content: '' })
    addNode('file', { fileName, label: fileName })
  }, [addNode])

  const addTerminalNode = useCallback(
    (options: { command?: string; cwd?: string; label: string }) => {
      addNode('terminal', {
        label: options.label,
        ...(options.command ? { command: options.command } : {}),
        ...(options.cwd ? { cwd: options.cwd } : {}),
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
    () => ({ terminal: TerminalNode, note: NoteNode, group: GroupNode, file: FileNode }),
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
      <div className="absolute left-4 top-4 z-10 flex items-start gap-2">
        <CanvasToolsMenu
          activeTool={activeTool}
          onSelect={(tool) =>
            setActiveTool((current) => (current === tool ? null : tool))
          }
        />
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
          onClick={addFileNode}
          className="flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-100 shadow-lg ring-1 ring-white/10 hover:bg-zinc-700"
          title="Bloco de arquivo .md compartilhado (agentes podem editar)"
        >
          <FileText size={16} />
          Arquivo
        </button>
        <button
          type="button"
          onClick={() => addNode('group', { label: 'Grupo' })}
          className="flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-100 shadow-lg ring-1 ring-white/10 hover:bg-zinc-700"
        >
          <Group size={16} />
          Grupo
        </button>

        <button
          type="button"
          onClick={() =>
            setCanvasMode((mode) => (mode === 'select' ? 'pan' : 'select'))
          }
          className="flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-100 shadow-lg ring-1 ring-white/10 hover:bg-zinc-700"
          title={
            canvasMode === 'select'
              ? 'Modo seleção — Q para mover a tela'
              : 'Modo mover tela — Q para selecionar'
          }
        >
          {canvasMode === 'select' ? (
            <>
              <MousePointer2 size={16} />
              Selecionar
            </>
          ) : (
            <>
              <Hand size={16} />
              Mover tela
            </>
          )}
        </button>
      </div>

      {activeTool === 'projects' && (
        <ProjectsPanel
          onClose={() => setActiveTool(null)}
          onProjectsChanged={reloadProjects}
        />
      )}
      {activeTool === 'notes' && (
        <NotesPanel onClose={() => setActiveTool(null)} />
      )}
      {activeTool === 'models' && (
        <ModelsPanel onClose={() => setActiveTool(null)} />
      )}
      {activeTool === 'prompts' && (
        <PromptsPanel onClose={() => setActiveTool(null)} />
      )}
      {activeTool === 'git' && <GitPanel onClose={() => setActiveTool(null)} />}
      {activeTool === 'settings' && (
        <SettingsPanel
          onClose={() => setActiveTool(null)}
          onPromptSaved={(prompt) => {
            fileLinkPromptRef.current = prompt
          }}
        />
      )}

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
        // Select mode: drag on empty canvas draws a selection box (middle/right
        // mouse still pans). Pan mode: left-drag grabs and moves the canvas.
        // Shift always adds to the selection.
        // Partial = touching/overlapping a node with the box selects it; the
        // box doesn't need to fully contain the node.
        selectionMode={SelectionMode.Partial}
        selectionOnDrag={canvasMode === 'select'}
        panOnDrag={canvasMode === 'select' ? [1, 2] : true}
        selectionKeyCode={null}
        multiSelectionKeyCode={['Shift']}
        panActivationKeyCode="Space"
        className={canvasMode === 'pan' ? 'cursor-grab' : ''}
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

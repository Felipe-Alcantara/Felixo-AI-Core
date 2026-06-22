import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
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
import {
  Download,
  FileText,
  Group,
  Hand,
  MousePointer2,
  StickyNote,
  Trash2,
  Upload,
} from 'lucide-react'
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
  DEFAULT_FILE_BOOTSTRAP_PROMPT,
  buildFileLinkPrompt,
  buildBootstrapPrompt,
} from '../services/file-link-prompt'
import {
  DEFAULT_QUALITY_STANDARD_PROMPT,
  buildCanvasTerminalInitialText,
} from '../services/quality-standard-prompt'
import { CanvasToolsMenu, type CanvasTool } from './tools/CanvasToolsMenu'
import { ProjectsPanel } from './tools/ProjectsPanel'
import { NotesPanel } from './tools/NotesPanel'
import { ModelsPanel } from './tools/ModelsPanel'
import { PromptsPanel } from './tools/PromptsPanel'
import { GitPanel } from './tools/GitPanel'
import { SettingsPanel } from './tools/SettingsPanel'
import {
  toFlowNode,
  toPersistedNode,
  useCanvasPersistence,
} from '../hooks/useCanvasPersistence'
import {
  clearCanvas,
  deleteCanvasEdge,
  exportCanvasBundle,
  importCanvasBundle,
  loadCanvasEdges,
  saveCanvasEdge,
  validateCanvasBundle,
} from '../services/canvas-storage'
import type { CanvasNodeType, PersistedCanvasEdge } from '../types'

const DEFAULT_SIZE: Record<CanvasNodeType, { width: number; height: number }> = {
  group: { width: 480, height: 320 },
  file: { width: 320, height: 260 },
  terminal: { width: 520, height: 360 },
  note: { width: 220, height: 160 },
}

const NODE_PLACEMENT_GAP = 32
const VIEWPORT_PLACEMENT_PADDING = { x: 40, top: 88, bottom: 40 }

type CanvasBounds = { x: number; y: number; width: number; height: number }
type FlowPositionMapper = {
  screenToFlowPosition: (position: { x: number; y: number }) => {
    x: number
    y: number
  }
}

/**
 * Finds the closest free top-level position, preferring the currently visible
 * canvas. Candidate coordinates follow existing node edges, which keeps the
 * layout aligned while avoiding overlap between differently sized blocks.
 */
function findFreeNodePosition(
  nodes: Node[],
  size: { width: number; height: number },
  viewport?: CanvasBounds,
): { x: number; y: number } {
  const origin = viewport
    ? {
        x: viewport.x + VIEWPORT_PLACEMENT_PADDING.x,
        y: viewport.y + VIEWPORT_PLACEMENT_PADDING.top,
      }
    : { x: 120, y: 120 }
  const topLevelNodes = nodes.filter((node) => !node.parentId)
  const xCandidates = uniqueSortedCoordinates([
    origin.x,
    ...topLevelNodes.map(
      (node) =>
        node.position.x + getNodeSize(node).width + NODE_PLACEMENT_GAP,
    ),
  ]).filter((x) => x >= origin.x)
  const yCandidates = uniqueSortedCoordinates([
    origin.y,
    ...topLevelNodes.map(
      (node) =>
        node.position.y + getNodeSize(node).height + NODE_PLACEMENT_GAP,
    ),
  ]).filter((y) => y >= origin.y)
  const candidates = yCandidates.flatMap((y) =>
    xCandidates.map((x) => ({ x, y })),
  )
  const visibleCandidates = viewport
    ? candidates.filter(
        (candidate) =>
          candidate.x + size.width <=
            viewport.x + viewport.width - VIEWPORT_PLACEMENT_PADDING.x &&
          candidate.y + size.height <=
            viewport.y + viewport.height - VIEWPORT_PLACEMENT_PADDING.bottom,
      )
    : candidates

  return (
    visibleCandidates.find((candidate) =>
      isPositionFree(candidate, size, topLevelNodes),
    ) ??
    candidates.find((candidate) =>
      isPositionFree(candidate, size, topLevelNodes),
    ) ?? {
      x: origin.x,
      y:
        Math.max(
          origin.y,
          ...topLevelNodes.map(
            (node) =>
              node.position.y + getNodeSize(node).height + NODE_PLACEMENT_GAP,
          ),
        ),
    }
  )
}

function isPositionFree(
  position: { x: number; y: number },
  size: { width: number; height: number },
  nodes: Node[],
): boolean {
  return nodes.every((node) => {
    const nodeSize = getNodeSize(node)
    return (
      position.x + size.width + NODE_PLACEMENT_GAP <= node.position.x ||
      position.x >= node.position.x + nodeSize.width + NODE_PLACEMENT_GAP ||
      position.y + size.height + NODE_PLACEMENT_GAP <= node.position.y ||
      position.y >= node.position.y + nodeSize.height + NODE_PLACEMENT_GAP
    )
  })
}

function getNodeSize(node: Node): { width: number; height: number } {
  const fallback = DEFAULT_SIZE[node.type as CanvasNodeType] ?? DEFAULT_SIZE.note
  return {
    width: node.width ?? node.measured?.width ?? fallback.width,
    height: node.height ?? node.measured?.height ?? fallback.height,
  }
}

function uniqueSortedCoordinates(values: number[]): number[] {
  return [...new Set(values.map((value) => Math.round(value)))].sort(
    (left, right) => left - right,
  )
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
  bootstrapTemplate: string,
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

  const terminalData = terminalNode.data as
    | { command?: string; cwd?: string }
    | undefined
  const agentName = terminalData?.command ? terminalData.command : 'este agente'

  // EXCEPTION: terminal in a project repo (has cwd) + the .md is still blank →
  // the agent should analyze the repo and write the evolution plan itself.
  const inRepository = Boolean(terminalData?.cwd)
  const fileRead = await window.felixo?.canvasFiles?.read({ name: fileName })
  const isBlank = !fileRead?.ok || !(fileRead.content ?? '').trim()

  const prompt =
    inRepository && isBlank
      ? buildBootstrapPrompt(bootstrapTemplate, resolved.path, agentName)
      : buildFileLinkPrompt(template, resolved.path, agentName)

  store.sendText(terminalNode.id, prompt)
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

function toPersistedEdge(edge: Edge): PersistedCanvasEdge {
  return { id: edge.id, source: edge.source, target: edge.target }
}

function toFlowEdge(edge: PersistedCanvasEdge): Edge {
  return { id: edge.id, source: edge.source, target: edge.target }
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
  const {
    nodes,
    setNodes,
    persistNode,
    removeNode,
    cancelPendingSaves,
  } = useCanvasPersistence()
  const [edges, setEdges] = useEdgesState<Edge>([])
  const [isClearing, setIsClearing] = useState(false)
  const [isTransferring, setIsTransferring] = useState(false)
  const [canvasRevision, setCanvasRevision] = useState(0)
  const [projects, setProjects] = useState<CanvasProject[]>([])
  const [expandedTerminalId, setExpandedTerminalId] = useState<string | null>(null)
  // 'select' = drag draws a selection box; 'pan' = drag grabs and moves the canvas.
  const [canvasMode, setCanvasMode] = useState<'select' | 'pan'>('select')
  const [activeTool, setActiveTool] = useState<CanvasTool | null>(null)
  // Editable instructions injected when a file links to a terminal: the normal
  // "living plan" prompt, and the bootstrap prompt for the empty-md-in-repo case.
  const fileLinkPromptRef = useRef(DEFAULT_FILE_LINK_PROMPT)
  const bootstrapPromptRef = useRef(DEFAULT_FILE_BOOTSTRAP_PROMPT)
  // Standing "follow the quality standard" instruction for agent terminals.
  const qualityStandardRef = useRef({
    prompt: DEFAULT_QUALITY_STANDARD_PROMPT,
    enabled: true,
  })
  const importInputRef = useRef<HTMLInputElement>(null)
  const flowContainerRef = useRef<HTMLDivElement>(null)
  const flowInstanceRef = useRef<FlowPositionMapper | null>(null)

  useEffect(() => {
    void window.felixo?.canvas?.getFileLinkPrompt().then((result) => {
      if (result?.ok && typeof result.prompt === 'string' && result.prompt.trim()) {
        fileLinkPromptRef.current = result.prompt
      }
    })
    void window.felixo?.canvas?.getFileBootstrapPrompt?.().then((result) => {
      if (result?.ok && typeof result.prompt === 'string' && result.prompt.trim()) {
        bootstrapPromptRef.current = result.prompt
      }
    })
    void window.felixo?.canvas?.getQualityStandard?.().then((result) => {
      if (result?.ok) {
        qualityStandardRef.current = {
          prompt:
            typeof result.prompt === 'string' && result.prompt.trim()
              ? result.prompt
              : DEFAULT_QUALITY_STANDARD_PROMPT,
          enabled: result.enabled !== false,
        }
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

  // Pick a folder, register its repos as projects, refresh the list and return
  // the new project ids — used by the terminal menu's "Adicionar pasta…".
  const addProjectFolder = useCallback(async (): Promise<string[]> => {
    const bridge = window.felixo?.projects
    if (!bridge) {
      return []
    }

    const folder = await bridge.pickFolder()
    if (!folder) {
      return []
    }

    const repos = await bridge.detectRepos(folder)
    const picked =
      repos.length > 0
        ? repos
        : [{ name: folder.split('/').filter(Boolean).pop() ?? folder, path: folder }]

    const existingByPath = new Map(projects.map((project) => [project.path, project.id]))
    const ids: string[] = []
    for (const repo of picked) {
      const existingId = existingByPath.get(repo.path)
      if (existingId) {
        ids.push(existingId)
        continue
      }
      const id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
      await bridge.save({ id, name: repo.name, path: repo.path })
      ids.push(id)
    }

    reloadProjects()
    return ids
  }, [reloadProjects, projects])

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
          const quality = qualityStandardRef.current
          const fallbackInitialText =
            quality.enabled && node.data.command
              ? buildCanvasTerminalInitialText(
                  quality.prompt,
                  node.data.initialText,
                )
              : node.data.initialText

          return {
            ...withHandle,
            data: {
              ...node.data,
              ...(fallbackInitialText ? { initialText: fallbackInitialText } : {}),
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
      void announceFileToTerminal(
        connection,
        nodes,
        store,
        fileLinkPromptRef.current,
        bootstrapPromptRef.current,
      )
    },
    [setEdges, nodes, store],
  )

  const addNode = useCallback(
    (type: CanvasNodeType, data?: Record<string, unknown>) => {
      const id = `${type}-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`
      const size = DEFAULT_SIZE[type]
      const container = flowContainerRef.current
      const flowInstance = flowInstanceRef.current
      let viewport: CanvasBounds | undefined

      if (container && flowInstance) {
        const bounds = container.getBoundingClientRect()
        const topLeft = flowInstance.screenToFlowPosition({
          x: bounds.left,
          y: bounds.top,
        })
        const bottomRight = flowInstance.screenToFlowPosition({
          x: bounds.right,
          y: bounds.bottom,
        })
        viewport = {
          x: topLeft.x,
          y: topLeft.y,
          width: bottomRight.x - topLeft.x,
          height: bottomRight.y - topLeft.y,
        }
      }

      const node: Node = {
        id,
        type,
        position: findFreeNodePosition(nodes, size, viewport),
        width: size.width,
        height: size.height,
        data: data ?? (type === 'terminal' ? { label: 'Terminal' } : { text: '' }),
      }

      setNodes((current) => [...current, node])
      persistNode(node)
    },
    [nodes, setNodes, persistNode],
  )

  const addFileNode = useCallback(() => {
    const fileName = `nota-${Date.now()}.md`
    // Create the file on disk so it exists for agents and the watcher.
    void window.felixo?.canvasFiles?.write({ name: fileName, content: '' })
    addNode('file', { fileName, label: fileName })
  }, [addNode])

  const addTerminalNode = useCallback(
    (options: { command?: string; args?: string[]; cwd?: string; label: string }) => {
      // Agent terminals get the standing quality-standard instruction (if on);
      // a plain shell does not (there's no agent to read it).
      const quality = qualityStandardRef.current
      const initialText =
        options.command && quality.enabled
          ? buildCanvasTerminalInitialText(quality.prompt)
          : undefined

      addNode('terminal', {
        label: options.label,
        ...(options.command ? { command: options.command } : {}),
        ...(options.args && options.args.length ? { args: options.args } : {}),
        ...(options.cwd ? { cwd: options.cwd } : {}),
        ...(initialText ? { initialText } : {}),
      })
    },
    [addNode],
  )

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
    setExpandedTerminalId(null)
    setActiveTool(null)
    setNodes([])
    setEdges([])
  }, [cancelPendingSaves, setEdges, setNodes, store])

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
      setExpandedTerminalId(null)
      setActiveTool(null)
      setNodes(result.nodes.map(toFlowNode))
      setEdges(result.edges.map(toFlowEdge))
      setCanvasRevision((revision) => revision + 1)
    },
    [cancelPendingSaves, nodes, persistNode, setEdges, setNodes, store],
  )

  const isBusy = isClearing || isTransferring

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
      <div ref={flowContainerRef} className="relative h-full min-w-0 flex-1">
      {isBusy && <div className="absolute inset-0 z-50 cursor-wait" aria-hidden="true" />}
      <div className="absolute left-4 top-4 z-10 flex items-start gap-2">
        <CanvasToolsMenu
          activeTool={activeTool}
          onSelect={(tool) =>
            setActiveTool((current) => (current === tool ? null : tool))
          }
        />
        <TerminalMenu
          projects={projects}
          onAdd={addTerminalNode}
          onAddFolder={addProjectFolder}
        />
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

        <button
          type="button"
          onClick={() => void exportAll()}
          disabled={isBusy}
          className="flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-100 shadow-lg ring-1 ring-white/10 hover:bg-zinc-700 disabled:opacity-60"
          title="Exportar canvas para um arquivo portátil"
        >
          <Download size={16} />
          Exportar
        </button>

        <button
          type="button"
          onClick={() => importInputRef.current?.click()}
          disabled={isBusy}
          className="flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-100 shadow-lg ring-1 ring-white/10 hover:bg-zinc-700 disabled:opacity-60"
          title="Importar canvas de outro computador"
        >
          <Upload size={16} />
          Importar
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept=".fxcanvas,application/json"
          onChange={(event) => void importFile(event)}
          className="hidden"
        />

        <button
          type="button"
          onClick={() => void clearAll()}
          disabled={isBusy}
          className="flex items-center gap-2 rounded-lg bg-red-950/80 px-3 py-2 text-sm text-red-100 shadow-lg ring-1 ring-red-500/20 hover:bg-red-900 disabled:cursor-wait disabled:opacity-60"
          title="Excluir todos os blocos, conexões e arquivos .md do canvas"
        >
          <Trash2 size={16} />
          {isClearing ? 'Limpando...' : 'Limpar'}
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
          onBootstrapSaved={(prompt) => {
            bootstrapPromptRef.current = prompt
          }}
          onQualityStandardSaved={(value) => {
            qualityStandardRef.current = value
          }}
        />
      )}

        <ReactFlow
          key={canvasRevision}
          nodes={orderedNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onInit={(instance) => {
            flowInstanceRef.current = instance
          }}
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

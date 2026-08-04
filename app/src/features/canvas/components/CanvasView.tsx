// Tela principal do canvas: orquestra os blocos (terminais, notas, arquivos,
// grupos), suas conexões e a persistência. Geometria pura vive em
// services/node-geometry.ts, as regras de ligação arquivo↔terminal em
// services/file-terminal-links.ts, e a UI de toolbar/painéis em
// CanvasToolbar.tsx e CanvasToolPanels.tsx.
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
  type MiniMapNodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { TerminalNode } from './TerminalNode'
import { NoteNode } from './NoteNode'
import { GroupNode } from './GroupNode'
import { FileNode } from './FileNode'
import { TerminalDrawer } from './TerminalDrawer'
import { NODE_DRAG_HANDLE_CLASS } from './NodeHeader'
import { CanvasToolbar } from './CanvasToolbar'
import { CanvasToolPanels } from './CanvasToolPanels'
import { TerminalsPanel } from './tools/TerminalsPanel'
import { NotificationsPanel } from './NotificationsPanel'
import { TerminalSessionProvider } from '../terminal/TerminalSessionProvider'
import { useSessionSnapshots, useTerminalSessions } from '../terminal/terminal-session-context'
import { isActionRequired } from '../terminal/session-notifications'
import {
  DEFAULT_FILE_LINK_PROMPT,
  DEFAULT_FILE_BOOTSTRAP_PROMPT,
} from '../services/file-link-prompt'
import {
  buildPlanningFileInstruction,
  DEFAULT_QUALITY_STANDARD_PROMPT,
  buildCanvasTerminalInitialText,
  composeTerminalInitialText,
  resolveTerminalInitialText,
} from '../services/quality-standard-prompt'
import { toSubmittedTerminalText } from '../terminal/terminal-input'
import { buildSkillActivationPrompt } from '../services/skill-prompt'
import { isKnownAgentCommand } from '../services/agent-launch-options'
import type { CanvasTool } from './tools/CanvasToolsMenu'
import type { SkillActivationResult } from './tools/SkillsPanel'
import { useCanvasPersistence } from '../hooks/useCanvasPersistence'
import { useCanvasProjects } from '../hooks/useCanvasProjects'
import { useCanvasTransfer } from '../hooks/useCanvasTransfer'
import {
  deleteCanvasEdge,
  loadCanvasEdges,
  saveCanvasEdge,
} from '../services/canvas-storage'
import {
  DEFAULT_SIZE,
  findFreeNodePosition,
  findFreeNodePositions,
  getNodeSize,
  isInside,
  nearestSides,
  type CanvasBounds,
} from '../services/node-geometry'
import {
  agentLabelOf,
  announceFileNodeToTerminalNode,
  announceFileToTerminal,
  getConnectedCanvasFileNames,
  getLinkedAgentIds,
  requestRepoDiagnosis,
} from '../services/file-terminal-links'
import type { CanvasNodeType, CanvasSkill, DiagnosisRequestStatus } from '../types'

type FlowPositionMapper = {
  screenToFlowPosition: (position: { x: number; y: number }) => {
    x: number
    y: number
  }
  setCenter: (
    x: number,
    y: number,
    options?: { zoom?: number; duration?: number },
  ) => void
  fitView: (options?: { padding?: number; duration?: number }) => void
}

type NodeDataCacheEntry = {
  deps: unknown[]
  data: Record<string, unknown>
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

/** Human name → safe .md filename fragment (no accents/spaces/specials). */
function slugifyFileName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

type CanvasViewProps = {
  /** Switches the app to the chat screen. Rendered as a toolbar button so it
   * lives with the other auxiliary controls instead of floating over canvas
   * content (terminal windows can be panned/dragged under any screen corner). */
  onOpenChat: () => void
}

export function CanvasView({ onOpenChat }: CanvasViewProps) {
  return (
    <TerminalSessionProvider>
      <CanvasInner onOpenChat={onOpenChat} />
    </TerminalSessionProvider>
  )
}

function CanvasInner({ onOpenChat }: CanvasViewProps) {
  const store = useTerminalSessions()
  const {
    nodes,
    setNodes,
    hydrated,
    persistNode,
    removeNode,
    cancelPendingSaves,
  } = useCanvasPersistence()
  const [edges, setEdges] = useEdgesState<Edge>([])
  const [edgesHydrated, setEdgesHydrated] = useState(false)
  const [terminalCanvasFilePaths, setTerminalCanvasFilePaths] = useState<
    Record<string, string[]>
  >({})
  const { projects, reloadProjects, addProjectFolder } = useCanvasProjects()
  const [expandedTerminalId, setExpandedTerminalId] = useState<string | null>(null)
  // 'select' = drag draws a selection box; 'pan' = drag grabs and moves the canvas.
  const [canvasMode, setCanvasMode] = useState<'select' | 'pan'>('select')
  const [activeTool, setActiveTool] = useState<CanvasTool | null>(null)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const sessionSnapshots = useSessionSnapshots()
  const notificationCount = nodes.filter(
    (node) => node.type === 'terminal' && isActionRequired(sessionSnapshots[node.id]),
  ).length
  const miniMapNode = useCallback(
    (props: MiniMapNodeProps) => {
      const node = nodes.find((item) => item.id === props.id)
      const isAgent = node?.type === 'terminal'
      const label = isAgent
        ? String(node.data.label || node.data.command || 'Agente')
        : ''
      const labelFontSize = Math.max(10, Math.min(props.height * 0.22, props.width * 0.08))

      return (
        <g>
          <rect
            x={props.x}
            y={props.y}
            width={props.width}
            height={props.height}
            rx={props.borderRadius}
            fill={props.color || '#3f3f46'}
            stroke={props.strokeColor || '#52525b'}
            strokeWidth={props.strokeWidth}
          />
          {label && (
            <text
              x={props.x + 5}
              y={props.y + props.height / 2}
              fill="#f4f4f5"
              fontSize={labelFontSize}
              fontWeight="600"
              fontFamily="sans-serif"
              dominantBaseline="middle"
              textLength={Math.max(1, props.width - 10)}
              lengthAdjust="spacingAndGlyphs"
              pointerEvents="none"
            >
              {label}
            </text>
          )}
        </g>
      )
    },
    [nodes],
  )
  const {
    isClearing,
    isBusy,
    canvasRevision,
    clearAll,
    exportAll,
    importFile,
  } = useCanvasTransfer({
    nodes,
    edges,
    store,
    cancelPendingSaves,
    persistNode,
    setNodes,
    setEdges,
    onReset: () => {
      setExpandedTerminalId(null)
      setActiveTool(null)
    },
  })
  // Editable instructions injected when a file links to a terminal: the normal
  // shared-scratchpad prompt, and the bootstrap prompt for the empty-md-in-repo case.
  const fileLinkPromptRef = useRef(DEFAULT_FILE_LINK_PROMPT)
  const bootstrapPromptRef = useRef(DEFAULT_FILE_BOOTSTRAP_PROMPT)
  // Standing "follow the quality standard" instruction for agent terminals.
  // State drives the rendered-nodes memo (so a backend load or a settings save
  // recomputes each terminal's initialText); the ref mirrors it for callbacks
  // that read it outside render (addTerminalNode).
  const [qualityStandard, setQualityStandard] = useState({
    prompt: DEFAULT_QUALITY_STANDARD_PROMPT,
    enabled: true,
  })
  const qualityStandardRef = useRef(qualityStandard)
  const applyQualityStandard = useCallback(
    (value: { prompt: string; enabled: boolean }) => {
      qualityStandardRef.current = value
      setQualityStandard(value)
    },
    [],
  )
  // Agent terminals that already existed on disk the moment the app booted —
  // i.e. left open from a previous run, so whatever they were doing may not
  // have finished. Captured once, right when hydration lands, from the raw
  // persisted list (before any node created *this* session can join it).
  // Used to type "/resume" instead of the usual standing instruction on
  // their first spawn this session; never touches persisted data (read by
  // the render-only nodes memo below, not by anything that gets saved). State
  // (not a ref) so the memo below reactively recomputes once this lands.
  const [restoredAgentTerminalIds, setRestoredAgentTerminalIds] = useState<Set<string>>(
    () => new Set(),
  )
  const restoredAgentTerminalIdsCapturedRef = useRef(false)
  useEffect(() => {
    if (!hydrated || restoredAgentTerminalIdsCapturedRef.current) {
      return
    }
    restoredAgentTerminalIdsCapturedRef.current = true
    setRestoredAgentTerminalIds(
      new Set(
        nodes
          .filter((node) => node.type === 'terminal' && isKnownAgentCommand(node.data.command))
          .map((node) => node.id),
      ),
    )
  }, [hydrated, nodes])
  const flowContainerRef = useRef<HTMLDivElement>(null)
  const flowInstanceRef = useRef<FlowPositionMapper | null>(null)
  // Mirrors of nodes/edges for callbacks injected into node data. Reading via
  // refs keeps those callbacks referentially stable, so dragging one block
  // doesn't invalidate the injected data of every other block (see the
  // rendered-nodes cache below).
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  // Per-node cache of injected data objects: while a node's inputs don't
  // change, the same data object is reused, letting React.memo skip re-renders
  // of untouched blocks during drags/pans — important on low-end hardware.
  // Held in useState (not a ref) so it can be read inside useMemo during
  // render; the Map instance is stable across renders.
  const [nodeDataCache] = useState(
    () => new Map<string, NodeDataCacheEntry>(),
  )

  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])

  useEffect(() => {
    edgesRef.current = edges
  }, [edges])

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
        applyQualityStandard({
          prompt:
            typeof result.prompt === 'string' && result.prompt.trim()
              ? result.prompt
              : DEFAULT_QUALITY_STANDARD_PROMPT,
          enabled: result.enabled !== false,
        })
      }
    })
  }, [applyQualityStandard])

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
    void loadCanvasEdges()
      .then((loaded) => {
        if (!cancelled) {
          setEdges(loaded)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setEdgesHydrated(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [setEdges])

  useEffect(() => {
    if (!edgesHydrated) {
      return
    }

    let cancelled = false

    async function resolveConnectedCanvasFiles() {
      const nextPaths: Record<string, string[]> = {}
      const terminalNodes = nodes.filter((node) => node.type === 'terminal')

      await Promise.all(
        terminalNodes.map(async (terminalNode) => {
          const fileNames = getConnectedCanvasFileNames(terminalNode.id, nodes, edges)
          if (fileNames.length === 0) {
            return
          }

          const resolved = await Promise.all(
            fileNames.map((name) => window.felixo?.canvasFiles?.resolve({ name })),
          )
          const paths = resolved.flatMap((result) =>
            result?.ok && result.path ? [result.path] : [],
          )
          if (paths.length > 0) {
            nextPaths[terminalNode.id] = paths
          }
        }),
      )

      if (!cancelled) {
        setTerminalCanvasFilePaths(nextPaths)
      }
    }

    void resolveConnectedCanvasFiles()

    return () => {
      cancelled = true
    }
  }, [edges, edgesHydrated, nodes])

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

  // Renaming a terminal in the canvas only relabels the block on our side —
  // the agent inside keeps calling itself by its old name unless told
  // otherwise. Fired once the rename is committed (blur/Enter), not per
  // keystroke like `updateNodeData`, so the agent isn't spammed while the
  // user is still typing the new name.
  const notifyTerminalRenamed = useCallback(
    (nodeId: string, label: string) => {
      const trimmed = label.trim()
      if (!trimmed) {
        return
      }
      store.sendText(
        nodeId,
        toSubmittedTerminalText(`A partir de agora, seu nome neste canvas é "${trimmed}".`),
      )
    },
    [store],
  )

  // Manual repo-diagnosis: the file block (in "plan" mode) asks its connected
  // terminal's agent to survey the repo and write the diagnosis into the file.
  const generateDiagnosis = useCallback(
    async (fileNodeId: string): Promise<DiagnosisRequestStatus> =>
      requestRepoDiagnosis(
        fileNodeId,
        nodesRef.current,
        edgesRef.current,
        store,
        bootstrapPromptRef.current,
      ),
    [store],
  )

  // "+ Ligar agente" on a file block: create the edge (if missing) and tell the
  // agent about the file — the same outcome as dragging a wire between them.
  const linkAgentToFile = useCallback(
    (fileNodeId: string, agentId: string) => {
      const already = edgesRef.current.some(
        (edge) =>
          (edge.source === fileNodeId && edge.target === agentId) ||
          (edge.source === agentId && edge.target === fileNodeId),
      )
      if (!already) {
        const edge: Edge = {
          id: `edge-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`,
          source: fileNodeId,
          target: agentId,
        }
        setEdges((current) => [...current, edge])
        void saveCanvasEdge(edge)
      }

      const fileNode = nodesRef.current.find((node) => node.id === fileNodeId)
      const terminalNode = nodesRef.current.find((node) => node.id === agentId)
      if (fileNode && terminalNode?.type === 'terminal') {
        void announceFileNodeToTerminalNode(
          fileNode,
          terminalNode,
          store,
          fileLinkPromptRef.current,
        )
      }
    },
    [setEdges, store],
  )

  // Remove every edge between a file block and an agent (the "desligar" action).
  const unlinkAgentFromFile = useCallback(
    (fileNodeId: string, agentId: string) => {
      const removed = edgesRef.current.filter(
        (edge) =>
          (edge.source === fileNodeId && edge.target === agentId) ||
          (edge.source === agentId && edge.target === fileNodeId),
      )
      if (removed.length === 0) {
        return
      }
      setEdges((current) =>
        current.filter((edge) => !removed.some((gone) => gone.id === edge.id)),
      )
      removed.forEach((edge) => void deleteCanvasEdge(edge.id))
    },
    [setEdges],
  )

  // Search → navigate: center+zoom the canvas on a block and select only it.
  const focusNode = useCallback(
    (nodeId: string) => {
      const node = nodes.find((item) => item.id === nodeId)
      if (!node) {
        return
      }
      const size = getNodeSize(node)
      flowInstanceRef.current?.setCenter(
        node.position.x + size.width / 2,
        node.position.y + size.height / 2,
        { zoom: 1.2, duration: 400 },
      )
      setNodes((current) =>
        current.map((item) => ({ ...item, selected: item.id === nodeId })),
      )
    },
    [nodes, setNodes],
  )

  // Activate a skill: type its "use the file at <path>" instruction into the
  // expanded terminal if one is open; otherwise copy it for manual pasting.
  const activateSkill = useCallback(
    async (skill: CanvasSkill): Promise<SkillActivationResult> => {
      const prompt = buildSkillActivationPrompt(skill)
      if (expandedTerminalId) {
        store.sendText(expandedTerminalId, prompt)
        return 'sent'
      }
      await navigator.clipboard?.writeText(prompt)
      return 'copied'
    },
    [expandedTerminalId, store],
  )

  // Insert a pre-built automation prompt into the expanded terminal if one is
  // open; otherwise copy it for manual pasting, same fallback as skills.
  const insertPrompt = useCallback(
    async (prompt: string): Promise<SkillActivationResult> => {
      if (expandedTerminalId) {
        store.sendText(expandedTerminalId, toSubmittedTerminalText(prompt))
        return 'sent'
      }
      await navigator.clipboard?.writeText(prompt)
      return 'copied'
    },
    [expandedTerminalId, store],
  )

  // Inject render-time concerns: the header drag handle (so only the header
  // moves the node) and, for notes/groups, the edit handler. Keeping these out
  // of stored state means persisted data stays plain JSON.
  //
  // The injected data objects are cached per node and only rebuilt when their
  // actual inputs change. Position changes (drag/resize) recreate the outer
  // node objects but reuse the same data reference, so React.memo keeps every
  // untouched block from re-rendering — the main render cost on weak GPUs.
  const renderedNodes = useMemo(() => {
    const previousCache = new Map(nodeDataCache)
    const nextCache = nodeDataCache
    nextCache.clear()
    const reuseData = (
      id: string,
      deps: unknown[],
      build: () => Record<string, unknown>,
    ) => {
      const cached = previousCache.get(id)
      if (
        cached &&
        cached.deps.length === deps.length &&
        cached.deps.every((dep, index) => dep === deps[index])
      ) {
        nextCache.set(id, cached)
        return cached.data
      }
      const entry = { deps, data: build() }
      nextCache.set(id, entry)
      return entry.data
    }

    // 1-based position among currently open terminals, in creation order
    // (nodes are appended, never reordered, so array order == creation
    // order). Recomputed every render, so closing a terminal shifts the
    // numbers of the ones after it instead of leaving a gap.
    let terminalCount = 0
    const terminalOrder = new Map<string, number>()
    for (const item of nodes) {
      if (item.type === 'terminal') {
        terminalCount += 1
        terminalOrder.set(item.id, terminalCount)
      }
    }

    const rendered = nodes.map((node) => {
      const withHandle = { ...node, dragHandle: `.${NODE_DRAG_HANDLE_CLASS}` }

      if (node.type === 'file') {
        const linkedIds = getLinkedAgentIds(node.id, edges)
        const terminals = nodes.filter((item) => item.type === 'terminal')
        const agentsSignature = terminals
          .map(
            (terminal) =>
              `${linkedIds.has(terminal.id) ? '+' : '-'}${terminal.id}:${agentLabelOf(terminal)}`,
          )
          .join('|')

        return {
          ...withHandle,
          data: reuseData(node.id, [node.data, agentsSignature], () => {
            const connectedAgents = terminals
              .filter((terminal) => linkedIds.has(terminal.id))
              .map((terminal) => ({ id: terminal.id, label: agentLabelOf(terminal) }))
            const availableAgents = terminals
              .filter((terminal) => !linkedIds.has(terminal.id))
              .map((terminal) => ({ id: terminal.id, label: agentLabelOf(terminal) }))

            return {
              ...node.data,
              onDataChange: updateNodeData,
              onGenerateDiagnosis: generateDiagnosis,
              connectedAgents,
              availableAgents,
              onLinkAgent: linkAgentToFile,
              onUnlinkAgent: unlinkAgentFromFile,
            }
          }),
        }
      }

      if (node.type === 'note' || node.type === 'group') {
        return {
          ...withHandle,
          data: reuseData(node.id, [node.data], () => ({
            ...node.data,
            onDataChange: updateNodeData,
          })),
        }
      }

      if (node.type === 'terminal') {
        const quality = qualityStandard
        const connectedFileNames = getConnectedCanvasFileNames(node.id, nodes, edges)
        const canvasFilePaths = terminalCanvasFilePaths[node.id] ?? []
        const initialTextReady =
          edgesHydrated &&
          (connectedFileNames.length === 0 ||
            canvasFilePaths.length >= connectedFileNames.length)
        // Left open from a previous run: whatever it was doing may not have
        // finished, so type "/resume" on this (re)spawn instead of the usual
        // standing instruction — see restoredAgentTerminalIds above.
        const fallbackInitialText = resolveTerminalInitialText({
          isRestoredAgent: restoredAgentTerminalIds.has(node.id),
          qualityStandardEnabled: quality.enabled,
          qualityStandardPrompt: quality.prompt,
          hasCommand: isKnownAgentCommand(node.data.command),
          existingInitialText: node.data.initialText,
          canvasFilePaths,
          identity: { agentName: node.data.label, cwd: node.data.cwd },
        })
        const terminalIndex = terminalOrder.get(node.id)

        return {
          ...withHandle,
          data: reuseData(
            node.id,
            [node.data, fallbackInitialText, initialTextReady, terminalIndex],
            () => ({
              ...node.data,
              ...(fallbackInitialText ? { initialText: fallbackInitialText } : {}),
              initialTextReady,
              terminalIndex,
              onExpand: setExpandedTerminalId,
              onDataChange: updateNodeData,
              onRenameCommit: notifyTerminalRenamed,
            }),
          ),
        }
      }

      return withHandle
    })

    return rendered
  }, [
    nodeDataCache,
    edges,
    edgesHydrated,
    generateDiagnosis,
    linkAgentToFile,
    notifyTerminalRenamed,
    nodes,
    qualityStandard,
    restoredAgentTerminalIds,
    terminalCanvasFilePaths,
    unlinkAgentFromFile,
    updateNodeData,
  ])

  // Groups must render before their children so they sit behind them.
  const orderedNodes = useMemo(() => {
    const groups = renderedNodes.filter((node) => node.type === 'group')
    const rest = renderedNodes.filter((node) => node.type !== 'group')
    return [...groups, ...rest]
  }, [renderedNodes])

  // Route each edge through the handles on the facing sides of its two nodes,
  // computed from their current positions. Handles aren't persisted, so without
  // this every edge (button- or drag-created) falls back to the top handle.
  // Recomputing here also re-routes wires as nodes are dragged around.
  const edgesWithHandles = useMemo(() => {
    const byId = new Map(nodes.map((node) => [node.id, node]))
    return edges.map((edge) => {
      const source = byId.get(edge.source)
      const target = byId.get(edge.target)
      if (!source || !target) {
        return edge
      }
      const sides = nearestSides(source, target)
      return {
        ...edge,
        sourceHandle: `s-${sides.source}`,
        targetHandle: `t-${sides.target}`,
      }
    })
  }, [edges, nodes])

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

  // Flow-space bounds of what's currently visible, used to prefer placing new
  // nodes in view. `undefined` before the flow instance/container are ready
  // (e.g. very first render) — callers fall back to a fixed origin then.
  const visibleCanvasBounds = useCallback((): CanvasBounds | undefined => {
    const container = flowContainerRef.current
    const flowInstance = flowInstanceRef.current
    if (!container || !flowInstance) {
      return undefined
    }

    const bounds = container.getBoundingClientRect()
    const topLeft = flowInstance.screenToFlowPosition({ x: bounds.left, y: bounds.top })
    const bottomRight = flowInstance.screenToFlowPosition({
      x: bounds.right,
      y: bounds.bottom,
    })
    return {
      x: topLeft.x,
      y: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y,
    }
  }, [])

  const addNode = useCallback(
    (type: CanvasNodeType, data?: Record<string, unknown>) => {
      const id = `${type}-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`
      const size = DEFAULT_SIZE[type]

      const node: Node = {
        id,
        type,
        position: findFreeNodePosition(nodes, size, visibleCanvasBounds()),
        width: size.width,
        height: size.height,
        data: data ?? (type === 'terminal' ? { label: 'Terminal' } : { text: '' }),
      }

      setNodes((current) => [...current, node])
      persistNode(node)
    },
    [nodes, setNodes, persistNode, visibleCanvasBounds],
  )

  const addFileNode = useCallback(
    (name?: string) => {
      // The on-disk name stays unique via timestamp; the human name goes in the
      // label (header + search) and prefixes the slug so agents see it in paths.
      const slug = name ? slugifyFileName(name) : ''
      const fileName = `${slug || 'nota'}-${Date.now()}.md`
      // Create the file on disk so it exists for agents and the watcher.
      void window.felixo?.canvasFiles?.write({ name: fileName, content: '' })
      addNode('file', { fileName, label: name?.trim() || fileName })
    },
    [addNode],
  )

  const buildTerminalNodeData = useCallback(
    (options: { command?: string; args?: string[]; cwd?: string; label: string; planningFile?: string }) => {
      // Agent terminals get the standing quality-standard instruction (if on)
      // plus their canvas identity (name, cwd, multi-agent setting); a plain
      // shell does not (there's no agent to read it).
      const quality = qualityStandardRef.current
      const planningInstruction = buildPlanningFileInstruction(options.planningFile)
      const initialText = options.command
        ? composeTerminalInitialText(
            quality.enabled
              ? buildCanvasTerminalInitialText(quality.prompt, undefined, [], {
                  agentName: options.label,
                  cwd: options.cwd,
                })
              : undefined,
            planningInstruction,
          )
        : undefined

      return {
        label: options.label,
        ...(options.command ? { command: options.command } : {}),
        ...(options.args && options.args.length ? { args: options.args } : {}),
        ...(options.cwd ? { cwd: options.cwd } : {}),
        ...(initialText ? { initialText } : {}),
      }
    },
    [],
  )

  const addTerminalNode = useCallback(
    (options: { command?: string; args?: string[]; cwd?: string; label: string; planningFile?: string }) => {
      addNode('terminal', buildTerminalNodeData(options))
    },
    [addNode, buildTerminalNodeData],
  )

  // Starts several terminals at once (e.g. a whole agent setup) instead of
  // one `addNode` call per config: those go through the same `nodes` state
  // closure, so back-to-back calls in the same tick would all place against
  // the pre-batch list and stack on top of each other. `findFreeNodePositions`
  // (pure, tested in node-geometry.test.ts) computes all positions together
  // against a growing local list, then everything lands in a single
  // `setNodes` + one `persistNode` per node.
  const addTerminalNodes = useCallback(
    (optionsList: { command?: string; args?: string[]; cwd?: string; label: string; planningFile?: string }[]) => {
      if (optionsList.length === 0) {
        return
      }

      const size = DEFAULT_SIZE.terminal
      const positions = findFreeNodePositions(
        nodes,
        optionsList.length,
        size,
        visibleCanvasBounds(),
      )
      const newNodes = optionsList.map(
        (options, index): Node => ({
          id: `terminal-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`,
          type: 'terminal',
          position: positions[index],
          width: size.width,
          height: size.height,
          data: buildTerminalNodeData(options),
        }),
      )

      setNodes((current) => [...current, ...newNodes])
      newNodes.forEach((node) => persistNode(node))
    },
    [nodes, setNodes, persistNode, buildTerminalNodeData, visibleCanvasBounds],
  )

  // "Run this file" from the Projects panel: the terminal's process IS the
  // file running (command = interpreter, args = [file]) — unlike agent
  // terminals, nothing gets typed into it afterwards, so no initialText.
  const runFileInTerminal = useCallback(
    (options: { command: string; args: string[]; cwd: string; label: string }) => {
      addNode('terminal', {
        label: options.label,
        command: options.command,
        ...(options.args.length ? { args: options.args } : {}),
        cwd: options.cwd,
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
  const expandedNodeData = expandedNode?.data as
    | { label?: string; command?: string; args?: string[]; cwd?: string; initialText?: string }
    | undefined
  const expandedTitle = expandedNodeData?.label ?? 'Terminal'

  return (
    <div className="flex h-full w-full">
      <div ref={flowContainerRef} className="relative h-full min-w-0 flex-1">
      {isBusy && <div className="absolute inset-0 z-50 cursor-wait" aria-hidden="true" />}
      <CanvasToolbar
        activeTool={activeTool}
        onSelectTool={(tool) =>
          setActiveTool((current) => (current === tool ? null : tool))
        }
        projects={projects}
        onAddTerminal={addTerminalNode}
        onAddTerminals={addTerminalNodes}
        onAddFolder={addProjectFolder}
        onRunFile={runFileInTerminal}
        onAddNote={(name) =>
          addNode('note', { text: '', ...(name ? { label: name } : {}) })
        }
        onAddFile={addFileNode}
        onAddGroup={(name) => addNode('group', { label: name || 'Grupo' })}
        canvasMode={canvasMode}
        onToggleMode={() =>
          setCanvasMode((mode) => (mode === 'select' ? 'pan' : 'select'))
        }
        onFitView={() =>
          flowInstanceRef.current?.fitView({ padding: 0.15, duration: 400 })
        }
        onExport={() => void exportAll()}
        onImportFile={(event) => void importFile(event)}
        onClear={() => void clearAll()}
        isBusy={isBusy}
        isClearing={isClearing}
        onOpenChat={onOpenChat}
        onOpenNotifications={() => setNotificationsOpen((open) => !open)}
        notificationCount={notificationCount}
      />

      <NotificationsPanel
        nodes={nodes}
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        onFocusNode={focusNode}
        onExpandNode={setExpandedTerminalId}
      />

      <CanvasToolPanels
        activeTool={activeTool}
        onClose={() => setActiveTool(null)}
        nodes={nodes}
        onFocusNode={focusNode}
        onAddNote={() => addNode('note', { text: '' })}
        onProjectsChanged={reloadProjects}
        onActivateSkill={activateSkill}
        onInsertPrompt={insertPrompt}
        onPromptSaved={(prompt) => {
          fileLinkPromptRef.current = prompt
        }}
        onBootstrapSaved={(prompt) => {
          bootstrapPromptRef.current = prompt
        }}
        onQualityStandardSaved={applyQualityStandard}
      />

      <TerminalsPanel
        nodes={nodes}
        activeTerminalId={expandedTerminalId}
        onFocusNode={focusNode}
        onExpandNode={setExpandedTerminalId}
      />

        <ReactFlow
          key={canvasRevision}
          nodes={orderedNodes}
          edges={edgesWithHandles}
          nodeTypes={nodeTypes}
          onInit={(instance) => {
            flowInstanceRef.current = instance
          }}
          onNodesChange={onNodesChange}
          onNodeDragStop={onNodeDragStop}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
          // React Flow's default minZoom (0.5) blocks "Ver tudo"/fitView from
          // zooming out enough to frame a spread-out canvas on one screen.
          minZoom={0.05}
          // Skip rendering blocks outside the viewport — with several terminal
          // blocks (xterm) mounted, this is the biggest win on modest hardware.
          onlyRenderVisibleElements
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
          // No Space-to-pan: React Flow's panActivationKeyCode fires globally,
          // even while typing in a terminal/field, swallowing the space bar.
          // Pan is reachable via 'Q' (toggle) and middle/right-drag instead.
          panActivationKeyCode={null}
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
            nodeComponent={miniMapNode}
          />
        </ReactFlow>
      </div>

      {expandedTerminalId && (
        <TerminalDrawer
          sessionId={expandedTerminalId}
          title={expandedTitle}
          restartOptions={{
            command: expandedNodeData?.command,
            args: expandedNodeData?.args,
            cwd: expandedNodeData?.cwd,
            initialText: expandedNodeData?.initialText,
          }}
          onClose={() => setExpandedTerminalId(null)}
        />
      )}
    </div>
  )
}

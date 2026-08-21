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
import { WebpageNode } from './WebpageNode'
import { TerminalDrawer } from './TerminalDrawer'
import { TerminalDetailsPanel } from './TerminalDetailsPanel'
import { NODE_DRAG_HANDLE_CLASS } from './NodeHeader'
import {
  countTerminalOrder,
  createNodeDataReuse,
  type NodeDataCacheEntry,
} from '../services/node-data-cache'
import { CanvasToolbar } from './CanvasToolbar'
import { UpdateToast } from '../../updates/UpdateNotice'
import { CliSetupToast } from '../../setup/CliSetupNotice'
import { useUpdateStatus } from '../../updates/useUpdateStatus'
import { CanvasToolPanels } from './CanvasToolPanels'
import { TerminalsPanel } from './tools/TerminalsPanel'
import { moveById } from './tools/terminals-panel-reorder'
import { NotificationsPanel } from './NotificationsPanel'
import { NotificationsMenu } from './NotificationsMenu'
import { TerminalSessionProvider } from '../terminal/TerminalSessionProvider'
import { useSessionSnapshots, useTerminalSessions } from '../terminal/terminal-session-context'
import {
  findNewNotificationIds,
  getActionRequiredNodeIds,
} from '../terminal/session-notifications'
import {
  appendCanvasNotifications,
  clearReadCanvasNotifications,
  countUnreadCanvasNotifications,
  markAllCanvasNotificationsRead,
  markCanvasNotificationRead,
  markCanvasNotificationsReadForNode,
  pruneCanvasNotifications,
  removeCanvasNotification,
  type CanvasNotification,
} from '../terminal/canvas-notifications'
import {
  readNotificationHistory,
  saveNotificationHistory,
} from '../services/notification-history-storage'
import {
  readNotificationPreferences,
  saveNotificationPreferences,
} from '../services/notification-preferences'
import {
  DEFAULT_FILE_LINK_PROMPT,
  DEFAULT_FILE_BOOTSTRAP_PROMPT,
} from '../services/file-link-prompt'
import {
  buildPlanningFileInstruction,
  DEFAULT_QUALITY_STANDARD_PROMPT,
  buildCanvasTerminalInitialText,
  buildQualityStandardMessage,
  composeTerminalInitialText,
  isTerminalInitialTextReady,
  resolveTerminalInitialText,
} from '../services/quality-standard-prompt'
import { stripTerminalSubmission, toSubmittedTerminalText } from '../terminal/terminal-input'
import { buildSkillActivationPrompt } from '../services/skill-prompt'
import { isKnownAgentCommand } from '../services/agent-launch-options'
import type { RunFileOptions } from '../services/run-file-command'
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
import { announceAgentCollaboration } from '../services/agent-collaboration-links'
import {
  buildTerminalHandoffPrompt,
} from '../services/terminal-handoff'
import type { NewTerminalOptions } from '../services/new-terminal-options'
import { HandoffDialog } from './HandoffDialog'
import {
  arrangeNodesAsMatrix,
  countArrangeableNodes,
} from '../services/canvas-matrix-layout'
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
  /** Enquadra uma área do canvas — usado para mostrar a matriz recém-organizada. */
  fitBounds: (
    bounds: { x: number; y: number; width: number; height: number },
    options?: { padding?: number; duration?: number },
  ) => void
}

type RestoredAgentTerminals = {
  captured: boolean
  ids: ReadonlySet<string>
}

const AGENT_MATRIX_MOVING_CLASS = 'felixo-agent-matrix-moving'
/** Must match `.felixo-agent-matrix-moving` in index.css. */
const AGENT_MATRIX_ANIMATION_MS = 820

function addCssClass(current: string | undefined, added: string): string {
  return [...new Set([...(current?.split(/\s+/) ?? []), added].filter(Boolean))].join(' ')
}

function removeCssClass(current: string | undefined, removed: string): string | undefined {
  const next = (current?.split(/\s+/) ?? []).filter(
    (className) => className && className !== removed,
  )
  return next.length > 0 ? next.join(' ') : undefined
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
  const updates = useUpdateStatus()
  // Declarado (e sincronizado) aqui, antes de qualquer efeito que o consuma:
  // o compilador do React proíbe modificar um ref que um efeito anterior já
  // leu, e a poda horária de notificações lá embaixo lê justamente este.
  // Mantido em ref para os callbacks que o usam continuarem estáveis — assim
  // arrastar um bloco não invalida os dados injetados de todos os outros.
  const nodesRef = useRef(nodes)
  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])
  const [edges, setEdges] = useEdgesState<Edge>([])
  const [edgesHydrated, setEdgesHydrated] = useState(false)
  const [terminalCanvasFilePaths, setTerminalCanvasFilePaths] = useState<
    Record<string, string[]>
  >({})
  const { projects, reloadProjects, addProjectFolder, removeProjectFolder } = useCanvasProjects()
  const [expandedTerminalId, setExpandedTerminalId] = useState<string | null>(null)
  const [detailsTerminalId, setDetailsTerminalId] = useState<string | null>(null)
  // Passagem de responsabilidade em andamento: o histórico é capturado no
  // momento do clique, e não quando o usuário confirma — do contrário o agente
  // de origem continuaria escrevendo enquanto o diálogo está aberto e o
  // destino receberia um histórico diferente do que estava na tela.
  const [handoff, setHandoff] = useState<{ sourceId: string; transcript: string } | null>(
    null,
  )
  // 'select' = drag draws a selection box; 'pan' = drag grabs and moves the canvas.
  const [canvasMode, setCanvasMode] = useState<'select' | 'pan'>('select')
  const [activeTool, setActiveTool] = useState<CanvasTool | null>(null)
  // Espelha a largura da coluna da toolbar para os painéis de ferramenta, que
  // são irmãos dela e abrem ao lado em vez de por cima.
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  // Measured live from the bell+panel's actual DOM height (ResizeObserver in
  // NotificationsMenu), not guessed — a fixed offset broke as soon as the
  // notification list grew past whatever number was hardcoded here.
  const [, setNotificationsTriggerHeight] = useState(52)
  // Same idea for the bottom-right "Elementos" dock: both it and the
  // notifications panel are independent floating panels that can each grow
  // tall enough to reach the other (dock grows up from the bottom, panel
  // grows down from the top) — measuring the dock's real height lets the
  // panel cap itself before the two ever collide.
  const [terminalsDockHeight, setTerminalsDockHeight] = useState(0)
  const sessionSnapshots = useSessionSnapshots()
  const actionableNotificationIds = useMemo(
    () => getActionRequiredNodeIds(nodes, sessionSnapshots),
    [nodes, sessionSnapshots],
  )
  const [notificationHistory, setNotificationHistory] = useState<CanvasNotification[]>(
    () => readNotificationHistory(),
  )
  const [notificationSoundEnabled, setNotificationSoundEnabled] = useState(
    () => readNotificationPreferences().soundEnabled,
  )
  const [notificationVolume, setNotificationVolume] = useState(
    () => readNotificationPreferences().volume,
  )
  // Restored ids carry their original sequence numbers; resume past the highest
  // one so a new notification can never reuse an id still in the history.
  const notificationSequenceRef = useRef(
    notificationHistory.reduce((highest, notification) => {
      const sequence = Number(notification.id.split(':').pop())
      return Number.isFinite(sequence) ? Math.max(highest, sequence + 1) : highest
    }, 0),
  )
  const notificationAudioRef = useRef<HTMLAudioElement | null>(null)
  const previousNotificationIdsRef = useRef<ReadonlySet<string>>(new Set())
  // Seeded from the restored unread items so an agent that is still idle after a
  // reload doesn't produce a second notification for the same turn.
  const activeNotificationNodeIdsRef = useRef(
    new Set(
      notificationHistory
        .filter((notification) => notification.readAt === null)
        .map((notification) => notification.nodeId),
    ),
  )
  const acknowledgedNotificationPromptsRef = useRef(new Map<string, string | undefined>())
  const notificationIdsInitializedRef = useRef(false)

  useEffect(() => {
    // Caminho relativo, não absoluto: o app empacotado carrega o renderer via
    // file://, onde um "/sounds/…" resolveria para a raiz do disco em vez da
    // pasta do app (mesmo motivo do `base: './'` em vite.config.ts) — o som
    // falhava silenciosamente porque o catch abaixo engole o erro de load.
    const audio = new Audio('./sounds/notification.mp3')
    audio.preload = 'auto'
    notificationAudioRef.current = audio
    return () => {
      audio.pause()
      audio.src = ''
      notificationAudioRef.current = null
    }
  }, [])

  // Reconciles history against the live canvas once on load: notifications
  // left over from a node deleted in a previous session (or restored from
  // storage before this node ever existed) would otherwise keep counting
  // toward the badge forever, since the panel already hides anything whose
  // node isn't a live terminal.
  const historyReconciledRef = useRef(false)
  useEffect(() => {
    if (!hydrated || historyReconciledRef.current) return
    historyReconciledRef.current = true

    const liveTerminalIds = new Set(
      nodes.filter((node) => node.type === 'terminal').map((node) => node.id),
    )
    setNotificationHistory((current) =>
      current.filter((notification) => liveTerminalIds.has(notification.nodeId)),
    )
  }, [hydrated, nodes])

  useEffect(() => {
    if (!hydrated) return

    const acknowledgements = acknowledgedNotificationPromptsRef.current
    for (const [nodeId, promptAtAcknowledgement] of acknowledgements) {
      const snapshot = sessionSnapshots[nodeId]
      // A new submitted prompt starts a new agent turn. Terminal redraws and
      // opening the drawer keep lastPrompt unchanged, so they cannot recreate
      // a notification the user has already consumed.
      if (!snapshot || snapshot.lastPrompt !== promptAtAcknowledgement) {
        acknowledgements.delete(nodeId)
      }
    }

    const previousIds = previousNotificationIdsRef.current
    previousNotificationIdsRef.current = actionableNotificationIds
    if (!notificationIdsInitializedRef.current) {
      notificationIdsInitializedRef.current = true
      return
    }
    const newIds = findNewNotificationIds(previousIds, actionableNotificationIds).filter(
      (nodeId) =>
        !activeNotificationNodeIdsRef.current.has(nodeId) && !acknowledgements.has(nodeId),
    )
    if (newIds.length === 0) return

    const sequenceStart = notificationSequenceRef.current
    notificationSequenceRef.current += newIds.length
    newIds.forEach((nodeId) => activeNotificationNodeIdsRef.current.add(nodeId))
    setNotificationHistory((current) =>
      appendCanvasNotifications(
        current,
        newIds,
        sessionSnapshots,
        sequenceStart,
      ).notifications,
    )

    const audio = notificationAudioRef.current
    if (!audio || !notificationSoundEnabled) return
    audio.currentTime = 0
    void audio.play().catch(() => {
      // Browsers may block playback until the user has interacted with the app.
    })
  }, [actionableNotificationIds, hydrated, notificationSoundEnabled, sessionSnapshots])

  useEffect(() => {
    if (notificationAudioRef.current) {
      notificationAudioRef.current.volume = notificationVolume
    }
    saveNotificationPreferences({ soundEnabled: notificationSoundEnabled, volume: notificationVolume })
  }, [notificationSoundEnabled, notificationVolume])

  useEffect(() => {
    saveNotificationHistory(notificationHistory)
  }, [notificationHistory])

  // Consumir um agente é sempre a mesma coisa, venha de onde vier: o pedido
  // atual dele deixa de ser novidade. Guardar o `lastPrompt` do turno impede
  // que o mesmo pedido volte a notificar (um redesenho da tela não muda o
  // prompt), enquanto um prompt novo — turno novo — volta a notificar normal.
  //
  // Lê o snapshot do store, não do `sessionSnapshots` renderizado: assim o
  // callback fica estável e pode ser injetado nos dados dos nós sem que cada
  // batida de tecla de um agente invalide os blocos todos.
  const acknowledgeNodeNotifications = useCallback(
    (nodeId: string) => {
      acknowledgedNotificationPromptsRef.current.set(
        nodeId,
        store.getSnapshot(nodeId)?.lastPrompt,
      )
      activeNotificationNodeIdsRef.current.delete(nodeId)
    },
    [store],
  )

  // Abrir o terminal É ler a notificação dele. Todo caminho de abertura
  // (clique no bloco do canvas, dock de terminais, item do painel) passa por
  // aqui, então visitar o agente limpa a marca na hora em vez de deixar uma
  // notificação fantasma que só o painel sabia apagar.
  const openTerminal = useCallback(
    (nodeId: string) => {
      setExpandedTerminalId(nodeId)
      acknowledgeNodeNotifications(nodeId)
      setNotificationHistory((current) =>
        markCanvasNotificationsReadForNode(current, nodeId),
      )
    },
    [acknowledgeNodeNotifications],
  )

  // Read items older than the retention window drop out of the history, and so
  // do notifications whose terminal no longer exists — an unread one never
  // expires on age alone, so a closed agent's history would linger forever.
  // Checked hourly so a long-lived window expires them without a reload.
  //
  // `nodesRef` em vez de `nodes` nas dependências: recriar o intervalo a cada
  // mudança de node reiniciaria a hora de espera sem parar.
  useEffect(() => {
    if (!hydrated) return

    const prune = () =>
      setNotificationHistory((current) => {
        const pruned = pruneCanvasNotifications(
          current,
          Date.now(),
          undefined,
          nodesRef.current
            .filter((node) => node.type === 'terminal')
            .map((node) => node.id),
        )
        return pruned.length === current.length ? current : pruned
      })

    prune()
    const timer = setInterval(prune, 60 * 60 * 1000)
    return () => clearInterval(timer)
  }, [hydrated])

  // Só os terminais existentes contam — a mesma regra que o painel usa para
  // montar a lista. Sem isso o badge somava notificações de blocos já
  // fechados e ficava marcando um número que o painel não reconhecia.
  const notificationCount = useMemo(
    () =>
      countUnreadCanvasNotifications(
        notificationHistory,
        nodes.filter((node) => node.type === 'terminal').map((node) => node.id),
      ),
    [notificationHistory, nodes],
  )
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
  // Catálogo de skills disponíveis (biblioteca do app + terceiros + as da
  // pessoa). Só a LISTA entra no prompt inicial do agente; o conteúdo de cada
  // skill ele lê do arquivo quando a tarefa combinar.
  const availableSkillsRef = useRef<CanvasSkill[]>([])
  useEffect(() => {
    let cancelled = false
    void window.felixo?.canvas?.listAvailableSkills?.().then((result) => {
      if (!cancelled && result?.ok && Array.isArray(result.skills)) {
        availableSkillsRef.current = result.skills
      }
    })
    return () => {
      cancelled = true
    }
  }, [])
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
  // the render-only nodes memo below, not by anything that gets saved). The
  // capture and its readiness live in one state update: TerminalNode must not
  // call ensure() before this snapshot is available, otherwise its idempotent
  // first spawn would receive the normal prompt and could never be replaced.
  const [restoredAgentTerminals, setRestoredAgentTerminals] = useState<RestoredAgentTerminals>(
    () => ({ captured: false, ids: new Set() }),
  )
  const restoredAgentTerminalIdsCapturedRef = useRef(false)
  useEffect(() => {
    if (!hydrated || restoredAgentTerminalIdsCapturedRef.current) {
      return
    }
    restoredAgentTerminalIdsCapturedRef.current = true
    setRestoredAgentTerminals({
      captured: true,
      ids: new Set(
        nodes
          .filter((node) => node.type === 'terminal' && isKnownAgentCommand(node.data.command))
          .map((node) => node.id),
      ),
    })
  }, [hydrated, nodes])
  const flowContainerRef = useRef<HTMLDivElement>(null)
  const flowInstanceRef = useRef<FlowPositionMapper | null>(null)
  const agentMatrixAnimationFrameRef = useRef<number | undefined>(undefined)
  const agentMatrixAnimationCleanupRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const agentMatrixAnimationRunRef = useRef(0)
  // Espelho de edges para os callbacks injetados nos dados dos nodes (o de
  // nodes fica lá em cima, junto da origem). Ler por ref mantém esses
  // callbacks referencialmente estáveis, então arrastar um bloco não invalida
  // os dados injetados de todos os outros (ver o cache de nodes abaixo).
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
    edgesRef.current = edges
  }, [edges])

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
        { kind: 'rename' },
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

  // Dock reorder: the node array's order IS the dock's list order and the
  // source of each terminal's "#N" badge, so moving a row moves the node. The
  // resulting position is stamped into every node's `data.orderIndex` and
  // persisted, because the storage layer lists nodes by `updated_at` — without
  // an explicit index the order would reshuffle on the next save/restart.
  const reorderNodes = useCallback(
    (nodeId: string, targetId: string, edge: 'before' | 'after') => {
      setNodes((current) => {
        const moved = moveById(current, nodeId, targetId, edge)
        if (moved === current) {
          return current
        }

        return moved.map((node, index) => {
          if (node.data.orderIndex === index) {
            return node
          }
          const renumbered = { ...node, data: { ...node.data, orderIndex: index } }
          persistNode(renumbered)
          return renumbered
        })
      })
    },
    [setNodes, persistNode],
  )

  // Activate a skill: type its "use the file at <path>" instruction into the
  // expanded terminal if one is open; otherwise copy it for manual pasting.
  const activateSkill = useCallback(
    async (skill: CanvasSkill): Promise<SkillActivationResult> => {
      const prompt = buildSkillActivationPrompt(skill)
      if (expandedTerminalId) {
        store.sendText(expandedTerminalId, prompt, { kind: 'skill-prompt' })
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
        store.sendText(expandedTerminalId, toSubmittedTerminalText(prompt), {
          kind: 'catalog-prompt',
        })
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
    const { reuseData, commit } = createNodeDataReuse(nodeDataCache)
    const terminalOrder = countTerminalOrder(nodes)

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

      if (node.type === 'note' || node.type === 'group' || node.type === 'webpage') {
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
        const initialTextReady = isTerminalInitialTextReady({
          restoredAgentsCaptured: restoredAgentTerminals.captured,
          edgesHydrated,
          connectedCanvasFileCount: connectedFileNames.length,
          resolvedCanvasFileCount: canvasFilePaths.length,
        })
        // Left open from a previous run: whatever it was doing may not have
        // finished, so type "/resume" on this (re)spawn instead of the usual
        // standing instruction — see restoredAgentTerminalIds above.
        const fallbackInitialText = resolveTerminalInitialText({
          isRestoredAgent: restoredAgentTerminals.ids.has(node.id),
          qualityStandardEnabled: quality.enabled,
          qualityStandardPrompt: quality.prompt,
          hasCommand: isKnownAgentCommand(node.data.command),
          // `handoffText` é transitório e carrega um pedido de verdade, então
          // pode sair submetido; `initialText` é persistido e é sempre
          // contexto. O recorte cobre os blocos salvos antes desta mudança,
          // gravados com o Enter no fim — sem ele, um canvas antigo voltaria a
          // executar sozinho ao reabrir.
          existingInitialText:
            node.data.handoffText ?? stripTerminalSubmission(node.data.initialText),
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
              onExpand: openTerminal,
              onDetails: setDetailsTerminalId,
              onSessionStarted: (nodeId: string, startedAt: number) =>
                updateNodeData(nodeId, { sessionStartedAt: startedAt }),
              onDataChange: updateNodeData,
              onRenameCommit: notifyTerminalRenamed,
            }),
          ),
        }
      }

      return withHandle
    })

    // Fecha a passagem: o cache fica só com os blocos ainda no canvas.
    commit()

    return rendered
  }, [
    nodeDataCache,
    edges,
    edgesHydrated,
    generateDiagnosis,
    linkAgentToFile,
    notifyTerminalRenamed,
    nodes,
    openTerminal,
    qualityStandard,
    restoredAgentTerminals,
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
          // The node's terminal is gone, so any notification pointing at it
          // would otherwise linger unread forever: it still counts toward the
          // badge but the panel hides it (it only lists live terminal nodes).
          setNotificationHistory((current) =>
            current.filter((notification) => notification.nodeId !== change.id),
          )
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

      // A file-to-terminal link grants its agent shared scratchpad context;
      // an agent-to-agent link declares reciprocal collaboration. Other
      // connection shapes remain visual-only for now.
      void announceFileToTerminal(connection, nodes, store, fileLinkPromptRef.current)
      announceAgentCollaboration(connection, nodes, store)
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
      return id
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

  /**
   * Cria um bloco apontando para um arquivo que já existe no disco.
   *
   * O caminho vem sempre autorizado pelo processo principal — pelo seletor
   * nativo (a pessoa escolheu) ou por estar dentro de um projeto registrado. O
   * renderer nunca inventa um caminho aqui; ele repassa o que recebeu.
   */
  const openTextFileNode = useCallback(
    (filePath: string, fileLabel: string) => {
      addNode('file', { filePath, fileLabel, label: fileLabel })
    },
    [addNode],
  )

  const pickAndOpenTextFile = useCallback(async () => {
    const result = await window.felixo?.textFiles?.pick()
    if (result?.ok && !result.canceled && result.path) {
      openTextFileNode(result.path, result.name ?? result.path)
    }
  }, [openTextFileNode])

  const buildTerminalNodeData = useCallback(
    (options: {
      command?: string
      args?: string[]
      cwd?: string
      label: string
      planningFile?: string
      handoffText?: string
    }) => {
      // Agent terminals get the standing quality-standard instruction (if on)
      // plus their canvas identity (name, cwd, multi-agent setting); a plain
      // shell does not (there's no agent to read it).
      //
      // Só a passagem de responsabilidade sai submetida: ela carrega um pedido
      // que alguém despachou de propósito para este terminal. A instrução
      // permanente sozinha é contexto — fica digitada na entrada esperando o
      // usuário escrever a tarefa, em vez de o agente subir executando.
      const quality = qualityStandardRef.current
      const planningInstruction = buildPlanningFileInstruction(options.planningFile)
      const handoffSections = options.handoffText
        ? composeTerminalInitialText(
            quality.enabled ? buildQualityStandardMessage(quality.prompt) : undefined,
            options.handoffText,
            planningInstruction,
          )
        : undefined
      const handoffInstruction = handoffSections
        ? toSubmittedTerminalText(handoffSections)
        : undefined
      const initialText = options.command
        ? handoffInstruction ?? composeTerminalInitialText(
            quality.enabled
              ? buildCanvasTerminalInitialText(
                  quality.prompt,
                  undefined,
                  [],
                  { agentName: options.label, cwd: options.cwd },
                  availableSkillsRef.current,
                )
              : undefined,
            planningInstruction,
          )
        : undefined

      return {
        label: options.label,
        ...(options.command ? { command: options.command } : {}),
        ...(options.args && options.args.length ? { args: options.args } : {}),
        ...(options.cwd ? { cwd: options.cwd } : {}),
        ...(initialText && !options.handoffText ? { initialText } : {}),
        ...(options.handoffText ? { handoffText: initialText } : {}),
      }
    },
    [],
  )

  const addTerminalNode = useCallback(
    (options: {
      command?: string
      args?: string[]
      cwd?: string
      label: string
      planningFile?: string
    }) => {
      addNode('terminal', buildTerminalNodeData(options))
    },
    [addNode, buildTerminalNodeData],
  )

  /**
   * Cria o agente escolhido no diálogo já sabendo o que o anterior estava
   * fazendo. O destino vem da configuração que o usuário montou — qualquer
   * agente, qualquer modelo, qualquer direção —, e não mais de um rodízio fixo
   * entre as CLIs conhecidas, que na prática só fazia Claude → Codex.
   */
  const passResponsibility = useCallback(
    async (
      sourceId: string,
      transcript: string,
      options: NewTerminalOptions,
    ): Promise<{ ok: boolean; message?: string }> => {
      const source = nodesRef.current.find((node) => node.id === sourceId)
      if (!source || source.type !== 'terminal') {
        return { ok: false, message: 'O terminal de origem não está mais disponível.' }
      }

      const sourceData = source.data
      const targetLabel = options.label
      const handoffText = buildTerminalHandoffPrompt({
        sourceLabel: sourceData.label,
        sourceCommand: sourceData.command,
        // O diretório do destino é o que o usuário escolheu; só cai no do
        // agente de origem quando ele não escolheu projeto nenhum.
        cwd: options.cwd ?? sourceData.cwd,
        targetLabel,
        transcript,
      })
      const newId = addNode(
        'terminal',
        buildTerminalNodeData({
          ...options,
          cwd: options.cwd ?? sourceData.cwd,
          label: targetLabel,
          handoffText,
        }),
      )

      // Carry file links to the continuation node so it inherits the same
      // shared scratchpads and receives their absolute paths in its bootstrap.
      const linkedFileNodes = nodesRef.current.filter(
        (node) =>
          node.type === 'file' &&
          edgesRef.current.some(
            (edge) =>
              (edge.source === sourceId && edge.target === node.id) ||
              (edge.target === sourceId && edge.source === node.id),
          ),
      )
      const newEdges = linkedFileNodes.map((fileNode) => ({
        id: `edge-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`,
        source: fileNode.id,
        target: newId,
      }))
      if (newEdges.length > 0) {
        setEdges((current) => [...current, ...newEdges])
        newEdges.forEach((edge) => void saveCanvasEdge(edge))
      }

      setExpandedTerminalId(newId)
      return { ok: true }
    },
    [addNode, buildTerminalNodeData, setEdges],
  )

  // Starts several terminals at once (e.g. a whole agent setup) instead of
  // one `addNode` call per config: those go through the same `nodes` state
  // closure, so back-to-back calls in the same tick would all place against
  // the pre-batch list and stack on top of each other. `findFreeNodePositions`
  // (pure, tested in node-geometry.test.ts) finds free room for the whole
  // near-square matrix before everything lands in one `setNodes` + one
  // `persistNode` per node.
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

  // Explicit, opt-in layout for agents that were added at different times.
  // Shells and group children stay exactly where the user put them.
  const organizeCanvasBlocks = useCallback(() => {
    // Sem viewport: a matriz é ancorada no bloco mais ao topo-esquerda, então o
    // resultado não muda com pan, zoom ou tamanho de janela.
    const { nodes: organized, bounds } = arrangeNodesAsMatrix(nodes, edges)
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
      flowInstanceRef.current?.fitBounds(bounds, {
        padding: 0.1,
        duration: AGENT_MATRIX_ANIMATION_MS,
      })
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

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
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
  }, [nodes, edges, setNodes, persistNode])

  // "Run this file" from the Projects panel: the terminal's process IS the
  // file running (command = interpreter, args = [file]) — unlike agent
  // terminals, nothing gets typed into it afterwards, so no initialText.
  //
  // keepShellOpen marks it as a run-a-file session so the PTY leaves an
  // interactive shell behind instead of closing the pane the instant the file
  // finishes (or crashes), which read as "the file doesn't open" on Windows.
  const runFileInTerminal = useCallback(
    (options: RunFileOptions) => {
      addNode('terminal', {
        label: options.label,
        command: options.command,
        ...(options.args.length ? { args: options.args } : {}),
        ...(options.fallbackCommand ? { fallbackCommand: options.fallbackCommand } : {}),
        cwd: options.cwd,
        keepShellOpen: true,
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
    () => ({
      terminal: TerminalNode,
      note: NoteNode,
      group: GroupNode,
      file: FileNode,
      webpage: WebpageNode,
    }),
    [],
  )

  const expandedNode = expandedTerminalId
    ? nodes.find((node) => node.id === expandedTerminalId)
    : undefined
  const expandedNodeData = expandedNode?.data as
    | {
        label?: string
        command?: string
        args?: string[]
        cwd?: string
        initialText?: string
        handoffText?: string
      }
    | undefined
  const expandedTitle = expandedNodeData?.label ?? 'Terminal'
  const arrangeableCount = countArrangeableNodes(nodes)

  return (
    <div className="flex h-full w-full">
      <div ref={flowContainerRef} className="relative h-full min-w-0 flex-1">
      {isBusy && <div className="absolute inset-0 z-50 cursor-wait" aria-hidden="true" />}
      <CanvasToolbar
        activeTool={activeTool}
        onSelectTool={(tool) =>
          setActiveTool((current) => (current === tool ? null : tool))
        }
        onToolsMenuOpenChange={setToolsMenuOpen}
        updatePresentation={updates.presentation}
        onInstallUpdate={updates.install}
        onCheckUpdate={updates.check}
        projects={projects}
        onAddTerminal={addTerminalNode}
        onAddTerminals={addTerminalNodes}
        onOrganizeBlocks={organizeCanvasBlocks}
        arrangeableCount={arrangeableCount}
        onAddFolder={addProjectFolder}
        onAddFile={addFileNode}
        onOpenFile={() => void pickAndOpenTextFile()}
        onAddGroup={(name) => addNode('group', { label: name || 'Grupo' })}
        onAddWebpage={(url, name) =>
          addNode('webpage', { url, ...(name ? { label: name } : {}) })
        }
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
      />

      <NotificationsMenu
        open={notificationsOpen}
        notificationCount={notificationCount}
        onToggle={() => setNotificationsOpen((open) => !open)}
        onHeightChange={setNotificationsTriggerHeight}
      >
        {(ready, panelRef) => (
          <NotificationsPanel
            nodes={nodes}
            notifications={notificationHistory}
            open={notificationsOpen}
            ready={ready}
            panelRef={panelRef}
            reservedBottomSpace={terminalsDockHeight > 0 ? terminalsDockHeight + 32 : 0}
            soundEnabled={notificationSoundEnabled}
            onSoundEnabledChange={setNotificationSoundEnabled}
            volume={notificationVolume}
            onVolumeChange={setNotificationVolume}
            onClose={() => setNotificationsOpen(false)}
            onFocusNode={focusNode}
            onExpandNode={openTerminal}
            onMarkRead={(notificationId) => {
              const target = notificationHistory.find(
                (notification) => notification.id === notificationId,
              )
              if (target) {
                acknowledgeNodeNotifications(target.nodeId)
              }
              setNotificationHistory((current) =>
                markCanvasNotificationRead(current, notificationId),
              )
            }}
            onMarkAllRead={() => {
              notificationHistory.forEach((notification) => {
                if (notification.readAt !== null) return
                acknowledgeNodeNotifications(notification.nodeId)
              })
              setNotificationHistory((current) => markAllCanvasNotificationsRead(current))
            }}
            onRemove={(notificationId) => {
              const target = notificationHistory.find(
                (notification) => notification.id === notificationId,
              )
              if (target?.readAt === null) {
                acknowledgeNodeNotifications(target.nodeId)
              }
              setNotificationHistory((current) =>
                removeCanvasNotification(current, notificationId),
              )
            }}
            onClearRead={() =>
              setNotificationHistory((current) => clearReadCanvasNotifications(current))
            }
          />
        )}
      </NotificationsMenu>

      <CanvasToolPanels
        activeTool={activeTool}
        toolsMenuOpen={toolsMenuOpen}
        onClose={() => setActiveTool(null)}
        nodes={nodes}
        onFocusNode={focusNode}
        onAddNote={() => addNode('note', { text: '' })}
        onProjectsChanged={reloadProjects}
        onRemoveFolder={removeProjectFolder}
        onRunFile={runFileInTerminal}
        onOpenFileInCanvas={openTextFileNode}
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

      {detailsTerminalId && (() => {
        const detailsNode = nodes.find((node) => node.id === detailsTerminalId && node.type === 'terminal')
        return detailsNode ? (
          <TerminalDetailsPanel
            nodeId={detailsNode.id}
            data={detailsNode.data}
            onClose={() => setDetailsTerminalId(null)}
            toolsMenuOpen={toolsMenuOpen}
          />
        ) : null
      })()}

      <TerminalsPanel
        nodes={nodes}
        activeTerminalId={expandedTerminalId}
        onFocusNode={focusNode}
        onExpandNode={openTerminal}
        onReorder={reorderNodes}
        onHeightChange={setTerminalsDockHeight}
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
          {/* Top-right keeps the minimap clear of the bottom Chat/Canvas toggle.
              The notifications bell lives right above it in the same corner;
              its real measured height (bell + open panel, via ResizeObserver
              in NotificationsMenu) sets this gap, so the minimap is pushed
              down by exactly as much space as the trigger actually occupies —
              never overlapped, however tall the notification list grows. */}
          <MiniMap
            pannable
            zoomable
            position="top-right"
            className="!mr-4"
              style={{
                // Notifications open horizontally to the left of the map,
                // so the minimap does not need to be pushed down anymore.
                marginTop: 16,
                transition: 'margin-top 300ms ease',
              }}
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
            initialText: expandedNodeData?.handoffText ?? expandedNodeData?.initialText,
            sourceLabel: expandedTitle,
          }}
          onPassResponsibility={(transcript) =>
            setHandoff({ sourceId: expandedTerminalId, transcript })
          }
          onOpenFilePreview={openTextFileNode}
          onClose={() => setExpandedTerminalId(null)}
        />
      )}

      {handoff && (
        <HandoffDialog
          sourceLabel={
            nodes.find((node) => node.id === handoff.sourceId)?.data.label || 'agente anterior'
          }
          projects={projects}
          onAddFolder={addProjectFolder}
          onConfirm={(options) =>
            passResponsibility(handoff.sourceId, handoff.transcript, options)
          }
          onClose={() => setHandoff(null)}
        />
      )}
      <UpdateToast
        presentation={updates.presentation}
        dismissed={updates.dismissed}
        onDismiss={updates.dismiss}
        onInstall={updates.install}
      />
      {/* Cuida do proprio estado: o avanco da instalacao nao precisa passar
          pelo canvas para chegar na tela. */}
      <CliSetupToast />
    </div>
  )
}

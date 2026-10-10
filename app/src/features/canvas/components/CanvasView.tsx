// Tela principal do canvas: orquestra os blocos (terminais, notas, arquivos,
// grupos), suas conexões e a persistência. Geometria pura vive em
// services/node-geometry.ts, as regras de ligação arquivo↔terminal em
// services/file-terminal-links.ts, e a UI de toolbar/painéis em
// CanvasToolbar.tsx e CanvasToolPanels.tsx.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties } from 'react'
import {
  ReactFlow,
  Background,
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
import { Bell } from 'lucide-react'
import { TerminalNode } from './TerminalNode'
import { NoteNode } from './NoteNode'
import { AgentQuestionDialog } from './AgentQuestionDialog'
import { AgentBrowserRequestCard } from './AgentBrowserRequestCard'
import { DictationButton } from './DictationButton'
import { useDictation } from '../hooks/useDictation'
import { useDictationShortcut } from '../hooks/useDictationShortcut'
import { formatShortcut, matchesShortcut } from '../services/dictation'
import { buildPresetInstruction } from '../services/agent-preset-prompt'
import { NodeColorMenu } from './NodeColorMenu'
import { frameClassName } from './frame-colors'
import { notificationClassName, unreadCategoryByNode } from '../terminal/notification-category'
import { initialAutoFitState, markAutoFitExecuted, planAutoFit, registerViewportMove } from '../services/viewport-auto-fit'
import { DrawingNode } from './DrawingNode'
import { ExcalidrawDrawingNode } from './ExcalidrawDrawingNode'
import { GroupNode } from './GroupNode'
import { FileNode } from './FileNode'
import { WebpageNode } from './WebpageNode'
import { NotionTasksNode } from './NotionTasksNode'
import { TerminalDrawer } from './TerminalDrawer'
import { readingProfileFor } from '../terminal/reading/reading-profiles'
import { TerminalDetailsPanel } from './TerminalDetailsPanel'
import { NODE_DRAG_HANDLE_CLASS } from './NodeHeader'
import {
  countTerminalOrder,
  createNodeDataReuse,
  type NodeDataCacheEntry,
} from '../services/node-data-cache'
import {
  INITIAL_NODE_MOUNT_LATCH,
  reduceNodeMountLatch,
  rectsIntersect,
  shouldKeepCanvasNodesMounted,
} from '../services/node-mount-latch'
import { CanvasToolbar } from './CanvasToolbar'
import { CanvasTopbar } from './CanvasTopbar'
import { CanvasStatusBar } from './CanvasStatusBar'
import { CanvasZoomPill } from './CanvasZoomPill'
import { CanvasAmbientLayer } from './CanvasAmbientLayer'
import { CanvasSurfacesProvider } from './CanvasSurfacesProvider'
import { useCanvasSurfaces } from '../hooks/canvas-surfaces-context'
import {
  useResizableSidebarWidth,
  type ResizableSidebarWidth,
} from '../hooks/useResizableSidebarWidth'
import { canvasSurfaceLayoutWarning, freeCanvasArea } from '../services/canvas-surfaces'
import { usePerformanceMode } from '../../shared/performance/performance-mode-context'
import { toolbarColumnOffset } from './toolbar-flyout'
import { CliSetupToast } from '../../setup/CliSetupNotice'
import { useUpdateStatus } from '../../updates/useUpdateStatus'
import { CanvasToolPanels } from './CanvasToolPanels'
import { TerminalsPanel } from './tools/TerminalsPanel'
import { moveById } from './tools/terminals-panel-reorder'
import { CanvasPanel } from './tools/CanvasPanel'
import { NotificationsPanel } from './NotificationsPanel'
import { TerminalSessionProvider } from '../terminal/TerminalSessionProvider'
import { useTerminalSessions } from '../terminal/terminal-session-context'
import {
  clearReadCanvasNotifications,
  countUnreadCanvasNotifications,
  markAllCanvasNotificationsRead,
  markCanvasNotificationRead,
  markCanvasNotificationsReadForNode,
  pruneCanvasNotifications,
  removeCanvasNotification,
} from '../terminal/canvas-notifications'
import {
  buildPlanningFileInstruction,
  buildCanvasTerminalInitialText,
  buildQualityStandardMessage,
  composeTerminalInitialText,
  isTerminalInitialTextReady,
  qualityStandardGuidesFrom,
  resolveQualityStandardPrompt,
  resolveTerminalInitialText,
} from '../services/quality-standard-prompt'
import { registerWebpageOpener } from '../../shared/links/link-chooser-store'
import { webpageProfileForLinkSource } from '../services/webview-context-menu'
import { stripTerminalSubmission, terminalTextForInsertion, toSubmittedTerminalText } from '../terminal/terminal-input'
import { buildSkillActivationPrompt } from '../services/skill-prompt'
import {
  createManualPromptInsertion,
  createSkillPromptInsertion,
  createPromptInsertion,
  type PromptInsertion,
} from '../../shared/types/prompt-insertion'
import {
  isDirectOpeniaLaunch,
  isKnownAgentCommand,
} from '../services/agent-launch-options'
import {
  explainAgentResume,
  isAgentSessionReference,
  type AgentResumeFailure,
  type AgentSessionReference,
} from '../services/agent-session'
import { resumeDependsOnVersion } from '../services/agent-resume-capability'
import { loadAgentCliVersions, type AgentCliVersions } from '../services/agent-cli-versions'
import {
  agentSessionPatch,
  buildTerminalResumeBanner,
  followsTerminalResumePlan,
  resolveTerminalRelaunch,
  resumeFailurePatch,
  terminalResumeActionPatch,
  terminalResumeActionRelaunches,
  type TerminalResumeActionId,
} from '../services/terminal-resume-banner'
import { createTerminalRunRegistry } from '../services/terminal-run-registry'
import type { RunFileOptions } from '../services/run-file-command'
import type { CanvasTool } from './tools/CanvasToolsMenu'
import type { SkillActivationResult } from './tools/SkillsPanel'
import { toActivationResult } from '../services/prompt-delivery-feedback'
import { useCanvasPersistence } from '../hooks/useCanvasPersistence'
import { useCanvasProjects } from '../hooks/useCanvasProjects'
import { useCanvasTransfer } from '../hooks/useCanvasTransfer'
import {
  deleteCanvasEdge,
  loadCanvasEdges,
  saveCanvasEdge,
} from '../services/canvas-storage'
import {
  getDefaultNodeSize,
  findFreeNodePosition,
  findFreeNodePositionNearNode,
  findFreeNodePositions,
  getNodeSize,
  isInside,
  type CanvasBounds,
} from '../services/node-geometry'
import { edgeHandlesBetween } from '../services/edge-handle-routing'
import { summarizeCanvasSelection } from '../services/canvas-selection'
import {
  agentLabelOf,
  announceFileNodeToTerminalNode,
  announceFileToTerminal,
  requestRepoDiagnosis,
} from '../services/file-terminal-links'
import { createCanvasConnectionIndex } from '../services/canvas-connection-index'
import { releaseRemovedCanvasNodes } from '../services/canvas-node-removal'
import { CanvasProfilerBoundary } from '../services/canvas-performance-profiler.tsx'
import { announceAgentCollaboration } from '../services/agent-collaboration-links'
import {
  buildTerminalHandoffPrompt,
} from '../services/terminal-handoff'
import type { NewTerminalOptions } from '../services/new-terminal-options'
import { HandoffDialog } from './HandoffDialog'
import { AccountSwitchDialog } from './AccountSwitchDialog'
import { AccountChainActionsContext } from '../hooks/account-chain-actions-context'
import { useAccountContinuation } from '../hooks/useAccountContinuation'
import type { ContinuationReason } from '../services/account-switch-dialog'
import { formatClockTime, ptySessionIdForNode } from '../services/account-chain-view'
import { requestAgentUsageTab } from '../services/agent-usage-panel-tab'
import { OnboardingMount } from '../../onboarding/OnboardingMount'
import { WATCHES_CANVAS_NODE_TYPES, nodeTypesKeyOf } from '../../onboarding/onboarding-canvas-triggers'
import { countArrangeableNodes } from '../services/canvas-matrix-layout'
import { useCanvasNotifications } from '../hooks/useCanvasNotifications'
import { useCanvasPrompts } from '../hooks/useCanvasPrompts'
import { useImageNodeActions } from '../hooks/useImageNodeActions'
import { useMatrixArrange } from '../hooks/useMatrixArrange'
import { useSafeViewport, type FlowPositionMapper } from '../hooks/useSafeViewport'
import type {
  CanvasImageArtifact,
  CanvasNodeData,
  CanvasNodeType,
  CanvasSkill,
  DiagnosisRequestStatus,
  TerminalNodeData,
} from '../types'

type RestoredAgentTerminals = {
  captured: boolean
  /** Agentes vindos do disco nesta execução do app: seguem o plano de retomada. */
  ids: ReadonlySet<string>
  /** Os restaurados ainda sem processo nesta execução: só esses são segurados. */
  holdable: ReadonlySet<string>
}

/**
 * O que precisa durar a execução do app, não a montagem do canvas: blocos cujo
 * processo já subiu, agentes restaurados do disco, a escolha da faixa de
 * retomada e as conversas esquecidas (ver `terminal-run-registry.ts`). O PTY
 * continua vivo no processo principal quando o canvas desmonta (ida ao chat e
 * volta) E quando só a interface recarrega (Ctrl+R, "Recarregar interface",
 * "Recarregar app"): o `ensure()` da volta só reanexa (`reuseExisting`). Um
 * `Set` de módulo zerava no `location.reload` com o agente de pé, e o bloco
 * voltava a "aguardando escolha / Nada foi iniciado" — daí o `sessionStorage`
 * da janela, que sobrevive ao reload e zera quando a janela fecha, como os
 * PTYs. Se ele falhar, o registro segue em memória.
 */
const terminalRunRegistry = createTerminalRunRegistry(() => window.sessionStorage)

function markTerminalStarted(nodeId: string): void {
  terminalRunRegistry.markStarted(nodeId)
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
    target.dataset.felixoRegion === 'canvas' ||
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

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'felixo:canvas-sidebar-collapsed'

/** Lida com storage indisponível (modo privado, testes) como "nunca recolhida". */
function readSidebarCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function writeSidebarCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0')
  } catch {
    // Sem armazenamento a sidebar só perde a memória do estado entre sessões.
  }
}

export function CanvasView({ onOpenChat }: CanvasViewProps) {
  // Fonte da verdade: o provider de superfícies embrulha `CanvasInner` por
  // fora, então o estado não pode morar dentro dele — ficaria inacessível
  // pra quem calcula `toolbarWidth` aqui. Lembrada entre sessões como as
  // outras preferências de layout (`panel-sizing.ts`, `terminal-drawer-pin.ts`).
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed)
  const sidebarResize = useResizableSidebarWidth()

  const changeSidebarCollapsed = useCallback((collapsed: boolean) => {
    setSidebarCollapsed(collapsed)
    writeSidebarCollapsed(collapsed)
  }, [])

  return (
    <TerminalSessionProvider>
      <CanvasSurfacesProvider
        toolbarWidth={toolbarColumnOffset(sidebarCollapsed, sidebarResize.width)}
      >
        <CanvasProfilerBoundary>
          <CanvasInner
            onOpenChat={onOpenChat}
            sidebarCollapsed={sidebarCollapsed}
            onSidebarCollapsedChange={changeSidebarCollapsed}
            sidebarResize={sidebarResize}
          />
        </CanvasProfilerBoundary>
      </CanvasSurfacesProvider>
    </TerminalSessionProvider>
  )
}

type CanvasInnerProps = CanvasViewProps & {
  sidebarCollapsed: boolean
  onSidebarCollapsedChange: (collapsed: boolean) => void
  sidebarResize: ResizableSidebarWidth
}

function CanvasInner({
  onOpenChat,
  sidebarCollapsed,
  onSidebarCollapsedChange,
  sidebarResize,
}: CanvasInnerProps) {
  const store = useTerminalSessions()
  // minimap já vem pronto do provider — computado uma vez a partir de
  // occupancy/viewport internamente, não recalculado aqui.
  const { occupancy, minimap: miniMap, viewport } = useCanvasSurfaces()
  const layoutWarning = canvasSurfaceLayoutWarning(viewport, occupancy)
  const freeArea = freeCanvasArea(viewport, occupancy)
  const { performanceMode } = usePerformanceMode()
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
  const addImageNodeRef = useRef<
    (artifact: CanvasImageArtifact, position?: { x: number; y: number }) => string
  >(() => '')
  const [edges, setEdges] = useEdgesState<Edge>([])
  const [edgesHydrated, setEdgesHydrated] = useState(false)
  // A route is lit only after a real PTY delivery succeeds. A connected edge
  // remains quiet until then; node activity alone never implies data flow.
  const [activeRouteKeys, setActiveRouteKeys] = useState<Set<string>>(
    () => new Set(),
  )
  const routeTimersRef = useRef<Map<string, number>>(new Map())
  const routeKey = useCallback(
    (connection: Pick<Connection, 'source' | 'target'>) =>
      `${connection.source}->${connection.target}`,
    [],
  )
  const markRouteDelivered = useCallback(
    (connection: Pick<Connection, 'source' | 'target'>) => {
      const key = routeKey(connection)
      setActiveRouteKeys((current) => {
        const next = new Set(current)
        next.add(key)
        return next
      })
      const previousTimer = routeTimersRef.current.get(key)
      if (previousTimer != null) {
        window.clearTimeout(previousTimer)
      }
      const timer = window.setTimeout(() => {
        setActiveRouteKeys((current) => {
          const next = new Set(current)
          next.delete(key)
          return next
        })
        routeTimersRef.current.delete(key)
      }, 900)
      routeTimersRef.current.set(key, timer)
    },
    [routeKey],
  )
  useEffect(() => {
    const timers = routeTimersRef.current
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer))
      timers.clear()
    }
  }, [])
  const connectionIndex = useMemo(
    () => createCanvasConnectionIndex(nodes, edges),
    [nodes, edges],
  )
  const [terminalCanvasFilePaths, setTerminalCanvasFilePaths] = useState<
    Record<string, string[]>
  >({})
  const { projects, reloadProjects, addProjectFolder, removeProjectFolder } = useCanvasProjects()
  const [expandedTerminalId, setExpandedTerminalId] = useState<string | null>(null)
  const expandedTerminalIdRef = useRef<string | null>(null)
  const terminalFocusReturnRef = useRef<HTMLElement | null>(null)
  // While a drawer is open — and until focus has returned to the card's trigger
  // and left it again — keep node triggers mounted so closing the drawer can
  // return focus even if safe-area recentering panned the card outside the
  // virtualization window. The latch used to stay on for the rest of the
  // session after the first drawer; see `node-mount-latch.ts`.
  const [nodeMountLatch, dispatchNodeMountLatch] = useReducer(
    reduceNodeMountLatch,
    INITIAL_NODE_MOUNT_LATCH,
  )
  // `expandedTerminalId` também conta como "gaveta aberta": qualquer caminho
  // que abra a gaveta sem passar por `openTerminal` continua protegido.
  const keepCanvasNodesMounted =
    expandedTerminalId !== null || shouldKeepCanvasNodesMounted(nodeMountLatch)
  const drawerCloseGenerationRef = useRef(0)
  const [detailsTerminalId, setDetailsTerminalId] = useState<string | null>(null)
  // Passagem de responsabilidade em andamento: o histórico é capturado no
  // momento do clique, e não quando o usuário confirma — do contrário o agente
  // de origem continuaria escrevendo enquanto o diálogo está aberto e o
  // destino receberia um histórico diferente do que estava na tela.
  // `reason` só existe quando a passagem veio de uma detecção da cadeia (faixa
  // "Passar responsabilidade…" de um bloco fixo ou do Login do sistema).
  const [handoff, setHandoff] = useState<{
    sourceId: string
    transcript: string
    reason?: ContinuationReason
  } | null>(null)
  // 'select' = drag draws a selection box; 'pan' = drag grabs and moves the canvas.
  const [canvasMode, setCanvasMode] = useState<'select' | 'pan'>('select')
  // Lido pela topbar e pela status bar — sem isto os dois mostravam "100%"
  // fixo, independente do zoom real (`onMove` do React Flow é a única fonte
  // confiável: cobre scroll, pinça, os botões +/- e o "Ver tudo" programático).
  // A atmosfera do canvas recua conforme o trabalho aparece: com o canvas
  // vazio ela é o assunto; com muitos blocos ela vira só profundidade de fundo.
  const atmosfera = useMemo(() => {
    const total = nodes.length
    if (total <= 2) return 1
    if (total <= 6) return 0.75
    if (total <= 12) return 0.5
    return 0.3
  }, [nodes.length])

  const [zoomPercent, setZoomPercent] = useState(100)
  const zoomPercentRef = useRef(100)
  // Estado do enquadramento automático (ver `viewport-auto-fit.ts`): depois que a
  // pessoa mexe na visão, mudança de layout não pode mais reenquadrar.
  const autoFitStateRef = useRef(initialAutoFitState())
  const handleCanvasMove = useCallback((
    event: unknown,
    viewport: { zoom: number },
  ) => {
    // `event` é null para movimento programático (nosso ajuste, botões de zoom, foco).
    autoFitStateRef.current = registerViewportMove(
      autoFitStateRef.current,
      performance.now(),
      event !== null && event !== undefined,
    )
    const nextZoomPercent = Math.round(viewport.zoom * 100)
    if (nextZoomPercent === zoomPercentRef.current) return
    zoomPercentRef.current = nextZoomPercent
    setZoomPercent(nextZoomPercent)
  }, [])
  // Trava de interação: mesmo comportamento do antigo botão do React Flow,
  // agora dentro da pílula de zoom.
  const [canvasLocked, setCanvasLocked] = useState(false)
  const [activeTool, setActiveTool] = useState<CanvasTool | null>(null)
  // Atalho de editor para a busca global do canvas. Captura antes do xterm:
  // o terminal pode parar eventos no próprio textarea, mas Ctrl/Cmd+K deve
  // abrir a busca independentemente de onde o foco esteja no workspace.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k') {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      setActiveTool('search')
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])
  const {
    acknowledgeNodeNotifications,
    notificationHistory,
    notificationSoundEnabled,
    notificationVolume,
    setNotificationHistory,
    setNotificationSoundEnabled,
    setNotificationVolume,
  } = useCanvasNotifications({ hydrated, nodes, store })

  // Abrir o terminal É ler a notificação dele. Todo caminho de abertura
  // (clique no bloco do canvas, dock de terminais, item do painel) passa por
  // aqui, então visitar o agente limpa a marca na hora em vez de deixar uma
  // notificação fantasma que só o painel sabia apagar.
  const openTerminal = useCallback(
    (nodeId: string) => {
      const active = document.activeElement
      const trigger = Array.from(
        document.querySelectorAll<HTMLElement>('[data-terminal-expand-trigger]'),
      ).find((element) => element.dataset.terminalExpandTrigger === nodeId)
      if (trigger) {
        // A programmatic activation (dock row, keyboard command, or an E2E
        // click) may not leave the button as document.activeElement. Capture
        // the actual trigger up front so closing the drawer has a stable
        // focus target even when React Flow rerenders the node.
        terminalFocusReturnRef.current = trigger
      } else if (
        active instanceof HTMLElement &&
        !active.closest('[data-canvas-terminal-drawer]') &&
        active !== document.body
      ) {
        terminalFocusReturnRef.current = active
      }
      expandedTerminalIdRef.current = nodeId
      dispatchNodeMountLatch({ type: 'drawer-opened' })
      setExpandedTerminalId(nodeId)
      acknowledgeNodeNotifications(nodeId)
      setNotificationHistory((current) =>
        markCanvasNotificationsReadForNode(current, nodeId),
      )
    },
    [acknowledgeNodeNotifications, setNotificationHistory],
  )

  const closeExpandedTerminal = useCallback(() => {
    const closingId = expandedTerminalIdRef.current ?? expandedTerminalId
    const active = document.activeElement
    const focusWasInside =
      active instanceof HTMLElement &&
      Boolean(active.closest('[data-canvas-terminal-drawer]'))
    setExpandedTerminalId(null)
    expandedTerminalIdRef.current = null
    drawerCloseGenerationRef.current += 1
    const generation = drawerCloseGenerationRef.current
    dispatchNodeMountLatch({ type: 'drawer-closed', generation })
    // Only turn virtualization back on once the drawer-less layout has
    // settled: in the same batch React Flow would still compute the visible
    // nodes with the old container width, unmounting and remounting the cards
    // under the drawer's strip (a webview there would reload).
    const settleAfterLayout = () =>
      window.requestAnimationFrame(() =>
        window.requestAnimationFrame(() =>
          dispatchNodeMountLatch({ type: 'settled', generation }),
        ),
      )
    if (!focusWasInside) {
      settleAfterLayout()
      return
    }

    const isOutsideVisibleArea = (element: Element) => {
      const container = flowContainerRef.current
      return Boolean(
        container &&
          !rectsIntersect(element.getBoundingClientRect(), container.getBoundingClientRect()),
      )
    }
    // Focus parked in a node outside the visible area keeps every node mounted
    // until it leaves that node; releasing earlier would unmount the card with
    // the focus inside (it would drop to <body>). Tab to another control of an
    // off-screen card hands the hold over to the new element.
    const holdWhileFocusInHiddenNode = (element: HTMLElement) => {
      element.addEventListener(
        'focusout',
        (event) => {
          const next = event.relatedTarget
          const nextNode = next instanceof HTMLElement ? next.closest('.react-flow__node') : null
          if (next instanceof HTMLElement && nextNode && isOutsideVisibleArea(nextNode)) {
            holdWhileFocusInHiddenNode(next)
            return
          }
          dispatchNodeMountLatch({ type: 'restored-focus-left', generation })
        },
        { once: true },
      )
    }

    const restoreFocus = (attempt: number) => {
      const remembered = terminalFocusReturnRef.current
      const trigger = closingId
        ? Array.from(
            document.querySelectorAll<HTMLElement>('[data-terminal-expand-trigger]'),
          ).find((element) => element.dataset.terminalExpandTrigger === closingId)
        : null
      const target = remembered?.isConnected ? remembered : trigger
      if (target) {
        target.focus({ preventScroll: true })
        terminalFocusReturnRef.current = target
        const node = target.closest('.react-flow__node')
        if (node && document.activeElement === target && isOutsideVisibleArea(node)) {
          dispatchNodeMountLatch({ type: 'focus-restored-to-node', generation })
          holdWhileFocusInHiddenNode(target)
        } else {
          settleAfterLayout()
        }
        return
      }
      // onlyRenderVisibleElements can temporarily unmount the terminal while
      // the drawer's occupancy is being removed. Retry after React Flow has
      // restored the node before falling back to the canvas region.
      if (attempt < 12) {
        window.requestAnimationFrame(() => restoreFocus(attempt + 1))
        return
      }
      flowContainerRef.current?.focus({ preventScroll: true })
      settleAfterLayout()
    }
    window.requestAnimationFrame(() => restoreFocus(0))
  }, [expandedTerminalId])

  const closeHandoff = useCallback(() => {
    setHandoff(null)
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('[data-canvas-handoff-trigger]')?.focus()
    })
  }, [])

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
  }, [hydrated, setNotificationHistory])

  // Só os terminais existentes contam — a mesma regra que o painel usa para
  // montar a lista. Sem isso o badge somava notificações de blocos já
  // fechados e ficava marcando um número que o painel não reconhecia.
  // Atualização pendente mostrada como item fixo no painel de notificações,
  // no lugar do antigo aviso flutuante no canto da tela — `showToast` só é
  // true para 'available'/'downloading'/'downloaded' (nunca 'error'), então
  // isso nunca vira ruído sobre uma falha passageira de rede.
  const updateNotificationItem = useMemo(() => {
    if (!updates.presentation.showToast || updates.dismissed) return null
    return {
      presentation: updates.presentation,
      onInstall: updates.install,
      onDismiss: updates.dismiss,
    }
  }, [updates.presentation, updates.dismissed, updates.install, updates.dismiss])
  const notificationCount = useMemo(
    () =>
      countUnreadCanvasNotifications(
        notificationHistory,
        nodes.filter((node) => node.type === 'terminal').map((node) => node.id),
      ) + (updateNotificationItem ? 1 : 0),
    [notificationHistory, nodes, updateNotificationItem],
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
      expandedTerminalIdRef.current = null
      // Limpar/importar descarta os blocos: não há gatilho para devolver foco
      // nem cartão na faixa da gaveta para preservar — solta na hora.
      drawerCloseGenerationRef.current += 1
      const generation = drawerCloseGenerationRef.current
      dispatchNodeMountLatch({ type: 'drawer-closed', generation })
      dispatchNodeMountLatch({ type: 'settled', generation })
      setActiveTool(null)
    },
  })
  const {
    applySavedQualityStandard,
    availableSkillsRef,
    bootstrapPromptRef,
    fileLinkPromptRef,
    projectGuides,
    qualityInputs,
    qualityPromptFor,
    qualityStandard,
    qualityStandardRef,
  } = useCanvasPrompts(nodes)
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
  //
  // A captura passa pelo registro da execução (`terminalRunRegistry`), porque
  // o canvas remonta na volta do chat e a interface pode recarregar sozinha,
  // com os PTYs de pé no processo principal. Quem já era restaurado continua
  // sendo — o Reiniciar segue o mesmo plano de antes da ida ao chat —, mas só
  // os restaurados ainda sem processo (`holdable`) podem ser segurados por uma
  // retomada pendente. Na mesma atualização volta a escolha feita na faixa
  // nesta execução: a reidratação do disco a perde (é transitória), e sem ela
  // a faixa de falha reapareceria sobre a conversa já escolhida.
  const [restoredAgentTerminals, setRestoredAgentTerminals] = useState<RestoredAgentTerminals>(
    () => ({ captured: false, ids: new Set(), holdable: new Set() }),
  )
  const restoredAgentTerminalIdsCapturedRef = useRef(false)
  // Versão instalada de cada CLI de agente, para o plano de retomada decidir
  // pelo que está instalado agora (`explainAgentResume`). `null` enquanto o
  // processo principal responde: só o bloco restaurado cujo método depende da
  // versão (Gemini) espera por ela; o processo principal limita a espera com
  // o tempo-limite do `--version`. Relida a cada montagem do canvas — o
  // processo principal guarda a leitura por alguns minutos.
  const [agentCliVersions, setAgentCliVersions] = useState<AgentCliVersions | null>(null)
  useEffect(() => {
    let active = true
    void loadAgentCliVersions().then((versions) => {
      if (active) setAgentCliVersions(versions)
    })
    return () => {
      active = false
    }
  }, [])
  useEffect(() => {
    if (!hydrated || restoredAgentTerminalIdsCapturedRef.current) {
      return
    }
    restoredAgentTerminalIdsCapturedRef.current = true
    const capture = terminalRunRegistry.captureRestored(
      nodes
        .filter((node) => node.type === 'terminal' && isKnownAgentCommand(node.data.command))
        .map((node) => node.id),
    )
    setRestoredAgentTerminals({ captured: true, ids: capture.restored, holdable: capture.holdable })
    // Sem `persistNode`: `resumeChoice` é transitória e nunca vai para o disco.
    setNodes((current) => terminalRunRegistry.applyChoices(current))
  }, [hydrated, nodes, setNodes])
  const flowContainerRef = useRef<HTMLDivElement>(null)
  const flowInstanceRef = useRef<FlowPositionMapper | null>(null)
  const [flowReady, setFlowReady] = useState(false)
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

  const {
    centerNodeInSafeArea,
    fitBoundsSafely,
    fitCanvasViewSafely,
    getSafeCanvasScreenRect,
  } = useSafeViewport({ flowContainerRef, flowInstanceRef, occupancy })

  useEffect(() => {
    if (!hydrated || !flowReady) {
      return undefined
    }

    // `fitCanvasViewSafely` muda a cada mudança de layout; sem este plano cada
    // abrir/fechar de gaveta ou painel jogava fora o pan e o zoom da pessoa.
    const plan = planAutoFit(autoFitStateRef.current, canvasRevision)
    autoFitStateRef.current = plan.state
    if (!plan.fit) {
      return undefined
    }

    const frame = window.requestAnimationFrame(() => {
      // A janela de "movimento nosso" abre agora, na execução (não no plano).
      autoFitStateRef.current = markAutoFitExecuted(autoFitStateRef.current, performance.now())
      fitCanvasViewSafely(0)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [canvasRevision, fitCanvasViewSafely, flowReady, hydrated])

  useEffect(() => {
    edgesRef.current = edges
  }, [edges])

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
      const terminalNodes = connectionIndex.terminalNodes

      await Promise.all(
        terminalNodes.map(async (terminalNode) => {
          const fileNames = connectionIndex.getConnectedCanvasFileNames(terminalNode.id)
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
  }, [connectionIndex, edgesHydrated])

  const updateNodeData = useCallback(
    (nodeId: string, patch: Record<string, unknown>) => {
      // A escolha da faixa de retomada não vai para o disco, mas precisa
      // sobreviver à ida ao chat: todo patch que mexe nela passa pelo registro
      // da execução (ver a captura dos restaurados).
      terminalRunRegistry.recordNodePatch(nodeId, patch)
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

  // Como `updateNodeData`, mas o patch sai do `data` ATUAL do bloco (dentro do
  // `setNodes`), não de uma leitura que pode estar um render atrás. As regras
  // de retomada comparam com o que está gravado (a conversa anterior, por
  // exemplo); ler de `nodesRef` aqui arriscaria comparar com a versão velha.
  // `null` = nada a gravar.
  const updateNodeDataFrom = useCallback(
    (nodeId: string, derive: (data: CanvasNodeData) => Partial<CanvasNodeData> | null) => {
      setNodes((current) => {
        let changed: (typeof current)[number] | undefined
        const next = current.map((item) => {
          if (item.id !== nodeId) return item
          const patch = derive(item.data)
          if (!patch) return item
          // Mesmo espelho de `updateNodeData` (a escolha da faixa). Dentro do
          // atualizador porque o patch só existe aqui; gravar o mesmo valor
          // de novo, se o React repetir o atualizador, não muda nada.
          terminalRunRegistry.recordNodePatch(nodeId, patch)
          changed = { ...item, data: { ...item.data, ...patch } }
          return changed
        })
        if (!changed) return current
        persistNode(changed)
        return next
      })
    },
    [setNodes, persistNode],
  )

  // Conversa descoberta pelo processo principal: grava a referência (e a
  // pasta real do PTY) e, se o ID mudou, guarda a anterior em vez de
  // descartá-la — ver `agentSessionPatch`. A conversa que a pessoa mandou
  // esquecer não volta: o processo principal reemite a do PTY vivo a cada
  // reanexo (volta do chat, reload da interface), e regravá-la desfaria o
  // "Esquecer associação". Outra conversa (processo novo) volta a valer.
  const handleAgentSession = useCallback(
    (nodeId: string, reference: AgentSessionReference) => {
      if (!terminalRunRegistry.acceptAgentSession(nodeId, reference.sessionId)) return
      updateNodeDataFrom(nodeId, (data) => agentSessionPatch(data, reference, Date.now()))
    },
    [updateNodeDataFrom],
  )

  // "Esquecer associação" (cartão e painel de detalhes) é o único apagamento
  // explícito: leva a conversa atual e a falha registrada para ela; a anterior
  // (`previousAgentSession`) fica como histórico. O registro da execução
  // guarda o ID esquecido — o do bloco e o que o store ainda tem ao vivo —
  // para o reanexo não o regravar (ver `handleAgentSession`). O do bloco sai
  // do `data` atual, dentro do atualizador; registrar o mesmo ID duas vezes,
  // se o React repetir o atualizador, não muda nada.
  const forgetAgentSession = useCallback(
    (nodeId: string) => {
      terminalRunRegistry.forgetAgentSessions(nodeId, [
        store.getSessionMetadata(nodeId)?.agentSession?.sessionId,
      ])
      updateNodeDataFrom(nodeId, (data) => {
        const saved = (data as { agentSession?: unknown }).agentSession
        if (isAgentSessionReference(saved)) {
          terminalRunRegistry.forgetAgentSessions(nodeId, [saved.sessionId])
        }
        return { agentSession: undefined, resumeFailure: undefined }
      })
    },
    [store, updateNodeDataFrom],
  )

  // A CLI recusou a retomada (conversa inexistente, login). Registrar em vez
  // de repetir: o próximo spawn deste bloco espera a escolha da pessoa, e a
  // faixa diz por quê. A conversa associada continua gravada.
  const handleResumeFailure = useCallback(
    (nodeId: string, reason: AgentResumeFailure['reason'], attempted?: AgentSessionReference) =>
      updateNodeDataFrom(nodeId, (data) => resumeFailurePatch(data, reason, Date.now(), attempted)),
    [updateNodeDataFrom],
  )

  // Os relançamentos disparados de dentro dos blocos (Reiniciar do cartão e da
  // gaveta, botões da faixa de retomada) leem o `data` já renderizado — é nele
  // que está o texto de largada resolvido (padrão de qualidade, passagem) e o
  // plano de retomada. Refs, sincronizados depois do render, mantêm esses
  // callbacks estáveis: recriá-los invalidaria o cache de `data` de todos os
  // blocos a cada render.
  const renderedNodesRef = useRef<ReadonlyArray<{ id: string; type?: string; data: object }>>([])
  const performanceModeRef = useRef(performanceMode)
  useEffect(() => {
    performanceModeRef.current = performanceMode
  }, [performanceMode])

  // O ÚNICO caminho de relançamento de um bloco de terminal: o Reiniciar do
  // cartão, o da gaveta e os botões da faixa passam por aqui e pelo mesmo
  // plano (`resolveTerminalRelaunch`). Retomada pendente não sobe nada — nem
  // derruba o processo atual —, e a função diz isso a quem chamou.
  const relaunchTerminal = useCallback(
    (nodeId: string, patch: Partial<TerminalNodeData> = {}): 'restarted' | 'held' | 'missing' => {
      const rendered = renderedNodesRef.current.find((node) => node.id === nodeId)
      if (!rendered || rendered.type !== 'terminal') return 'missing'
      const data = { ...(rendered.data as TerminalNodeData), ...patch }
      const launch = resolveTerminalRelaunch({
        followsResumePlan: data.resumePlan !== undefined,
        command: data.command,
        cwd: data.cwd,
        reference: data.agentSession,
        accountId: data.accountId,
        failure: data.resumeFailure,
        choice: data.resumeChoice,
        cliVersion: data.resumeCliVersion,
        initialText: data.initialText,
        initialTextIsHandoff: data.initialTextIsHandoff,
      })
      if (launch.kind === 'hold') return 'held'

      store.restart(nodeId, {
        command: data.command,
        args: data.args,
        cwd: data.cwd,
        initialText: launch.initialText,
        initialTextIsHandoff: launch.initialTextIsHandoff,
        sourceLabel: data.label,
        fallbackCommand: data.fallbackCommand,
        keepShellOpen: data.keepShellOpen,
        accountId: data.accountId,
        providerId: data.providerId,
        // Reiniciar é spawn comum na mesma conta: nunca leva ticket da cadeia.
        accountMode: data.accountMode,
        agentSession: data.agentSession,
        resumeAgentSession: launch.resumeAgentSession,
        cliVersion: data.resumeCliVersion,
        // O store também confere a falha: nenhum relançamento automático dele
        // repete uma retomada que a CLI já recusou.
        resumeFailure: data.resumeFailure,
        terminalCount: data.terminalCount,
        performanceMode: performanceModeRef.current,
        onAgentSession: (reference) => handleAgentSession(nodeId, reference),
        onResumeFailure: (reason, attempted) => handleResumeFailure(nodeId, reason, attempted),
      })
      markTerminalStarted(nodeId)
      updateNodeData(nodeId, { sessionStartedAt: Date.now() })
      return 'restarted'
    },
    [store, updateNodeData, handleAgentSession, handleResumeFailure],
  )

  // Botão da faixa de retomada. Grava a escolha (ou limpa a falha, no "tentar
  // de novo") e relança na hora com o mesmo `patch`: o `data` renderizado
  // ainda não o tem, e um bloco que já tem processo (a CLI pedindo login, por
  // exemplo) não subiria de novo só pelo `ensure()` do cartão, que é
  // idempotente. "Dispensar aviso" só limpa a falha: o agente de pé continua.
  // Nenhuma ação apaga a conversa associada.
  const handleResumeAction = useCallback(
    (nodeId: string, action: TerminalResumeActionId) => {
      const patch = terminalResumeActionPatch(action)
      updateNodeData(nodeId, patch)
      if (terminalResumeActionRelaunches(action)) relaunchTerminal(nodeId, patch)
    },
    [updateNodeData, relaunchTerminal],
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
    [bootstrapPromptRef, store],
  )

  const { duplicateImageNode, removeTemporaryImageNode, repairImageNode } = useImageNodeActions({
    addImageNodeRef,
    edgesRef,
    nodesRef,
    removeNode,
    setEdges,
    setNodes,
    updateNodeData,
  })

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
    [fileLinkPromptRef, setEdges, store],
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
      centerNodeInSafeArea(node.position, size, 1.2, 240)
      setNodes((current) =>
        current.map((item) => ({ ...item, selected: item.id === nodeId })),
      )
    },
    [centerNodeInSafeArea, nodes, setNodes],
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
  // expanded terminal if one is open (sem Enter: a pessoa revisa e envia);
  // otherwise copy it for manual pasting.
  const activateSkill = useCallback(
    async (skill: CanvasSkill): Promise<SkillActivationResult> => {
      const prompt = buildSkillActivationPrompt(skill)
      const insertion = createSkillPromptInsertion(skill, prompt, { autoSubmit: false })
      if (expandedTerminalId) {
        const result = await store.sendText(expandedTerminalId, prompt, {
          kind: 'skill-prompt',
          insertion,
        })
        return toActivationResult(result)
      }
      await navigator.clipboard?.writeText(insertion.content)
      return 'copied'
    },
    [expandedTerminalId, store],
  )

  // Insert a pre-built automation prompt into the expanded terminal if one is
  // open; otherwise copy it for manual pasting, same fallback as skills. O Enter
  // só vai quando a inserção pede (`autoSubmit`); o catálogo só digita.
  const insertPrompt = useCallback(
    async (promptInput: PromptInsertion | string): Promise<SkillActivationResult> => {
      const insertion = typeof promptInput === 'string'
        ? createManualPromptInsertion(promptInput, { autoSubmit: false })
        : createPromptInsertion({
            ...promptInput,
            content: promptInput.content,
            autoSubmit: promptInput.autoSubmit,
          })
      if (expandedTerminalId) {
        const result = await store.sendText(expandedTerminalId, terminalTextForInsertion(insertion), {
          kind: 'catalog-prompt',
          insertion,
        })
        return toActivationResult(result)
      }
      await navigator.clipboard?.writeText(insertion.content)
      return 'copied'
    },
    [expandedTerminalId, store],
  )

  // Ditado por voz: o texto vai para a linha de entrada do terminal aberto
  // (expandido), SEM Enter. Sem terminal aberto, copia — mesmo recurso que os
  // prompts do catálogo já usam.
  const dictation = useDictation({
    deliver: async (text) => {
      if (expandedTerminalId) {
        const result = await store.typeText(expandedTerminalId, text)
        return result.delivered ? null : 'Não consegui digitar no terminal. O texto foi copiado.'
      }
      await navigator.clipboard?.writeText(text)
      return 'Nenhum terminal aberto: copiei o texto ditado. Cole onde quiser.'
    },
  })
  const { shortcut: dictationShortcut } = useDictationShortcut()
  const dictationToggle = dictation.toggle
  useEffect(() => {
    const platform = window.felixo?.platform ?? 'linux'
    const onKeyDown = (event: KeyboardEvent) => {
      if (!matchesShortcut(event, dictationShortcut, platform)) return
      event.preventDefault()
      event.stopPropagation()
      dictationToggle()
    }
    // Captura: vale mesmo com o foco dentro do terminal (o xterm consome teclas).
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [dictationShortcut, dictationToggle])

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
    const terminalCount = terminalOrder.size

    const rendered = nodes.map((node) => {
      const withHandle = { ...node, dragHandle: `.${NODE_DRAG_HANDLE_CLASS}` }

      if (node.type === 'file') {
        const linkedIds = connectionIndex.getLinkedAgentIds(node.id)
        const terminals = connectionIndex.terminalNodes
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
              onDuplicateImage: duplicateImageNode,
              onRepairImage: repairImageNode,
              onRemoveTemporaryImage: removeTemporaryImageNode,
              connectedAgents,
              availableAgents,
              onLinkAgent: linkAgentToFile,
              onUnlinkAgent: unlinkAgentFromFile,
            }
          }),
        }
      }

      if (
        node.type === 'note' ||
        node.type === 'group' ||
        node.type === 'webpage' ||
        node.type === 'notionTasks' ||
        node.type === 'drawing' ||
        node.type === 'excalidrawDrawing'
      ) {
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
        // O lembrete cita os guias do projeto deste terminal (ou os da pessoa).
        const terminalProject =
          typeof node.data.cwd === 'string' ? projectGuides.projects[node.data.cwd] : undefined
        const qualityPrompt = terminalProject
          ? resolveQualityStandardPrompt({
              stored: qualityInputs.stored,
              source: qualityStandardGuidesFrom(terminalProject) ?? qualityInputs.source,
            })
          : quality.prompt
        const connectedFileNames = connectionIndex.getConnectedCanvasFileNames(node.id)
        const canvasFilePaths = terminalCanvasFilePaths[node.id] ?? []
        const initialTextReady = isTerminalInitialTextReady({
          restoredAgentsCaptured: restoredAgentTerminals.captured,
          edgesHydrated,
          connectedCanvasFileCount: connectedFileNames.length,
          resolvedCanvasFileCount: canvasFilePaths.length,
        })
        const isDirectOpenia = isDirectOpeniaLaunch(node.data.command, node.data.args)
        const hasAgentCommand =
          isDirectOpenia ||
          (node.data.launchMode !== 'launcher' && isKnownAgentCommand(node.data.command))
        // Agente restaurado (ou com conversa associada, para o Reiniciar):
        // `explainAgentResume` decide se retoma pelo ID, digita `/resume`,
        // abre conversa nova ou — quando a conversa gravada não é exata —
        // segura o spawn até a pessoa escolher na faixa do cartão.
        const isRestoredAgent = restoredAgentTerminals.ids.has(node.id)
        const followsResumePlan = followsTerminalResumePlan({
          isRestoredAgent,
          hasAgentCommand,
          reference: node.data.agentSession,
        })
        const cliVersion = agentCliVersions?.[node.data.command ?? ''] ?? undefined
        const resumePlan = followsResumePlan
          ? explainAgentResume({
              command: node.data.command,
              cwd: node.data.cwd,
              reference: node.data.agentSession,
              accountId: node.data.accountId,
              failure: node.data.resumeFailure,
              choice: node.data.resumeChoice,
              cliVersion,
            })
          : undefined
        const resumeAgentSession = resumePlan?.outcome === 'exact'
        const resumePending = resumePlan?.outcome === 'pending'
        // Bloco restaurado ainda sem processo, com conversa gravada numa CLI
        // cujo método depende da versão: espera a versão chegar. Sem isto o
        // Gemini decidiria como "versão desconhecida" e a faixa piscaria
        // antes de a versão confirmar a retomada pelo ID.
        const waitsForCliVersion =
          agentCliVersions === null &&
          restoredAgentTerminals.holdable.has(node.id) &&
          node.data.agentSession !== undefined &&
          resumeDependsOnVersion(node.data.command)
        // Só o PRIMEIRO spawn de um bloco vindo do disco é segurado. Um bloco
        // cujo processo já subiu nesta execução (mesmo antes de uma ida ao
        // chat ou de um reload da interface) não tem o que segurar: o
        // `ensure()` dele é no-op ou só reanexa ao PTY vivo; a pendência vale
        // para o próximo Reiniciar, que mostra a faixa em vez de subir.
        const holdForResumeChoice = resumePending && restoredAgentTerminals.holdable.has(node.id)
        // Left open from a previous run: whatever it was doing may not have
        // finished, so type "/resume" on this (re)spawn instead of the usual
        // standing instruction — see restoredAgentTerminalIds above. With a
        // pending plan nothing is typed: the block waits for the person.
        const fallbackInitialText = resolveTerminalInitialText({
          isRestoredAgent: followsResumePlan,
          command: node.data.command,
          qualityStandardEnabled: quality.enabled,
          qualityStandardPrompt: qualityPrompt,
          hasCommand: hasAgentCommand,
          // `handoffText` é transitório e carrega um pedido de verdade, então
          // pode sair submetido; `initialText` é persistido e é sempre
          // contexto. O recorte cobre os blocos salvos antes desta mudança,
          // gravados com o Enter no fim — sem ele, um canvas antigo voltaria a
          // executar sozinho ao reabrir.
          existingInitialText:
            node.data.handoffText ?? stripTerminalSubmission(node.data.initialText),
          canvasFilePaths,
          identity: { agentName: node.data.label, cwd: node.data.cwd },
          cwd: node.data.cwd,
          agentSession: node.data.agentSession,
          accountId: node.data.accountId,
          resumeAgentSession,
          resumeFailure: node.data.resumeFailure,
          resumeChoice: node.data.resumeChoice,
          cliVersion,
        })
        const terminalIndex = terminalOrder.get(node.id)
        // Só quando o lembrete vai ser MONTADO aqui (agente sem texto gravado):
        // espera a camada do projeto assentar, para não subir citando os guias
        // errados. Bloco novo já nasce com o texto, montado na criação.
        const waitsForProjectGuides =
          quality.enabled &&
          hasAgentCommand &&
          !followsResumePlan &&
          typeof node.data.cwd === 'string' &&
          Boolean(node.data.cwd) &&
          !node.data.handoffText &&
          !stripTerminalSubmission(node.data.initialText) &&
          !projectGuides.settled[node.data.cwd]

        return {
          ...withHandle,
          data: reuseData(
            node.id,
            [
              node.data,
              fallbackInitialText,
              initialTextReady,
              waitsForProjectGuides,
              // O plano e a faixa são funções de `node.data` e destes flags;
              // o objeto do plano, novo a cada render, invalidaria o cache.
              followsResumePlan,
              holdForResumeChoice,
              cliVersion,
              waitsForCliVersion,
              isDirectOpenia,
              terminalIndex,
              terminalCount,
            ],
            () => ({
              ...node.data,
              // Retomada exata não digita nada; pendente não sobe — e nenhum
              // dos dois pode carregar a instrução de largada gravada.
              ...(resumeAgentSession || resumePending
                ? { initialText: undefined }
                : fallbackInitialText
                  ? { initialText: fallbackInitialText }
                  : {}),
              // A passagem vira o texto inicial deste bloco; a sessão precisa
              // saber disso para nunca reenviá-la num relançamento automático.
              initialTextIsHandoff: !resumeAgentSession && Boolean(node.data.handoffText),
              // Retomada pendente usa a mesma barreira da espera pelos
              // arquivos do canvas: o cartão não chama `ensure()` enquanto
              // for `false`. Nada sobe, nada é apagado, o canvas fica intacto
              // — "agora não" é simplesmente não clicar na faixa.
              initialTextReady:
                initialTextReady && !holdForResumeChoice && !waitsForCliVersion && !waitsForProjectGuides,
              resumeAgentSession,
              resumePlan,
              resumeCliVersion: cliVersion,
              resumeBanner: resumePlan && !waitsForCliVersion
                ? buildTerminalResumeBanner({
                    plan: resumePlan,
                    reference: node.data.agentSession,
                    cwd: node.data.cwd,
                    command: node.data.command,
                  })
                : null,
              terminalIndex,
              terminalCount,
              onExpand: openTerminal,
              onDetails: setDetailsTerminalId,
              onSessionStarted: (nodeId: string, startedAt: number) =>
                updateNodeData(nodeId, { sessionStartedAt: startedAt }),
              onAgentSession: handleAgentSession,
              onResumeFailure: handleResumeFailure,
              onResumeAction: handleResumeAction,
              onRestart: relaunchTerminal,
              onSessionEnsured: markTerminalStarted,
              onClearAgentSession: forgetAgentSession,
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
    agentCliVersions,
    connectionIndex,
    duplicateImageNode,
    edgesHydrated,
    forgetAgentSession,
    generateDiagnosis,
    handleAgentSession,
    handleResumeAction,
    handleResumeFailure,
    linkAgentToFile,
    notifyTerminalRenamed,
    nodes,
    openTerminal,
    qualityStandard,
    qualityInputs,
    projectGuides.settled,
    projectGuides.projects,
    relaunchTerminal,
    removeTemporaryImageNode,
    repairImageNode,
    restoredAgentTerminals,
    terminalCanvasFilePaths,
    unlinkAgentFromFile,
    updateNodeData,
  ])
  useEffect(() => {
    renderedNodesRef.current = renderedNodes
  }, [renderedNodes])

  // Groups must render before their children so they sit behind them.
  const orderedNodes = useMemo(() => {
    // A moldura escolhida vira classe no wrapper do nó; o realce mora no CSS.
    // Notificação não lida vira um segundo realce, na cor da categoria (a mesma
    // do painel); o CSS a declara depois da moldura, então ela vence enquanto existir.
    const notifyByNode = unreadCategoryByNode(notificationHistory)
    const framed = renderedNodes.map((node) => {
      const frame = frameClassName(node.data?.frameColor)
      const category = notifyByNode.get(node.id)
      const extra = [frame, category ? notificationClassName(category) : undefined].filter(Boolean)
      return extra.length ? { ...node, className: [node.className, ...extra].filter(Boolean).join(' ') } : node
    })
    const groups = framed.filter((node) => node.type === 'group')
    const rest = framed.filter((node) => node.type !== 'group')
    return [...groups, ...rest]
  }, [notificationHistory, renderedNodes])

  const [colorMenu, setColorMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null)
  const closeColorMenu = useCallback(() => setColorMenu(null), [])

  // Route each edge through the handles on the facing sides of its two nodes,
  // computed from their current positions. Handles aren't persisted, so without
  // this every edge (button- or drag-created) falls back to the top handle.
  // Recomputing here also re-routes wires as nodes are dragged around. Blocks
  // without side handles (note, Notion tasks...) keep their single handle —
  // asking them for `t-top` made React Flow drop the edge from the screen.
  const edgesWithHandles = useMemo(() => {
    const byId = new Map(nodes.map((node) => [node.id, node]))
    return edges.map((edge) => {
      const source = byId.get(edge.source)
      const target = byId.get(edge.target)
      if (!source || !target) {
        return edge
      }
      return {
        ...edge,
        ...edgeHandlesBetween(source, target),
        className: [
          edge.className,
          activeRouteKeys.has(routeKey(edge)) ? 'felixo-edge-route-active' : undefined,
        ]
          .filter(Boolean)
          .join(' ') || undefined,
      }
    })
  }, [activeRouteKeys, edges, nodes, routeKey])

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

      const sessionNodeIds = new Set(
        nodesRef.current.filter((node) => node.type === 'terminal').map((node) => node.id),
      )
      const removedNodeIds = releaseRemovedCanvasNodes(
        changes,
        sessionNodeIds,
        (nodeId) => store.remove(nodeId),
        removeNode,
      )
      const removeGeneratedImage = window.felixo?.files?.removeGeneratedImage
      if (removeGeneratedImage) {
        for (const change of changes) {
          if (change.type !== 'remove') continue
          const removed = nodesRef.current.find((node) => node.id === change.id)
          const data = removed?.data as {
            filePath?: string
            image?: { temporary?: boolean }
          } | undefined
          if (data?.filePath && data.image?.temporary === true) {
            void removeGeneratedImage({ path: data.filePath })
          }
        }
      }
      if (removedNodeIds.length > 0) {
        const removedIds = new Set(removedNodeIds)
        setNotificationHistory((current) =>
          current.filter((notification) => !removedIds.has(notification.nodeId)),
        )
      }
    },
    [setNodes, persistNode, removeNode, setNotificationHistory, store],
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

  // Seleção lida do próprio estado (campo `selected`), para a barra de status.
  const selection = useMemo(() => summarizeCanvasSelection(nodes, edges), [nodes, edges])

  // "Remover" da barra de status: o mesmo deleteElements que a tecla
  // Delete/Backspace chama, então passa por onEdgesChange → deleteCanvasEdge
  // e onNodesChange → removeNode, e os blocos levam junto as suas conexões.
  const removeSelection = useCallback(() => {
    const { nodeIds, edgeIds } = summarizeCanvasSelection(nodesRef.current, edgesRef.current)
    if (nodeIds.length === 0 && edgeIds.length === 0) return
    void flowInstanceRef.current?.deleteElements?.({
      nodes: nodeIds.map((id) => ({ id })),
      edges: edgeIds.map((id) => ({ id })),
    })
  }, [])

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
      const routeSink = {
        sendText: (
          nodeId: string,
          text: string,
          options?: Parameters<typeof store.sendText>[2],
        ) => {
          const delivery = store.sendText(nodeId, text, options)
          void delivery.then((result) => {
            if (result.delivered) {
              markRouteDelivered(connection)
            }
          })
          return delivery
        },
      }
      void announceFileToTerminal(connection, nodes, routeSink, fileLinkPromptRef.current)
      announceAgentCollaboration(connection, nodes, routeSink)
    },
    [fileLinkPromptRef, markRouteDelivered, setEdges, nodes, store],
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

    const safeArea = getSafeCanvasScreenRect()
    if (!safeArea) {
      return undefined
    }

    // A área útil já desconta topbar/statusbar/sidebar/painel e a coluna do
    // inspector. A gaveta não entra novamente: ela é irmã flex do container.
    const topLeft = flowInstance.screenToFlowPosition({ x: safeArea.left, y: safeArea.top })
    const bottomRight = flowInstance.screenToFlowPosition({
      x: safeArea.right,
      y: safeArea.bottom,
    })
    return {
      x: topLeft.x,
      y: topLeft.y,
      width: Math.max(0, bottomRight.x - topLeft.x),
      height: Math.max(0, bottomRight.y - topLeft.y),
    }
  }, [getSafeCanvasScreenRect])

  const addNode = useCallback(
    (type: CanvasNodeType, data?: Record<string, unknown>, position?: { x: number; y: number }) => {
      const id = `${type}-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`
      const size = getDefaultNodeSize(type, window.innerWidth)

      const node: Node = {
        id,
        type,
        position: position ?? findFreeNodePosition(nodes, size, visibleCanvasBounds()),
        width: size.width,
        height: size.height,
        data: {
          ...(data ?? (type === 'terminal' ? { label: 'Terminal' } : { text: '' })),
          // O bloco novo entra no fim do dock, e o índice é gravado já na
          // criação: assim o "#N" e a célula do Organizar não dependem de a
          // pessoa reordenar o dock alguma vez.
          orderIndex: nodes.length,
        },
      }

      setNodes((current) => [...current, node])
      persistNode(node)
      return id
    },
    [nodes, setNodes, persistNode, visibleCanvasBounds],
  )

  /** Abre as tarefas como um bloco real do grafo, não como painel flutuante. */
  const openNotionTasksNode = useCallback(() => {
    const existing = nodes.find((node) => node.type === 'notionTasks')
    if (existing) {
      focusNode(existing.id)
      return
    }

    const size = getDefaultNodeSize('notionTasks', window.innerWidth)
    const position = findFreeNodePosition(nodes, size, visibleCanvasBounds())
    const id = addNode('notionTasks', { label: 'Tarefas Notion' }, position)
    setNodes((current) =>
      current.map((node) => ({ ...node, selected: node.id === id })),
    )
    centerNodeInSafeArea(position, size, 0.8, 240)
  }, [addNode, centerNodeInSafeArea, focusNode, nodes, setNodes, visibleCanvasBounds])

  /**
   * Bloco Página Web pedido pelo menu de link (terminal, Markdown ou outra
   * Página Web). Nasce ao lado do bloco de onde o link veio; sem bloco de
   * origem no canvas (painel do Notion, System Design), numa área livre da
   * tela. Vindo de outra Página Web, nasce no perfil dela. Devolve o id para
   * o menu levar o foco ao bloco novo.
   */
  const openWebpageFromLink = useCallback(
    (url: string, sourceId?: string) => {
      const webpageSize = getDefaultNodeSize('webpage', window.innerWidth)
      const source = sourceId ? nodes.find((node) => node.id === sourceId) : undefined
      const position = source
        ? findFreeNodePositionNearNode(nodes, source.id, webpageSize)
        : findFreeNodePosition(nodes, webpageSize, visibleCanvasBounds())
      // Como o pedido de agente com `--profile`: o link de uma página logada
      // no perfil "Trabalho" continua logado nele, e não no Padrão.
      const profileId = webpageProfileForLinkSource(source)
      const id = addNode('webpage', { url, ...(profileId ? { profileId } : {}) }, position)
      setNodes((current) =>
        current.map((node) => ({ ...node, selected: node.id === id })),
      )
      const cameraSettled = centerNodeInSafeArea(position, webpageSize, 0.9, 220)
      return { id, cameraSettled }
    },
    [addNode, centerNodeInSafeArea, nodes, setNodes, visibleCanvasBounds],
  )

  const openWebpageFromAgent = useCallback(
    (url: string, profileId?: string) => {
      const webpageSize = getDefaultNodeSize('webpage', window.innerWidth)
      const position = findFreeNodePosition(nodes, webpageSize, visibleCanvasBounds())
      // `felixo browser open --embedded --profile=Nome`: o processo principal
      // já resolveu o nome; o Padrão é o bloco sem `profileId`.
      const id = addNode(
        'webpage',
        { url, ...(profileId && profileId !== 'default' ? { profileId } : {}) },
        position,
      )
      setNodes((current) =>
        current.map((node) => ({ ...node, selected: node.id === id })),
      )
      centerNodeInSafeArea(position, webpageSize, 0.9, 220)
    },
    [addNode, centerNodeInSafeArea, nodes, setNodes, visibleCanvasBounds],
  )

  useEffect(() => {
    const unsubscribe = window.felixo?.canvas?.onAgentBrowserOpen?.(({ url, profileId }) => {
      if (typeof url === 'string' && url.trim()) {
        openWebpageFromAgent(url, typeof profileId === 'string' ? profileId : undefined)
      }
    })

    return () => unsubscribe?.()
  }, [openWebpageFromAgent])

  // O menu de link é global (montado no App) e chama sempre a versão atual,
  // pela ref, sem re-registrar a cada mudança de `nodes`. Registrar é o que
  // faz o menu oferecer "Abrir como Página Web": na tela do chat não há canvas.
  const openWebpageFromLinkRef = useRef(openWebpageFromLink)
  useEffect(() => {
    openWebpageFromLinkRef.current = openWebpageFromLink
  }, [openWebpageFromLink])
  useEffect(
    () =>
      registerWebpageOpener((url, sourceId) => openWebpageFromLinkRef.current(url, sourceId)),
    [],
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

  const addImageNodeFromArtifact = useCallback(
    (artifact: CanvasImageArtifact, position?: { x: number; y: number }) => {
      if (!artifact.path || !artifact.name || !artifact.mimeType) {
        return ''
      }

      const imageSize = getDefaultNodeSize('file', window.innerWidth)
      const id = addNode(
        'file',
        {
          filePath: artifact.path,
          fileLabel: artifact.name,
          label: artifact.name,
          fileKind: 'image',
          image: {
            kind: artifact.kind,
            mimeType: artifact.mimeType,
            ...(artifact.prompt ? { prompt: artifact.prompt } : {}),
            ...(artifact.model ? { model: artifact.model } : {}),
            ...(artifact.createdAt ? { createdAt: artifact.createdAt } : {}),
            ...(typeof artifact.cost === 'number' ? { cost: artifact.cost } : {}),
            ...(artifact.requestId ? { requestId: artifact.requestId } : {}),
            ...(typeof artifact.temporary === 'boolean'
              ? { temporary: artifact.temporary }
              : {}),
          },
        },
        position,
      )
      setNodes((current) =>
        current.map((node) => ({ ...node, selected: node.id === id })),
      )
      centerNodeInSafeArea(position ?? findFreeNodePosition(nodes, imageSize, visibleCanvasBounds()), imageSize, 0.9, 220)
      return id
    },
    [addNode, centerNodeInSafeArea, nodes, setNodes, visibleCanvasBounds],
  )

  useEffect(() => {
    addImageNodeRef.current = addImageNodeFromArtifact
  }, [addImageNodeFromArtifact])

  useEffect(() => {
    const unsubscribe = window.felixo?.canvas?.onImageGenerated?.((artifact) => {
      if (artifact?.path) {
        addImageNodeFromArtifact(artifact)
      }
    })
    return () => unsubscribe?.()
  }, [addImageNodeFromArtifact])

  const pickAndOpenImageFile = useCallback(async () => {
    const result = await window.felixo?.files?.pickImage?.()
    const mimeType = result?.type ?? result?.mimeType
    if (result?.ok && !result.canceled && result.path && result.name && mimeType) {
      addImageNodeFromArtifact({
        kind: 'local-image',
        path: result.path,
        name: result.name,
        size: result.size ?? 0,
        mimeType,
        temporary: false,
      })
    }
  }, [addImageNodeFromArtifact])

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
    (options: NewTerminalOptions & { handoffText?: string; handoffAutoSubmit?: boolean }) => {
      // Agent terminals get the standing quality-standard instruction (if on)
      // plus their canvas identity (name, cwd, multi-agent setting); a plain
      // shell does not (there's no agent to read it).
      //
      // Só a passagem de responsabilidade sai submetida: ela carrega um pedido
      // que alguém despachou de propósito para este terminal. A instrução
      // permanente sozinha é contexto — fica digitada na entrada esperando o
      // usuário escrever a tarefa, em vez de o agente subir executando.
      const quality = qualityStandardRef.current
      // Os guias que valem na pasta do terminal (projeto) ou os da pessoa.
      const qualityPrompt = qualityPromptFor(options.cwd)
      const isDirectOpenia = isDirectOpeniaLaunch(options.command, options.args)
      const isOpaqueLauncher = options.launchMode === 'launcher' && !isDirectOpenia
      const isContextAwareCommand = Boolean(options.command && !isOpaqueLauncher)
      const planningInstruction = isContextAwareCommand
        ? buildPlanningFileInstruction(options.planningFile)
        : undefined
      // Preset de agente: contexto e skills dele entram no mesmo initialText,
      // que o session-store entrega por arquivo. Passagem de responsabilidade
      // (handoff) carrega o próprio pedido e não recebe preset.
      const presetInstruction = isContextAwareCommand && !options.handoffText
        ? buildPresetInstruction(options.preset, availableSkillsRef.current)
        : undefined
      const handoffSections = isContextAwareCommand && options.handoffText
        ? composeTerminalInitialText(
            quality.enabled ? buildQualityStandardMessage(qualityPrompt) : undefined,
            options.handoffText,
            planningInstruction,
          )
        : undefined
      // Na continuação da cadeia a pessoa pode desmarcar "pedir para o agente
      // continuar": aí o contexto vai sem submissão, esperando por ela.
      const handoffInstruction = handoffSections
        ? options.handoffAutoSubmit === false
          ? handoffSections
          : toSubmittedTerminalText(handoffSections)
        : undefined
      const initialText = isContextAwareCommand
        ? handoffInstruction ?? composeTerminalInitialText(
            quality.enabled
              ? buildCanvasTerminalInitialText(
                  qualityPrompt,
                  undefined,
                  [],
                  { agentName: options.label, cwd: options.cwd },
                  availableSkillsRef.current,
                )
              : undefined,
            presetInstruction,
            planningInstruction,
          )
        : undefined

      return {
        label: options.label,
        ...(options.command ? { command: options.command } : {}),
        ...(options.args && options.args.length ? { args: options.args } : {}),
        ...(options.cwd ? { cwd: options.cwd } : {}),
        ...(options.accountId ? { accountId: options.accountId } : {}),
        ...(options.providerId ? { providerId: options.providerId } : {}),
        // Só a cadeia marca `chain`; ausente o bloco é fixo (decisão 5).
        ...(options.accountMode === 'chain' ? { accountMode: 'chain' as const } : {}),
        ...(options.chainTicket ? { chainTicket: options.chainTicket } : {}),
        ...(options.chainOrigin ? { chainOrigin: options.chainOrigin } : {}),
        ...(options.launchMode ? { launchMode: options.launchMode } : {}),
        ...(options.preset?.color ? { frameColor: options.preset.color } : {}),
        ...(initialText && !options.handoffText ? { initialText } : {}),
        ...(options.handoffText ? { handoffText: initialText } : {}),
      }
    },
    [availableSkillsRef, qualityPromptFor, qualityStandardRef],
  )

  // Criar espera a camada do projeto da pasta (com prazo curto): o lembrete
  // nasce gravado no bloco, então precisa já citar os guias certos.
  const ensureProjectGuides = projectGuides.ensure
  const addTerminalNode = useCallback(
    (options: NewTerminalOptions) => {
      void ensureProjectGuides([options.cwd]).then(() => {
        addNode('terminal', buildTerminalNodeData(options))
      })
    },
    [addNode, buildTerminalNodeData, ensureProjectGuides],
  )

  /**
   * Cria o agente escolhido no diálogo já sabendo o que o anterior estava
   * fazendo. O destino vem da configuração que o usuário montou — qualquer
   * agente, qualquer modelo, qualquer direção —, e não mais de um rodízio fixo
   * entre as CLIs conhecidas, que na prática só fazia Claude → Codex.
   */
  /**
   * Cria o bloco que continua o trabalho de `sourceId`: herda os links de
   * arquivo do canvas e abre na gaveta. Compartilhado entre a passagem manual
   * e a continuação confirmada da cadeia (`useAccountContinuation`).
   */
  const createContinuationNode = useCallback(
    (
      sourceId: string,
      options: NewTerminalOptions & { handoffText: string; handoffAutoSubmit?: boolean },
    ): string | null => {
      const source = nodesRef.current.find((node) => node.id === sourceId)
      if (!source || source.type !== 'terminal') {
        return null
      }

      const newId = addNode(
        'terminal',
        buildTerminalNodeData({
          ...options,
          cwd: options.cwd ?? source.data.cwd,
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

      expandedTerminalIdRef.current = newId
      dispatchNodeMountLatch({ type: 'drawer-opened' })
      setExpandedTerminalId(newId)
      return newId
    },
    [addNode, buildTerminalNodeData, setEdges],
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
      reason?: ContinuationReason,
    ): Promise<{ ok: boolean; message?: string }> => {
      const source = nodesRef.current.find((node) => node.id === sourceId)
      if (!source || source.type !== 'terminal') {
        return { ok: false, message: 'O terminal de origem não está mais disponível.' }
      }

      const sourceData = source.data
      const handoffText = buildTerminalHandoffPrompt({
        sourceLabel: sourceData.label,
        sourceCommand: sourceData.command,
        // O diretório do destino é o que o usuário escolheu; só cai no do
        // agente de origem quando ele não escolheu projeto nenhum.
        cwd: options.cwd ?? sourceData.cwd,
        targetLabel: options.label,
        transcript,
        // Motivo só quando a passagem nasceu de uma detecção confirmada.
        ...(reason && reason.detectedAt
          ? {
              reason: {
                failureClass: reason.failureClass,
                detectedAtLabel: formatClockTime(reason.detectedAt),
              },
            }
          : {}),
      })
      const newId = createContinuationNode(sourceId, { ...options, handoffText })
      return newId
        ? { ok: true }
        : { ok: false, message: 'O terminal de origem não está mais disponível.' }
    },
    [createContinuationNode],
  )

  // Cadeia de contas: faixas dos blocos, item fixo das notificações e o
  // diálogo "Trocar de conta?". A lógica mora no hook, não aqui.
  const accountContinuation = useAccountContinuation({
    nodesRef,
    sessions: store,
    createContinuationNode,
    updateNodeData,
    focusNode,
    openTerminal,
    openHandoff: (sourceId, reason) =>
      setHandoff({ sourceId, transcript: store.getTranscript(sourceId).text, reason }),
    openChainSettings: () => {
      requestAgentUsageTab('cadeia')
      setActiveTool('agentUsage')
    },
  })

  // Starts several terminals at once (e.g. a whole agent setup) instead of
  // one `addNode` call per config: those go through the same `nodes` state
  // closure, so back-to-back calls in the same tick would all place against
  // the pre-batch list and stack on top of each other. `findFreeNodePositions`
  // (pure, tested in node-geometry.test.ts) finds free room for the whole
  // near-square matrix before everything lands in one `setNodes` + one
  // `persistNode` per node.
  const addTerminalNodes = useCallback(
    async (optionsList: NewTerminalOptions[]) => {
      if (optionsList.length === 0) {
        return
      }

      await ensureProjectGuides(optionsList.map((options) => options.cwd))
      // Depois da espera: outro bloco pode ter entrado nesse meio-tempo.
      const nodes = nodesRef.current
      const size = getDefaultNodeSize('terminal', window.innerWidth)
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
          data: { ...buildTerminalNodeData(options), orderIndex: nodes.length + index },
        }),
      )

      setNodes((current) => [...current, ...newNodes])
      newNodes.forEach((node) => persistNode(node))
    },
    [setNodes, persistNode, buildTerminalNodeData, visibleCanvasBounds, ensureProjectGuides],
  )

  const organizeCanvasBlocks = useMatrixArrange({
    edges,
    fitBoundsSafely,
    nodes,
    performanceMode,
    persistNode,
    setNodes,
  })

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
      drawing: DrawingNode,
      excalidrawDrawing: ExcalidrawDrawingNode,
      group: GroupNode,
      file: FileNode,
      webpage: WebpageNode,
      notionTasks: NotionTasksNode,
    }),
    [],
  )

  // A gaveta lê o `data` já renderizado, o mesmo do cartão: é nele que estão
  // a faixa de retomada e o texto de largada resolvido. Antes ela relançava
  // com o `initialText` cru do bloco, e o cartão não — os dois Reiniciar
  // agora passam por `relaunchTerminal`.
  const expandedNode = expandedTerminalId
    ? renderedNodes.find((node) => node.id === expandedTerminalId)
    : undefined
  const expandedNodeData = expandedNode?.data as TerminalNodeData | undefined
  const expandedTitle = expandedNodeData?.label ?? 'Terminal'
  const arrangeableCount = countArrangeableNodes(nodes)
  // Tipos de bloco presentes, só quando o catálogo do tutorial tem gatilho de
  // canvas (o v1 não tem): sem isso, arrastar um bloco nem monta a chave.
  const onboardingNodeTypesKey = useMemo(
    () => (WATCHES_CANVAS_NODE_TYPES ? nodeTypesKeyOf(nodes.map((node) => node.type)) : null),
    [nodes],
  )

  return (
    <div
      className={`flex h-full w-full ${sidebarResize.resizing ? 'is-sidebar-resizing' : ''}`}
      // A largura da sidebar vira variável CSS aqui, na raiz: a própria
      // sidebar, a barra superior, a de status e o pill de zoom leem dela,
      // então arrastar move todos juntos sem uma segunda fonte de estado.
      style={{ '--felixo-sidebar-width': `${sidebarResize.width}px` } as CSSProperties}
      data-felixo-canvas-ready
      // Sinal explícito de prontidão para o smoke (em vez de ler o texto da barra de status).
      data-felixo-hydrated={hydrated ? 'true' : 'false'}
    >
      <div
        ref={flowContainerRef}
        className="relative h-full min-w-0 flex-1"
        style={{ '--felixo-atmosphere': atmosfera } as CSSProperties}
        data-felixo-region="canvas"
        role="region"
        aria-label="Área de trabalho do canvas"
        tabIndex={0}
      >
      {isBusy && <div className="absolute inset-0 z-50 cursor-wait" aria-hidden="true" />}
      <CanvasTopbar
        onOpenSearch={() => setActiveTool('search')}
        trailing={
          <DictationButton
            dictation={dictation}
            shortcutLabel={formatShortcut(dictationShortcut, window.felixo?.platform ?? 'linux')}
          />
        }
      />
      {layoutWarning && (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          data-canvas-layout-warning
          className="pointer-events-none absolute top-16 z-10 rounded-md border border-[color-mix(in_srgb,var(--color-warning)_38%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)] px-3 py-2 text-xs text-(--color-warning) shadow-lg"
          style={{
            left: occupancy.toolbar + 16,
            maxWidth: Math.max(180, freeArea.width - 32),
          }}
        >
          {layoutWarning}
        </div>
      )}
      <CanvasAmbientLayer dense={nodes.length > 0} />
      <CanvasToolbar
        activeTool={activeTool}
        onSelectTool={(tool) => {
          if (tool === 'notionTasks') {
            setActiveTool(null)
            openNotionTasksNode()
            return
          }
          setActiveTool((current) => (current === tool ? null : tool))
        }}
        sidebarCollapsed={sidebarCollapsed}
        onSidebarCollapsedChange={onSidebarCollapsedChange}
        sidebarResize={sidebarResize}
        notificationCount={notificationCount}
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
        onOpenImage={() => void pickAndOpenImageFile()}
        onAddGroup={(name) => addNode('group', { label: name || 'Grupo' })}
        onAddWebpage={(url, name, profileId) =>
          addNode('webpage', {
            url,
            ...(name ? { label: name } : {}),
            ...(profileId ? { profileId } : {}),
          })
        }
        canvasMode={canvasMode}
        onToggleMode={() =>
          setCanvasMode((mode) => (mode === 'select' ? 'pan' : 'select'))
        }
        onFitView={() => fitCanvasViewSafely(240)}
        onExport={() => void exportAll()}
        onImportFile={(event) => void importFile(event)}
        onClear={() => void clearAll()}
        isBusy={isBusy}
        isClearing={isClearing}
        onOpenChat={onOpenChat}
      />
      {/* Host do tutorial logo depois da sidebar: Tab vai sidebar → tour → canvas. */}
      <OnboardingMount
        hydrated={hydrated && edgesHydrated}
        nodeCount={nodes.length}
        nodeTypesKey={onboardingNodeTypesKey}
      />

      {activeTool === 'notifications' && (
        <CanvasPanel
          title="Notificações"
          icon={<Bell size={15} className="text-theme-error" />}
          panelId="notifications"
          id="canvas-notifications-panel"
          onClose={() => {
            setActiveTool(null)
            window.requestAnimationFrame(() =>
              document.querySelector<HTMLElement>('[data-notifications-trigger]')?.focus(),
            )
          }}
          toolsMenuOpen={sidebarCollapsed}
        >
          <NotificationsPanel
            nodes={nodes}
            notifications={notificationHistory}
            updateItem={updateNotificationItem}
            chainItems={accountContinuation.pendingGroups}
            onViewChainOptions={accountContinuation.openProposal}
            soundEnabled={notificationSoundEnabled}
            onSoundEnabledChange={setNotificationSoundEnabled}
            volume={notificationVolume}
            onVolumeChange={setNotificationVolume}
            onClose={() => setActiveTool(null)}
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
        </CanvasPanel>
      )}

      <CanvasToolPanels
        activeTool={activeTool === 'notifications' ? null : activeTool}
        toolsMenuOpen={sidebarCollapsed}
        onClose={() => setActiveTool(null)}
        nodes={nodes}
        onFocusNode={focusNode}
        onAddNote={() => addNode('note', { text: '' })}
        onAddDrawing={() => addNode('drawing', { strokes: '' })}
        onAddExcalidrawDrawing={() => addNode('excalidrawDrawing', { scene: '' })}
        onProjectsChanged={reloadProjects}
        onRemoveFolder={removeProjectFolder}
        onRunFile={runFileInTerminal}
        onOpenFileInCanvas={openTextFileNode}
        onActivateSkill={activateSkill}
        onSkillsCatalogChange={(skills) => {
          // Sem isto a lista só era lida ao montar o canvas: ocultar ou
          // restaurar uma skill, ligar/desligar terceiros ou salvar uma skill
          // própria só chegava aos agentes novos depois de reiniciar o app.
          availableSkillsRef.current = skills
        }}
        onInsertPrompt={insertPrompt}
        onPromptSaved={(prompt) => {
          fileLinkPromptRef.current = prompt
        }}
        onBootstrapSaved={(prompt) => {
          bootstrapPromptRef.current = prompt
        }}
        onQualityStandardSaved={applySavedQualityStandard}
      />

      {detailsTerminalId && (() => {
        const detailsNode = nodes.find((node) => node.id === detailsTerminalId && node.type === 'terminal')
        return detailsNode ? (
          <TerminalDetailsPanel
            nodeId={detailsNode.id}
            data={detailsNode.data}
            cliVersion={agentCliVersions?.[detailsNode.data.command ?? ''] ?? undefined}
            onClose={() => setDetailsTerminalId(null)}
            toolsMenuOpen={sidebarCollapsed}
            onClearAgentSession={() => forgetAgentSession(detailsNode.id)}
            onAccountModeChange={(accountMode) => updateNodeData(detailsNode.id, { accountMode })}
            onFocusNode={focusNode}
          />
        ) : null
      })()}

      <TerminalsPanel
        nodes={nodes}
        activeTerminalId={expandedTerminalId}
        onFocusNode={focusNode}
        onExpandNode={openTerminal}
        onReorder={reorderNodes}
      />

        <AccountChainActionsContext.Provider value={accountContinuation.actions}>
        <ReactFlow
          key={canvasRevision}
          nodes={orderedNodes}
          edges={edgesWithHandles}
          nodeTypes={nodeTypes}
          onInit={(instance) => {
            flowInstanceRef.current = instance
            setFlowReady(true)
          }}
          onNodesChange={onNodesChange}
          onNodeDragStop={onNodeDragStop}
          onNodeContextMenu={(event, node) => {
            event.preventDefault()
            setColorMenu({ nodeId: node.id, x: event.clientX, y: event.clientY })
          }}
          onPaneClick={closeColorMenu}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onMove={handleCanvasMove}
          // O primeiro enquadramento acontece no efeito abaixo, depois que o
          // flow container e as superfícies publicaram suas medidas. Assim a
          // restauração não começa com um grupo escondido sob a topbar.
          fitView={false}
          // React Flow's default minZoom (0.5) blocks "Ver tudo"/fitView from
          // zooming out enough to frame a spread-out canvas on one screen.
          minZoom={0.05}
          // Skip rendering blocks outside the viewport — with several terminal
          // blocks (xterm) mounted, this is the biggest win on modest hardware.
          onlyRenderVisibleElements={!keepCanvasNodesMounted}
          proOptions={{ hideAttribution: true }}
          deleteKeyCode={['Delete', 'Backspace']}
          // Select mode: drag on empty canvas draws a selection box (middle/right
          // mouse still pans). Pan mode: left-drag grabs and moves the canvas.
          // Shift always adds to the selection.
          // Partial = touching/overlapping a node with the box selects it; the
          // box doesn't need to fully contain the node.
          selectionMode={SelectionMode.Partial}
          nodesDraggable={!canvasLocked}
          nodesConnectable={!canvasLocked}
          elementsSelectable={!canvasLocked}
          selectionOnDrag={canvasMode === 'select' && !canvasLocked}
          panOnDrag={canvasMode === 'select' ? [1, 2] : true}
          selectionKeyCode={null}
          multiSelectionKeyCode={['Shift']}
          // No Space-to-pan: React Flow's panActivationKeyCode fires globally,
          // even while typing in a terminal/field, swallowing the space bar.
          // Pan is reachable via 'Q' (toggle) and middle/right-drag instead.
          panActivationKeyCode={null}
          className={canvasMode === 'pan' ? 'cursor-grab' : ''}
        >
          <Background gap={32} size={1} color="rgba(237, 237, 234, 0.07)" />
          {/* Pílula `− 100% +` no formato da prancha da marca. O offset da
              esquerda recolhe via `:has()` quando a sidebar vira trilho (ver
              index.css), sem estado extra aqui. */}
          <CanvasZoomPill
            zoomPercent={zoomPercent}
            locked={canvasLocked}
            onLockedChange={setCanvasLocked}
          />
          {/* O mapa é a única superfície que pode encolher até sumir: ele
              ancora na direita da área livre, então é o primeiro a ser
              coberto quando o painel da esquerda cresce, e é também o único
              cuja ausência não impede nenhuma ação. A margem direita recolhe
              perto da borda (via `:has()`, index.css) quando o inspector
              "Elementos" está no puck — mesmo mecanismo do offset da sidebar,
              espelhado do outro lado da tela. */}
          {miniMap && !performanceMode && (
            <MiniMap
              pannable
              zoomable
              position="bottom-right"
              className="felixo-canvas-minimap mb-10!"
              style={{
                transition: 'width 160ms ease, height 160ms ease',
                width: miniMap.width,
                height: miniMap.height,
              }}
              bgColor="#0a0a0a"
              maskColor="rgba(5, 5, 5, 0.66)"
              nodeColor="#262626"
              nodeStrokeColor="#858585"
              nodeComponent={miniMapNode}
            />
          )}
        </ReactFlow>
        </AccountChainActionsContext.Provider>
        <AgentQuestionDialog />
        <AgentBrowserRequestCard />
        {colorMenu && (
          <NodeColorMenu
            x={colorMenu.x}
            y={colorMenu.y}
            current={nodes.find((node) => node.id === colorMenu.nodeId)?.data?.frameColor}
            onSelect={(color) => {
              updateNodeData(colorMenu.nodeId, { frameColor: color })
              closeColorMenu()
            }}
            onClose={closeColorMenu}
          />
        )}
        <CanvasStatusBar
          nodeCount={nodes.length}
          edgeCount={edges.length}
          hydrated={hydrated && edgesHydrated}
          selectionLabel={selection.label}
          onRemoveSelection={removeSelection}
          removeDisabled={canvasLocked}
        />
      </div>

      {expandedTerminalId && (
        <TerminalDrawer
          sessionId={expandedTerminalId}
          title={expandedTitle}
          // Só o que a prévia do arquivo aberto (nano/vim) precisa: o
          // relançamento sai de `onRestart`, pelo mesmo plano do cartão.
          restartOptions={{
            command: expandedNodeData?.command,
            args: expandedNodeData?.args,
            cwd: expandedNodeData?.cwd,
          }}
          onRestart={() => relaunchTerminal(expandedTerminalId)}
          resumeBanner={expandedNodeData?.resumeBanner ?? null}
          onResumeAction={(action) => handleResumeAction(expandedTerminalId, action)}
          onPassResponsibility={(transcript) =>
            setHandoff({ sourceId: expandedTerminalId, transcript })
          }
          onOpenFilePreview={openTextFileNode}
          readingMode={expandedNodeData?.readingMode === true}
          onReadingModeChange={(on) => updateNodeData(expandedTerminalId, { readingMode: on })}
          readingProfile={readingProfileFor(expandedNodeData?.providerId, expandedNodeData?.command)}
          onClose={closeExpandedTerminal}
        />
      )}

      {handoff && (
        <HandoffDialog
          sourceLabel={
            nodes.find((node) => node.id === handoff.sourceId)?.data.label || 'agente anterior'
          }
          projects={projects}
          onAddFolder={addProjectFolder}
          sourceSessionId={ptySessionIdForNode(handoff.sourceId)}
          reason={handoff.reason}
          onConfirm={(options) =>
            passResponsibility(handoff.sourceId, handoff.transcript, options, handoff.reason)
          }
          onClose={closeHandoff}
        />
      )}
      {accountContinuation.dialog && (
        <AccountSwitchDialog binding={accountContinuation.dialog} />
      )}
      {/* Cuida do proprio estado: o avanco da instalacao nao precisa passar
          pelo canvas para chegar na tela. */}
      <CliSetupToast />
    </div>
  )
}

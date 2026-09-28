import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { AccountSwitchProposal } from '../../shared/types/account-chain'
import type { CanvasFlowNode } from './useCanvasPersistence'
import type { TerminalNodeData } from '../types'
import type { TerminalSessionStoreApi } from '../terminal/terminal-session-api'
import { useAccountChain } from './useAccountChain'
import type { AccountChainCanvasActions } from './account-chain-actions-context'
import { changeSessionAccountMode } from '../services/account-chain-client'
import {
  groupPendingProposals,
  nodeIdFromPtySessionId,
  ptySessionIdForNode,
} from '../services/account-chain-view'
import {
  performContinuation,
  prepareRedactedTranscript,
  type ContinuationNodeOptions,
  type TranscriptPreparation,
} from '../services/account-continuation'
import type { ContinuationReason } from '../services/account-switch-dialog'
import { canvasNodeSelector, focusReturnTarget, focusWasLost } from '../services/keyboard-focus'

type DialogState = {
  proposalId: string
  sourceNodeId: string
  /** Fotografia de quando abriu, para o diálogo não sumir se a proposta fechar. */
  openedProposal: AccountSwitchProposal
  /** Proposta recalculada que o main devolveu numa recusa (SUPERSEDED/NOT_ELIGIBLE). */
  override: AccountSwitchProposal | null
  transcript: TranscriptPreparation | null
  busy: boolean
  error: string | null
  sourceActiveRequired: boolean
}

export type AccountSwitchDialogBinding = {
  proposal: AccountSwitchProposal
  /** A proposta fechou em outro lugar (expirou, foi decidida, bloco fixado). */
  closedElsewhere: boolean
  transcript: TranscriptPreparation | null
  busy: boolean
  error: string | null
  sourceActiveRequired: boolean
  canPin: boolean
  onConfirm: (params: {
    destinationAccountId: string
    autoSubmit: boolean
    acknowledgeSourceActive: boolean
  }) => void
  onLater: () => void
  onNotALimit: () => void
  onPin: () => void
  onMeasureNow: () => void
  onCheckLogin: (accountIds: string[]) => void
  onOpenChainSettings: () => void
  onGoToSource: () => void
  onClose: () => void
}

type Params = {
  nodesRef: RefObject<CanvasFlowNode[]>
  sessions: TerminalSessionStoreApi
  createContinuationNode: (sourceId: string, options: ContinuationNodeOptions) => string | null
  updateNodeData: (nodeId: string, patch: Partial<TerminalNodeData>) => void
  focusNode: (nodeId: string) => void
  openTerminal: (nodeId: string) => void
  /** "Passar responsabilidade…" com o motivo já preenchido (bloco fixo/sistema). */
  openHandoff: (sourceId: string, reason: ContinuationReason) => void
  openChainSettings: () => void
}

/**
 * Cadeia de contas dentro do canvas: as faixas dos blocos, o item fixo das
 * notificações e o diálogo "Trocar de conta?".
 *
 * Fica fora do `CanvasView` de propósito (o arquivo já passa de 2900 linhas):
 * ele só monta o hook, o provider das ações e o diálogo. Nenhum modal abre
 * sozinho — só um clique em "Ver opções" abre o diálogo, para um Enter
 * digitado noutro terminal nunca confirmar uma troca.
 */
export function useAccountContinuation({
  nodesRef,
  sessions,
  createContinuationNode,
  updateNodeData,
  focusNode,
  openTerminal,
  openHandoff,
  openChainSettings,
}: Params) {
  const { snapshot, store } = useAccountChain()
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [bannerErrors, setBannerErrors] = useState<Readonly<Record<string, string>>>({})
  const busyRef = useRef(false)
  // Os callbacks do canvas mudam de identidade a cada render (o `focusNode`
  // depende da lista de blocos). Lidos por ref, eles não recriam as ações do
  // contexto: senão todo bloco memoizado re-renderizaria a cada arrasto.
  const canvasRef = useRef({ focusNode, openTerminal, openHandoff })
  useEffect(() => {
    canvasRef.current = { focusNode, openTerminal, openHandoff }
  })
  // Quem abriu o diálogo recebe o foco de volta ao fechar (§8.2).
  const triggerRef = useRef<HTMLElement | null>(null)
  const pending = snapshot.state?.pendingProposals

  const setBannerError = useCallback((nodeId: string, message: string | null) => {
    setBannerErrors((current) => {
      if (!message) {
        if (!(nodeId in current)) return current
        const next = { ...current }
        delete next[nodeId]
        return next
      }
      return { ...current, [nodeId]: message }
    })
  }, [])

  /**
   * Fecha o diálogo e devolve o foco a quem o abriu. Recusar ou fixar faz o
   * main tirar a proposta, e a faixa (com o botão "Ver opções") some: aí o
   * foco vai ao próprio bloco, que é focável, e não cai no `body`. `settled`
   * é a resposta do main; depois dela, se o foco se perdeu, volta ao bloco.
   */
  const closeDialog = useCallback(
    (restoreFocus: boolean, sourceNodeId: string | null = null, settled?: Promise<unknown>) => {
      const trigger = triggerRef.current
      triggerRef.current = null
      setDialog(null)
      if (!restoreFocus) return
      // O alvo estável é o botão de expandir do bloco de origem; sem ele, o
      // próprio nó (focável). Nunca o `body`.
      const restore = () =>
        focusReturnTarget(trigger, () => {
          if (!sourceNodeId) return null
          const expand = Array.from(
            document.querySelectorAll<HTMLElement>('[data-terminal-expand-trigger]'),
          ).find((element) => element.dataset.terminalExpandTrigger === sourceNodeId)
          return expand ?? document.querySelector<HTMLElement>(canvasNodeSelector(sourceNodeId))
        })?.focus()
      window.requestAnimationFrame(restore)
      const afterMain = () =>
        window.requestAnimationFrame(() => {
          if (focusWasLost(document.activeElement, document.body)) restore()
        })
      void settled?.then(afterMain, afterMain)
    },
    [],
  )

  /** Abre o diálogo de uma proposta; o histórico é redigido no main já aqui. */
  const openProposal = useCallback(
    (proposalId: string, trigger: HTMLElement | null) => {
      const proposal = store.getSnapshot().state?.pendingProposals.find((item) => item.id === proposalId)
      const sourceNodeId = nodeIdFromPtySessionId(proposal?.sourceSessionId)
      if (!proposal || !sourceNodeId) return
      triggerRef.current = trigger
      setDialog({
        proposalId,
        sourceNodeId,
        openedProposal: proposal,
        override: null,
        transcript: null,
        busy: false,
        error: null,
        sourceActiveRequired: false,
      })
      const raw = sessions.getTranscript(sourceNodeId).text
      void prepareRedactedTranscript(store.bridge, raw).then((transcript) => {
        setDialog((current) => (current?.proposalId === proposalId ? { ...current, transcript } : current))
      })
    },
    [sessions, store],
  )

  const decline = useCallback(
    async (proposalId: string, reason: 'later' | 'not-a-limit'): Promise<string | null> => {
      if (!store.bridge) return null
      try {
        const result = await store.bridge.decline({ proposalId, reason })
        // NOT_PENDING: já decidida em outro lugar; nada a desfazer aqui.
        if (!result.ok && result.code !== 'NOT_PENDING') {
          return result.message ?? 'Não foi possível registrar a recusa.'
        }
        return null
      } catch {
        return 'Não foi possível falar com o processo principal.'
      }
    },
    [store],
  )

  const onBannerAction = useCallback<AccountChainCanvasActions['onBannerAction']>(
    ({ nodeId, banner, action, trigger }) => {
      const sessionId = ptySessionIdForNode(nodeId)
      const run = (task: () => Promise<string | null>) => {
        setBannerError(nodeId, null)
        void task().then((message) => setBannerError(nodeId, message))
      }
      switch (action) {
        case 'view-options':
          if (banner.proposalId) openProposal(banner.proposalId, trigger)
          return
        case 'not-a-limit':
          run(async () => {
            const message = banner.proposalId
              ? await decline(banner.proposalId, 'not-a-limit')
              : banner.accountId
                ? await store.releaseCooldown(banner.accountId, 'not-a-limit').then((result) =>
                    result.ok ? null : result.message,
                  )
                : null
            if (!message) store.clearDetection(sessionId)
            return message
          })
          return
        case 'pass-responsibility':
          if (banner.reasonClass) {
            canvasRef.current.openHandoff(nodeId, {
              failureClass: banner.reasonClass,
              detectedAt: banner.detectedAt,
            })
          }
          return
        case 'treat-as-limit':
        case 'ignore':
          run(async () => {
            if (!banner.detectionId || !store.bridge) return null
            try {
              const result = await store.bridge.resolveAmbiguous({
                detectionId: banner.detectionId,
                treatAs: action === 'treat-as-limit' ? 'limit' : 'ignore',
              })
              if (!result.ok) return result.message ?? 'Não foi possível registrar a escolha.'
              store.clearDetection(sessionId)
              return null
            } catch {
              return 'Não foi possível falar com o processo principal.'
            }
          })
          return
        case 'dismiss':
          store.clearDetection(sessionId)
          setBannerError(nodeId, null)
          return
        case 'relogin':
          // Só abre o terminal: o login é feito pela pessoa, na própria CLI.
          canvasRef.current.openTerminal(nodeId)
          return
        case 'go-to-successor':
          if (banner.successorNodeId) canvasRef.current.focusNode(banner.successorNodeId)
          return
      }
    },
    [decline, openProposal, setBannerError, store],
  )

  const actions = useMemo<AccountChainCanvasActions>(
    () => ({
      onBannerAction,
      nodeSummary: (nodeId) => {
        const node = nodesRef.current?.find((item) => item.id === nodeId)
        if (!node) return null
        return {
          label: String(node.data.label || node.data.command || 'Terminal'),
          decidedAt: node.data.chainOrigin?.decidedAt ?? null,
          reasonClass: node.data.chainOrigin?.reasonClass ?? null,
        }
      },
      errorFor: (nodeId) => bannerErrors[nodeId] ?? null,
    }),
    [bannerErrors, nodesRef, onBannerAction],
  )

  const liveProposal = dialog ? (pending?.find((item) => item.id === dialog.proposalId) ?? null) : null
  const dialogProposal = dialog ? (dialog.override ?? liveProposal ?? dialog.openedProposal) : null

  const confirm = useCallback(
    async (params: { destinationAccountId: string; autoSubmit: boolean; acknowledgeSourceActive: boolean }) => {
      if (!dialog || !dialogProposal || busyRef.current) return
      if (!dialog.transcript?.ok) return
      busyRef.current = true
      setDialog((current) => (current ? { ...current, busy: true, error: null } : current))
      try {
        const outcome = await performContinuation(
          {
            proposal: dialogProposal,
            sourceNodeId: dialog.sourceNodeId,
            destinationAccountId: params.destinationAccountId,
            autoSubmit: params.autoSubmit,
            acknowledgeSourceActive: params.acknowledgeSourceActive,
            transcript: dialog.transcript,
          },
          {
            bridge: store.bridge,
            findNodeByOrigin: (switchEventId) =>
              nodesRef.current?.find(
                (node) => node.type === 'terminal' && node.data.chainOrigin?.switchEventId === switchEventId,
              )?.id ?? null,
            getSource: (nodeId) => {
              const node = nodesRef.current?.find((item) => item.id === nodeId && item.type === 'terminal')
              return node
                ? {
                    command: node.data.command,
                    args: node.data.args,
                    launchMode: node.data.launchMode,
                    label: node.data.label,
                    cwd: node.data.cwd,
                  }
                : null
            },
            createNode: createContinuationNode,
            markSource: (sourceId, successorId) =>
              updateNodeData(sourceId, { chainSuccessorNodeId: successorId }),
            now: () => new Date(),
          },
        )
        if (outcome.ok) {
          store.clearDetection(ptySessionIdForNode(dialog.sourceNodeId))
          if (outcome.reused) focusNode(outcome.nodeId)
          // O foco vai para o bloco novo (a gaveta dele abre), não ao gatilho.
          triggerRef.current = null
          setDialog(null)
          return
        }
        setDialog((current) =>
          current
            ? {
                ...current,
                busy: false,
                error: outcome.message,
                sourceActiveRequired: current.sourceActiveRequired || outcome.code === 'SOURCE_ACTIVE',
                override: outcome.proposal ?? current.override,
              }
            : current,
        )
      } finally {
        busyRef.current = false
      }
    },
    [createContinuationNode, dialog, dialogProposal, focusNode, nodesRef, store, updateNodeData],
  )

  const binding: AccountSwitchDialogBinding | null =
    dialog && dialogProposal
      ? {
          proposal: dialogProposal,
          closedElsewhere: !liveProposal && !dialog.override,
          transcript: dialog.transcript,
          busy: dialog.busy,
          error: dialog.error,
          sourceActiveRequired: dialog.sourceActiveRequired,
          canPin: Boolean(dialogProposal.from.accountId),
          onConfirm: (params) => void confirm(params),
          onLater: () => {
            const settled = decline(dialog.proposalId, 'later')
            store.clearDetection(ptySessionIdForNode(dialog.sourceNodeId))
            closeDialog(true, dialog.sourceNodeId, settled)
          },
          onNotALimit: () => {
            const settled = decline(dialog.proposalId, 'not-a-limit')
            store.clearDetection(ptySessionIdForNode(dialog.sourceNodeId))
            closeDialog(true, dialog.sourceNodeId, settled)
          },
          onPin: () => {
            const sourceNodeId = dialog.sourceNodeId
            const settled = changeSessionAccountMode(store.bridge, ptySessionIdForNode(sourceNodeId), 'pinned').then(
              (result) => {
                if (result.persist) updateNodeData(sourceNodeId, { accountMode: 'pinned' })
                setBannerError(sourceNodeId, result.message)
              },
            )
            closeDialog(true, sourceNodeId, settled)
          },
          onMeasureNow: () => {
            void Promise.resolve(window.felixo?.agentUsage?.refresh())
              .catch(() => undefined)
              .then(() => store.refresh())
          },
          onCheckLogin: (accountIds) => void store.checkLogin(accountIds),
          onOpenChainSettings: () => {
            closeDialog(false)
            openChainSettings()
          },
          onGoToSource: () => focusNode(dialog.sourceNodeId),
          onClose: () => closeDialog(true, dialog.sourceNodeId),
        }
      : null

  const pendingGroups = useMemo(() => groupPendingProposals(pending ?? []), [pending])

  return {
    actions,
    dialog: binding,
    pendingGroups,
    openProposal,
  }
}

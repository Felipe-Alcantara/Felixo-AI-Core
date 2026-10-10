import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Node } from '@xyflow/react'
import { useSessionSnapshots, type useTerminalSessions } from '../terminal/terminal-session-context'
import {
  findNewNotificationIds,
  getActionRequiredNodeIds,
} from '../terminal/session-notifications'
import {
  appendCanvasNotifications,
  clearReadCanvasNotifications,
  markAllCanvasNotificationsRead,
  markCanvasNotificationRead,
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
import type { CanvasNodeData } from '../types'

type CanvasNotificationsOptions = {
  /** O canvas já leu os blocos do disco. */
  hydrated: boolean
  nodes: Node<CanvasNodeData>[]
  store: ReturnType<typeof useTerminalSessions>
}

/**
 * Notificações dos agentes do canvas: o histórico (persistido), o som, e a
 * regra de quando um agente que ficou aguardando vira notificação nova —
 * sem repetir o mesmo pedido depois que a pessoa já o consumiu.
 */
export function useCanvasNotifications({ hydrated, nodes, store }: CanvasNotificationsOptions) {
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

  // Ações do painel. Marcar como lida ou remover uma notificação não lida
  // também consome o pedido do agente, para ele não voltar a notificar.
  const markNotificationRead = useCallback(
    (notificationId: string) => {
      const target = notificationHistory.find(
        (notification) => notification.id === notificationId,
      )
      if (target) {
        acknowledgeNodeNotifications(target.nodeId)
      }
      setNotificationHistory((current) =>
        markCanvasNotificationRead(current, notificationId),
      )
    },
    [acknowledgeNodeNotifications, notificationHistory],
  )

  const markAllNotificationsRead = useCallback(() => {
    notificationHistory.forEach((notification) => {
      if (notification.readAt !== null) return
      acknowledgeNodeNotifications(notification.nodeId)
    })
    setNotificationHistory((current) => markAllCanvasNotificationsRead(current))
  }, [acknowledgeNodeNotifications, notificationHistory])

  const removeNotification = useCallback(
    (notificationId: string) => {
      const target = notificationHistory.find(
        (notification) => notification.id === notificationId,
      )
      if (target?.readAt === null) {
        acknowledgeNodeNotifications(target.nodeId)
      }
      setNotificationHistory((current) =>
        removeCanvasNotification(current, notificationId),
      )
    },
    [acknowledgeNodeNotifications, notificationHistory],
  )

  const clearReadNotifications = useCallback(
    () => setNotificationHistory((current) => clearReadCanvasNotifications(current)),
    [],
  )

  return {
    acknowledgeNodeNotifications,
    clearReadNotifications,
    markAllNotificationsRead,
    markNotificationRead,
    removeNotification,
    notificationHistory,
    notificationSoundEnabled,
    notificationVolume,
    setNotificationHistory,
    setNotificationSoundEnabled,
    setNotificationVolume,
  }
}

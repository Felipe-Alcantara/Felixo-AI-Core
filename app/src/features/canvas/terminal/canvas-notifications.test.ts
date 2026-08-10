import { describe, expect, it } from 'vitest'
import type { SessionSnapshot } from './terminal-session-store'
import {
  appendCanvasNotifications,
  clearReadCanvasNotifications,
  countUnreadCanvasNotifications,
  markAllCanvasNotificationsRead,
  markCanvasNotificationRead,
  markCanvasNotificationsReadForNode,
  NOTIFICATION_RETENTION_MS,
  pruneCanvasNotifications,
  removeCanvasNotification,
} from './canvas-notifications'

const idleSnapshot: SessionSnapshot = { activity: 'idle', previewLines: ['Pronto.'] }

describe('canvas notifications', () => {
  it('records new agent notifications with stable, increasing ids', () => {
    const result = appendCanvasNotifications(
      [],
      ['agent-a', 'agent-b'],
      { 'agent-a': idleSnapshot, 'agent-b': idleSnapshot },
      4,
      1_000,
    )

    expect(result.notifications.map((notification) => notification.id)).toEqual([
      'agent-a:4',
      'agent-b:5',
    ])
    expect(result.notifications.every((notification) => notification.readAt === null)).toBe(true)
    expect(result.notifications[0].createdAt).toBe(1_000)
    expect(result.nextSequence).toBe(6)
  })

  it('skips sessions that no longer have a snapshot and marks every item of a consumed agent as read', () => {
    const result = appendCanvasNotifications([], ['agent-a', 'removed'], { 'agent-a': idleSnapshot }, 0)
    expect(result.notifications).toHaveLength(1)

    const read = markCanvasNotificationsReadForNode(result.notifications, 'agent-a', 5_000)
    expect(read[0].readAt).toBe(5_000)
    expect(countUnreadCanvasNotifications(read)).toBe(0)
  })

  // Abrir um terminal marca as notificações dele como lidas, então isso roda a
  // cada clique: sem preservar a identidade, todo clique regravaria o histórico
  // no storage e re-renderizaria o painel sem nada ter mudado.
  it('keeps the same history reference when there is nothing left to mark as read', () => {
    const { notifications } = appendCanvasNotifications([], ['agent-a'], { 'agent-a': idleSnapshot }, 0)
    const read = markCanvasNotificationsReadForNode(notifications, 'agent-a', 5_000)

    expect(read).not.toBe(notifications)
    expect(markCanvasNotificationsReadForNode(read, 'agent-a', 6_000)).toBe(read)
    expect(markCanvasNotificationsReadForNode(read, 'agent-b', 6_000)).toBe(read)
    expect(markCanvasNotificationRead(read, 'agent-a:0', 6_000)).toBe(read)
    expect(markAllCanvasNotificationsRead(read, 6_000)).toBe(read)
  })

  it('replaces the unread notification from the same agent instead of duplicating it', () => {
    const first = appendCanvasNotifications([], ['agent-a'], { 'agent-a': idleSnapshot }, 0, 1_000)
    const updatedSnapshot: SessionSnapshot = { activity: 'waiting_approval', previewLines: ['Posso continuar?'] }
    const second = appendCanvasNotifications(
      first.notifications,
      ['agent-a'],
      { 'agent-a': updatedSnapshot },
      first.nextSequence,
      2_000,
    )

    expect(second.notifications).toEqual([
      { id: 'agent-a:1', nodeId: 'agent-a', snapshot: updatedSnapshot, createdAt: 2_000, readAt: null },
    ])
  })

  it('keeps read items from the same agent as history', () => {
    const first = appendCanvasNotifications([], ['agent-a'], { 'agent-a': idleSnapshot }, 0, 1_000)
    const read = markCanvasNotificationsReadForNode(first.notifications, 'agent-a', 1_500)
    const second = appendCanvasNotifications(
      read,
      ['agent-a'],
      { 'agent-a': idleSnapshot },
      first.nextSequence,
      2_000,
    )

    expect(second.notifications.map((notification) => notification.id)).toEqual([
      'agent-a:0',
      'agent-a:1',
    ])
    expect(countUnreadCanvasNotifications(second.notifications)).toBe(1)
  })

  it('marks a single item as read without touching the agent\'s other entries', () => {
    const history = appendCanvasNotifications(
      [],
      ['agent-a', 'agent-b'],
      { 'agent-a': idleSnapshot, 'agent-b': idleSnapshot },
      0,
    ).notifications

    const read = markCanvasNotificationRead(history, 'agent-a:0', 9_000)
    expect(read[0].readAt).toBe(9_000)
    expect(read[1].readAt).toBeNull()
  })

  it('marks every unread item as read at once', () => {
    const history = appendCanvasNotifications(
      [],
      ['agent-a', 'agent-b'],
      { 'agent-a': idleSnapshot, 'agent-b': idleSnapshot },
      0,
    ).notifications

    expect(countUnreadCanvasNotifications(markAllCanvasNotificationsRead(history, 7_000))).toBe(0)
  })

  it('removes a single item and clears read ones', () => {
    const history = appendCanvasNotifications(
      [],
      ['agent-a', 'agent-b'],
      { 'agent-a': idleSnapshot, 'agent-b': idleSnapshot },
      0,
    ).notifications

    expect(removeCanvasNotification(history, 'agent-a:0').map((item) => item.id)).toEqual([
      'agent-b:1',
    ])

    const partiallyRead = markCanvasNotificationRead(history, 'agent-a:0')
    expect(clearReadCanvasNotifications(partiallyRead).map((item) => item.id)).toEqual([
      'agent-b:1',
    ])
  })

  it('prunes read items past the retention window but keeps unread ones', () => {
    const now = 10 * NOTIFICATION_RETENTION_MS
    const history = [
      { id: 'a:0', nodeId: 'a', snapshot: idleSnapshot, createdAt: 0, readAt: 1 },
      { id: 'b:1', nodeId: 'b', snapshot: idleSnapshot, createdAt: 0, readAt: null },
      { id: 'c:2', nodeId: 'c', snapshot: idleSnapshot, createdAt: now - 1_000, readAt: now },
    ]

    expect(pruneCanvasNotifications(history, now).map((item) => item.id)).toEqual(['b:1', 'c:2'])
  })
})

describe('countUnreadCanvasNotifications com blocos existentes', () => {
  const historico = appendCanvasNotifications(
    [],
    ['agent-a', 'agent-b'],
    { 'agent-a': idleSnapshot, 'agent-b': idleSnapshot },
    1,
    1_000,
  ).notifications

  it('conta apenas notificações de blocos que ainda existem', () => {
    // O bug que motivou isto: o badge somava notificações de terminais já
    // fechados, então marcava 5 enquanto o painel — que filtra pelos blocos
    // presentes — mostrava 0 e "nenhum agente aguardando ação".
    expect(countUnreadCanvasNotifications(historico, ['agent-a'])).toBe(1)
  })

  it('zera quando nenhum dos blocos existe mais', () => {
    expect(countUnreadCanvasNotifications(historico, [])).toBe(0)
  })

  it('conta todas as não lidas quando todos os blocos existem', () => {
    expect(countUnreadCanvasNotifications(historico, ['agent-a', 'agent-b'])).toBe(2)
  })

  it('ignora as já lidas mesmo com o bloco presente', () => {
    const lidas = markAllCanvasNotificationsRead(historico, 5_000)

    expect(countUnreadCanvasNotifications(lidas, ['agent-a', 'agent-b'])).toBe(0)
  })

  it('sem a lista de blocos, conta o histórico inteiro', () => {
    // Mantém o comportamento antigo para quem não passa os blocos, para a
    // mudança não exigir atualizar todos os chamadores de uma vez.
    expect(countUnreadCanvasNotifications(historico)).toBe(2)
  })
})

describe('pruneCanvasNotifications com blocos existentes', () => {
  const historico = appendCanvasNotifications(
    [],
    ['agent-a', 'agent-b'],
    { 'agent-a': idleSnapshot, 'agent-b': idleSnapshot },
    1,
    1_000,
  ).notifications

  it('descarta notificações de blocos que não existem mais', () => {
    // Uma notificação não lida nunca expira pela retenção, então sem esta
    // regra o histórico de um terminal fechado ficaria guardado para sempre.
    const podado = pruneCanvasNotifications(historico, 2_000, NOTIFICATION_RETENTION_MS, [
      'agent-a',
    ])

    expect(podado.map((notification) => notification.nodeId)).toEqual(['agent-a'])
  })

  it('sem a lista de blocos, poda apenas por idade', () => {
    const podado = pruneCanvasNotifications(historico, 2_000)

    expect(podado).toHaveLength(2)
  })

  it('continua removendo as lidas antigas', () => {
    const lidas = markAllCanvasNotificationsRead(historico, 1_500)
    const podado = pruneCanvasNotifications(
      lidas,
      1_500 + NOTIFICATION_RETENTION_MS + 1,
      NOTIFICATION_RETENTION_MS,
      ['agent-a', 'agent-b'],
    )

    expect(podado).toHaveLength(0)
  })
})

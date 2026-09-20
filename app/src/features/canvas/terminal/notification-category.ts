import type { CanvasNotification } from './canvas-notifications'
import type { SessionSnapshot } from './terminal-session-store'

/**
 * Categorias de notificação e a cor de cada uma. A COR mora no CSS
 * (`--felixo-notify-<categoria>` em `index.css`, com valor próprio no tema de
 * alto contraste); o painel e a borda do nó usam o mesmo token, então não há
 * como ficarem dessincronizados. Aqui só vive a regra "snapshot → categoria".
 */
export type NotificationCategory = 'needs-response' | 'finished' | 'failed'

/** Da mais urgente para a menos: se um nó reunir mais de uma, vale a primeira. */
export const NOTIFICATION_CATEGORY_PRIORITY: readonly NotificationCategory[] = [
  'failed',
  'needs-response',
  'finished',
]

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  'needs-response': 'Precisa de resposta',
  finished: 'Terminou',
  failed: 'Falhou',
}

export function notificationCategory(snapshot: SessionSnapshot): NotificationCategory {
  switch (snapshot.activity) {
    case 'idle':
      return 'finished'
    case 'exited':
      return snapshot.exitCode === 0 ? 'finished' : 'failed'
    case 'error':
      return 'failed'
    default:
      // waiting_approval e qualquer estado que gere aviso sem ser conclusão.
      return 'needs-response'
  }
}

/** Token de cor da categoria, para `style={{ color }}` ou `var()` em CSS. */
export function notificationColorVar(category: NotificationCategory): string {
  return `var(--felixo-notify-${category})`
}

/** Classe aplicada ao wrapper do nó no React Flow (o realce mora no CSS). */
export function notificationClassName(category: NotificationCategory): string {
  return `felixo-notify felixo-notify-${category}`
}

/**
 * Categoria a mostrar em cada nó: só notificações NÃO lidas contam (ler remove a
 * borda) e, havendo mais de uma no mesmo nó, vence a mais urgente.
 */
export function unreadCategoryByNode(
  history: readonly CanvasNotification[],
): Map<string, NotificationCategory> {
  const byNode = new Map<string, NotificationCategory>()
  for (const notification of history) {
    if (notification.readAt !== null) continue
    const category = notificationCategory(notification.snapshot)
    const current = byNode.get(notification.nodeId)
    if (
      !current ||
      NOTIFICATION_CATEGORY_PRIORITY.indexOf(category) < NOTIFICATION_CATEGORY_PRIORITY.indexOf(current)
    ) {
      byNode.set(notification.nodeId, category)
    }
  }
  return byNode
}

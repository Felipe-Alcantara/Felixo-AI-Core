import {
  NOTIFICATION_CATEGORY_LABELS,
  type NotificationCategory,
} from '../terminal/notification-category'
import type { SystemNotificationPreferences } from './notification-preferences'

/** Tempo para juntar vários agentes que avisam quase juntos em um só aviso. */
export const DESKTOP_ATTENTION_BATCH_MS = 1000

export type DesktopAttentionItem = {
  nodeId: string
  /** Nome do bloco no canvas — nunca texto da saída do terminal. */
  label: string
  category: NotificationCategory
}

export type DesktopAttentionPlan = { title: string; body: string; nodeId?: string }

/**
 * Decide o aviso do sistema para um lote de agentes. Devolve `null` quando
 * nada deve avisar: opção desligada, app em foco ou nenhuma categoria ligada.
 * O texto só tem categoria e nome do bloco, porque a notificação aparece até
 * na tela bloqueada e a saída do terminal pode ter segredo.
 */
export function planDesktopAttention(
  items: readonly DesktopAttentionItem[],
  preferences: SystemNotificationPreferences,
  appFocused: boolean,
): DesktopAttentionPlan | null {
  if (!preferences.enabled || appFocused) return null
  const wanted = items.filter((item) => preferences.categories[item.category])
  if (wanted.length === 0) return null

  if (wanted.length === 1) {
    const [only] = wanted
    return { title: NOTIFICATION_CATEGORY_LABELS[only.category], body: only.label, nodeId: only.nodeId }
  }

  const names = wanted.slice(0, 3).map((item) => item.label)
  const more = wanted.length > 3 ? ` e mais ${wanted.length - 3}` : ''
  // Com vários não há um destino só; o clique apenas traz o app para a frente.
  return { title: `${wanted.length} agentes precisam de você`, body: `${names.join(', ')}${more}` }
}

import type { CanvasNotification } from '../terminal/canvas-notifications'
import { NOTIFICATION_CATEGORY_PRIORITY, notificationCategory } from '../terminal/notification-category'

/**
 * Atalhos de teclado do canvas para pular entre agentes, e a lista que a folha
 * de atalhos mostra. Lógica pura: o hook `useTerminalShortcuts` liga isto ao DOM.
 *
 * Tabela de conflitos (conferida contra a documentação do modo interativo do
 * Claude Code e o readline): `Alt+1..9` não existe no Claude Code (o agent view
 * usa a mesma ideia); `Alt+Q` e `Alt+N` não são teclas do Claude Code, e no
 * readline `Alt+N` só é a busca de histórico para a frente, que quase ninguém
 * usa. A gaveta já usa `Alt+Shift+setas/Z`, e o diff do Claude Code usa
 * `Alt+↑/↓`: nenhum atalho daqui usa essas combinações.
 */

export type ShortcutPlatform = 'darwin' | 'win32' | 'linux' | string

export type ShortcutAction =
  | { type: 'jump'; number: number }
  | { type: 'next-pending' }
  | { type: 'show-numbers' }
  | { type: 'help' }

type KeyEventLike = Pick<KeyboardEvent, 'code' | 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>

/**
 * Evento → ação. Olha `code`, não `key`: no macOS `Option+dígito` produz
 * caracteres (`¡`, `™`) e `key` não serve. O `Alt` tem de vir sozinho (sem
 * Ctrl/Cmd/Shift): AltGr no Windows chega como Ctrl+Alt e digita caracteres.
 */
export function shortcutActionFromEvent(event: KeyEventLike): ShortcutAction | null {
  if (event.ctrlKey || event.metaKey) return null
  if (event.altKey) {
    if (event.shiftKey) return null
    const digit = /^Digit([1-9])$/.exec(event.code)
    if (digit) return { type: 'jump', number: Number(digit[1]) }
    if (event.code === 'KeyN') return { type: 'next-pending' }
    if (event.code === 'KeyQ') return { type: 'show-numbers' }
    return null
  }
  return event.key === '?' ? { type: 'help' } : null
}

/**
 * O alvo do evento deixa o atalho agir? `?` (tecla simples) só vale fora de
 * campos e do terminal; os atalhos com `Alt` valem também dentro do terminal
 * (o xterm tem um textarea escondido), mas não em campos de texto de verdade.
 */
export function shortcutAllowedOn(action: ShortcutAction, target: EventTarget | null): boolean {
  const element = target as { closest?: (selector: string) => unknown } | null
  if (!element?.closest) return true
  if (action.type === 'help') {
    return !element.closest('input, textarea, select, [contenteditable="true"], .xterm, [data-terminals-dock]')
  }
  if (element.closest('.xterm')) return true
  return !element.closest('input, textarea, select, [contenteditable="true"]')
}

/**
 * A notificação não lida mais urgente: falhou, depois precisa de resposta,
 * depois terminou; dentro da mesma categoria, a mais antiga. Só conta quem
 * ainda tem terminal (`validIds`).
 */
export function nextPendingNode(
  history: readonly CanvasNotification[],
  validIds: ReadonlySet<string>,
): string | null {
  let best: { nodeId: string; rank: number; createdAt: number } | null = null
  for (const notification of history) {
    if (notification.readAt !== null || !validIds.has(notification.nodeId)) continue
    const rank = NOTIFICATION_CATEGORY_PRIORITY.indexOf(notificationCategory(notification.snapshot))
    if (!best || rank < best.rank || (rank === best.rank && notification.createdAt < best.createdAt)) {
      best = { nodeId: notification.nodeId, rank, createdAt: notification.createdAt }
    }
  }
  return best?.nodeId ?? null
}

/**
 * Dígitos digitados com os números à vista → agente. Com 12 agentes, "1" ainda
 * pode virar "10", "11" ou "12": só abre na hora quando nenhum número maior
 * começa com o que foi digitado; senão espera o próximo dígito (o hook dá um
 * prazo curto antes de abrir o que já está digitado).
 */
export function resolveNumberBuffer(
  buffer: string,
  total: number,
): { number: number | null; final: boolean } {
  const number = Number(buffer)
  if (!buffer || !Number.isInteger(number) || number < 1 || number > total) {
    return { number: null, final: number > total || buffer.length >= String(total).length }
  }
  return { number, final: number * 10 > total }
}

// ── Lista da folha de atalhos ──────────────────────────────────────────────

export type ShortcutEntry = {
  id: string
  /** Texto com `Mod`, `Alt` e `Shift`; `formatShortcutKeys` traduz para o SO. */
  keys: string
  description: string
  context: string
}

export const CANVAS_SHORTCUTS: readonly ShortcutEntry[] = [
  { id: 'jump', keys: 'Alt+1…9', description: 'Abrir o agente #N (o número aparece no cartão e no dock)', context: 'Em qualquer lugar, inclusive dentro de outro terminal' },
  { id: 'next-pending', keys: 'Alt+N', description: 'Ir ao próximo agente que precisa de você (falhou, depois espera resposta, depois terminou)', context: 'Em qualquer lugar' },
  { id: 'show-numbers', keys: 'Alt+Q', description: 'Mostrar o número de cada agente por 2 segundos; digite o número para abrir', context: 'Em qualquer lugar' },
  { id: 'help', keys: '?', description: 'Abrir esta lista de atalhos', context: 'Fora de campos de texto e do terminal' },
  { id: 'dock-step', keys: 'Shift+↑ / Shift+↓', description: 'Agente anterior ou próximo do dock, já abrindo a gaveta', context: 'Em qualquer lugar' },
  { id: 'drawer-focus', keys: 'Alt+Shift+setas', description: 'Mover o foco entre painéis da gaveta dividida', context: 'Gaveta aberta' },
  { id: 'drawer-zoom', keys: 'Alt+Shift+Z', description: 'Ampliar ou restaurar o painel da gaveta', context: 'Gaveta aberta' },
  { id: 'dock-open', keys: 'Shift+Enter', description: 'Abrir o item ativo do dock', context: 'Dock de terminais' },
  { id: 'dock-reorder', keys: 'Alt+↑ / Alt+↓', description: 'Reordenar a linha ativa do dock', context: 'Dock de terminais' },
  { id: 'search', keys: 'Mod+K', description: 'Busca no canvas e comandos', context: 'Em qualquer lugar' },
  { id: 'drawer-close', keys: 'Esc', description: 'Fechar a gaveta', context: 'Fora do terminal' },
  { id: 'mode', keys: 'Q', description: 'Alternar selecionar e mover', context: 'Canvas em foco' },
]

const KEY_LABELS: Record<string, { mac: string; other: string }> = {
  Mod: { mac: '⌘', other: 'Ctrl' },
  Alt: { mac: '⌥', other: 'Alt' },
  Shift: { mac: '⇧', other: 'Shift' },
}

/** `Alt+Shift+Z` → `⌥⇧Z` no macOS; `Mod+K` → `Ctrl+K` no resto. */
export function formatShortcutKeys(keys: string, platform: ShortcutPlatform): string {
  const mac = platform === 'darwin'
  const translate = (part: string) => {
    const label = KEY_LABELS[part.trim()]
    return label ? (mac ? label.mac : label.other) : part
  }
  return keys
    .split(' / ')
    .map((combo) => {
      const parts = combo.split('+').map(translate)
      return mac && parts.length > 1 ? parts.join('') : parts.join('+')
    })
    .join(' / ')
}

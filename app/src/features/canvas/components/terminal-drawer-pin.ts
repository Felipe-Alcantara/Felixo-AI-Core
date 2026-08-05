const PIN_STORAGE_KEY = 'felixo:terminal-drawer-pinned'

export function readPinnedPreference(storage: Pick<Storage, 'getItem'>): boolean {
  return storage.getItem(PIN_STORAGE_KEY) === '1'
}

export function writePinnedPreference(
  storage: Pick<Storage, 'setItem'>,
  pinned: boolean,
): void {
  storage.setItem(PIN_STORAGE_KEY, pinned ? '1' : '0')
}

const COLLAPSED_STORAGE_KEY = 'felixo:terminal-drawer-collapsed'
const WIDTH_STORAGE_KEY = 'felixo:terminal-drawer-width'

/** Width of the collapsed rail: just the header buttons, no terminal. */
export const COLLAPSED_WIDTH = 44

export function readCollapsedPreference(storage: Pick<Storage, 'getItem'>): boolean {
  return storage.getItem(COLLAPSED_STORAGE_KEY) === '1'
}

export function writeCollapsedPreference(
  storage: Pick<Storage, 'setItem'>,
  collapsed: boolean,
): void {
  storage.setItem(COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0')
}

/** Restores the dragged width, ignoring stored values outside the allowed range. */
export function readWidthPreference(
  storage: Pick<Storage, 'getItem'>,
  fallback: number,
  minWidth: number,
  maxWidth: number,
): number {
  const stored = Number(storage.getItem(WIDTH_STORAGE_KEY))
  if (!Number.isFinite(stored) || stored <= 0) {
    return fallback
  }
  return Math.min(Math.max(stored, minWidth), maxWidth)
}

export function writeWidthPreference(
  storage: Pick<Storage, 'setItem'>,
  width: number,
): void {
  storage.setItem(WIDTH_STORAGE_KEY, String(Math.round(width)))
}

/**
 * Decides whether a pointerdown outside the drawer should close it.
 * Pinned drawers never close from an outside click.
 */
export function shouldCloseOnOutsideClick(
  pinned: boolean,
  container: Node | null,
  target: Node | null,
): boolean {
  if (pinned) {
    return false
  }
  if (!container) {
    return true
  }
  return !container.contains(target)
}

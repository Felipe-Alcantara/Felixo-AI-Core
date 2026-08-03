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

const STORAGE_KEY = 'felixo:elements-dock-collapsed'

type StorageReader = Pick<Storage, 'getItem'>
type StorageWriter = Pick<Storage, 'setItem'>

/** The dock starts expanded; only an explicit collapse is remembered. */
export function readDockCollapsed(storage?: StorageReader): boolean {
  try {
    return storage?.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function writeDockCollapsed(collapsed: boolean, storage?: StorageWriter): void {
  try {
    storage?.setItem(STORAGE_KEY, collapsed ? '1' : '0')
  } catch {
    // The dock must still toggle when browser storage is unavailable.
  }
}

export function browserStorage(): Storage | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

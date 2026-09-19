import { useCallback, useSyncExternalStore } from 'react'
import { DEFAULT_DICTATION_SHORTCUT, readShortcut } from '../services/dictation'

const STORAGE_KEY = 'felixo:dictation-shortcut'
const CHANGED_EVENT = 'felixo:dictation-shortcut-changed'

function read(): string {
  try {
    return readShortcut(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return DEFAULT_DICTATION_SHORTCUT
  }
}

function subscribe(listener: () => void) {
  window.addEventListener(CHANGED_EVENT, listener)
  window.addEventListener('storage', listener)
  return () => {
    window.removeEventListener(CHANGED_EVENT, listener)
    window.removeEventListener('storage', listener)
  }
}

/** Atalho do ditado: lido do localStorage, com aviso entre quem mostra e quem escuta. */
export function useDictationShortcut() {
  const shortcut = useSyncExternalStore(subscribe, read, () => DEFAULT_DICTATION_SHORTCUT)
  const setShortcut = useCallback((next: string) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, readShortcut(next))
    } catch {
      // Sem localStorage o atalho só vale até recarregar.
    }
    window.dispatchEvent(new Event(CHANGED_EVENT))
  }, [])
  return { shortcut, setShortcut }
}

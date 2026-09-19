import { useSyncExternalStore } from 'react'
import { webviewProfilesStore } from '../services/webview-profiles-store'

/** Perfis do navegador interno (só os da pessoa; o Padrão é implícito) + se a lista já chegou. */
export function useWebviewProfiles() {
  const profiles = useSyncExternalStore(webviewProfilesStore.subscribe, webviewProfilesStore.getSnapshot)
  const ready = useSyncExternalStore(webviewProfilesStore.subscribe, webviewProfilesStore.isReady)
  return { profiles, ready, create: webviewProfilesStore.create, remove: webviewProfilesStore.remove }
}

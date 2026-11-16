import { useSyncExternalStore } from 'react'
import { webviewSitePermissionsStore as store } from '../services/webview-site-permissions'

/** Pedidos de permissão pendentes e decisões lembradas dos sites (blocos Página Web). */
export function useWebviewSitePermissions() {
  const pending = useSyncExternalStore(store.subscribe, store.getPending)
  const decisions = useSyncExternalStore(store.subscribe, store.getDecisions)
  return { pending, decisions, respond: store.respond, revoke: store.revoke }
}

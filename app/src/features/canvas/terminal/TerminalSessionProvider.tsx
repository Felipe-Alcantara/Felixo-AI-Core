import { useEffect, useState, type ReactNode } from 'react'
import { TerminalSessionContext } from './terminal-session-context'
import { DeferredTerminalSessionStore } from './deferred-terminal-session-store'
import { MockTerminalSessionStore } from './mock-terminal-session-store'
import type { TerminalSessionStoreApi } from './terminal-session-api'

/**
 * Provides a single TerminalSessionStore for the whole canvas, so terminal
 * sessions outlive the mounting/unmounting of individual node cards.
 */
export function TerminalSessionProvider({ children }: { children: ReactNode }) {
  const [store] = useState<TerminalSessionStoreApi>(
    () =>
      typeof window !== 'undefined' && window.felixo?.devtools?.mockPty
        ? new MockTerminalSessionStore()
        : new DeferredTerminalSessionStore(),
  )
  // Ir ao Chat desmonta o canvas e, na volta, este provider cria outro store:
  // o antigo solta os xterms e as rotas da ponte, e os PTYs seguem vivos para o
  // novo reanexar pelo replay.
  useEffect(() => () => store.detachAll(), [store])

  return (
    <TerminalSessionContext.Provider value={store}>
      {children}
    </TerminalSessionContext.Provider>
  )
}

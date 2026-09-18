import { useState, type ReactNode } from 'react'
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

  return (
    <TerminalSessionContext.Provider value={store}>
      {children}
    </TerminalSessionContext.Provider>
  )
}

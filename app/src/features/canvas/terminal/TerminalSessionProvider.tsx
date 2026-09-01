import { useState, type ReactNode } from 'react'
import { TerminalSessionContext } from './terminal-session-context'
import { DeferredTerminalSessionStore } from './deferred-terminal-session-store'

/**
 * Provides a single TerminalSessionStore for the whole canvas, so terminal
 * sessions outlive the mounting/unmounting of individual node cards.
 */
export function TerminalSessionProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => new DeferredTerminalSessionStore())

  return (
    <TerminalSessionContext.Provider value={store}>
      {children}
    </TerminalSessionContext.Provider>
  )
}

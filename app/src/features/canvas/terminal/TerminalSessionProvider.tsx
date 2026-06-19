import { useState, type ReactNode } from 'react'
import { TerminalSessionStore } from './terminal-session-store'
import { TerminalSessionContext } from './terminal-session-context'

/**
 * Provides a single TerminalSessionStore for the whole canvas, so terminal
 * sessions outlive the mounting/unmounting of individual node cards.
 */
export function TerminalSessionProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => new TerminalSessionStore())

  return (
    <TerminalSessionContext.Provider value={store}>
      {children}
    </TerminalSessionContext.Provider>
  )
}

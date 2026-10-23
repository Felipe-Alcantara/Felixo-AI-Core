import { useEffect, useState } from 'react'

import {
  HIDDEN_CLAUDE_SCROLL_RAIL,
  type ClaudeScrollRailState,
} from '../terminal/terminal-claude-scroll'
import { useTerminalSessions } from '../terminal/terminal-session-context'

/**
 * O trilho de rolagem do Claude em tela cheia, relido quando a tela muda
 * (`subscribeOutput` já avisa no máximo uma vez por quadro), quando o processo
 * muda de estado e quando o terminal é reiniciado. Só republica quando o
 * resultado muda, para o streaming não virar um render por quadro.
 */
export function useClaudeScrollRail(
  sessionId: string,
  generation: number | undefined,
  activity: string | undefined,
): ClaudeScrollRailState {
  const store = useTerminalSessions()
  const [rail, setRail] = useState<ClaudeScrollRailState>(HIDDEN_CLAUDE_SCROLL_RAIL)

  useEffect(() => {
    const refresh = () =>
      setRail((current) => {
        const next = store.getClaudeScrollRail(sessionId)
        return next.visible === current.visible && next.scrolledUp === current.scrolledUp ? current : next
      })
    refresh()
    return store.subscribeOutput(sessionId, refresh)
  }, [store, sessionId, generation, activity])

  return rail
}

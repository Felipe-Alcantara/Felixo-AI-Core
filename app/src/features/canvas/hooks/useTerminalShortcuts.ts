import { useCallback, useEffect, useRef, useState } from 'react'
import type { CanvasNotification } from '../terminal/canvas-notifications'
import {
  nextPendingNode,
  resolveNumberBuffer,
  shortcutActionFromEvent,
  shortcutAllowedOn,
} from '../services/canvas-shortcuts'

/** Quanto tempo os números ficam à vista (e a espera pelo segundo dígito do #10+). */
export const NUMBERS_VISIBLE_MS = 2000
const SECOND_DIGIT_MS = 700
export const NO_PENDING_MESSAGE = 'Ninguém esperando você'

type Options = {
  /** Ids dos terminais na ordem do #N (o primeiro é o #1). */
  terminalIds: readonly string[]
  notifications: readonly CanvasNotification[]
  openTerminal: (nodeId: string) => void
  /** `false` enquanto o canvas está ocupado (limpar/importar). */
  enabled: boolean
}

/**
 * Atalhos globais para pular entre agentes: `Alt+1..9` (#N), `Alt+N` (próximo
 * que precisa de você), `Alt+Q` (números à vista) e `?` (lista de atalhos). Em
 * fase de captura, antes do xterm, como o `Ctrl+K` e o ditado. Abrir passa
 * sempre por `openTerminal`, o mesmo caminho do clique no dock.
 */
export function useTerminalShortcuts(options: Options) {
  const [numbersVisible, setNumbersVisible] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const latest = useRef(options)
  useEffect(() => {
    latest.current = options
  })
  const buffer = useRef('')
  const numbersTimer = useRef<number | undefined>(undefined)
  const messageTimer = useRef<number | undefined>(undefined)
  const numbersOn = useRef(false)

  const hideNumbers = useCallback(() => {
    window.clearTimeout(numbersTimer.current)
    numbersOn.current = false
    buffer.current = ''
    setNumbersVisible(false)
  }, [])
  const showNumbers = useCallback(() => {
    window.clearTimeout(numbersTimer.current)
    numbersOn.current = true
    setNumbersVisible(true)
    numbersTimer.current = window.setTimeout(hideNumbers, NUMBERS_VISIBLE_MS)
  }, [hideNumbers])
  const closeSheet = useCallback(() => setSheetOpen(false), [])
  const openSheet = useCallback(() => setSheetOpen(true), [])

  useEffect(() => {
    const jumpTo = (number: number) => {
      const id = latest.current.terminalIds[number - 1]
      // Sem agente com esse número, não faz nada.
      if (id) latest.current.openTerminal(id)
    }
    const swallow = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      const { enabled, terminalIds, notifications } = latest.current
      // Com números à vista, dígito solto escolhe o agente; Esc dispensa.
      if (numbersOn.current && !event.altKey && !event.ctrlKey && !event.metaKey) {
        if (event.key === 'Escape') {
          swallow(event)
          hideNumbers()
          return
        }
        if (/^[0-9]$/.test(event.key)) {
          swallow(event)
          buffer.current += event.key
          const { number, final } = resolveNumberBuffer(buffer.current, terminalIds.length)
          window.clearTimeout(numbersTimer.current)
          if (number !== null && final) {
            hideNumbers()
            jumpTo(number)
          } else if (number === null && final) {
            hideNumbers()
          } else {
            numbersTimer.current = window.setTimeout(() => {
              const pending = resolveNumberBuffer(buffer.current, latest.current.terminalIds.length).number
              hideNumbers()
              if (pending !== null) jumpTo(pending)
            }, SECOND_DIGIT_MS)
          }
          return
        }
      }
      const action = shortcutActionFromEvent(event)
      if (!action || event.repeat || !enabled || !shortcutAllowedOn(action, event.target)) return
      // A folha de atalhos é modal: `?` alterna, o resto espera ela fechar.
      if (action.type === 'help') {
        swallow(event)
        setSheetOpen((open) => !open)
        return
      }
      if (document.querySelector('[aria-modal="true"]')) return
      swallow(event)
      if (action.type === 'jump') {
        jumpTo(action.number)
      } else if (action.type === 'show-numbers') {
        if (terminalIds.length > 0) showNumbers()
      } else {
        const nodeId = nextPendingNode(notifications, new Set(terminalIds))
        if (nodeId) {
          latest.current.openTerminal(nodeId)
        } else {
          window.clearTimeout(messageTimer.current)
          setMessage(NO_PENDING_MESSAGE)
          messageTimer.current = window.setTimeout(() => setMessage(null), 2500)
        }
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.clearTimeout(numbersTimer.current)
      window.clearTimeout(messageTimer.current)
    }
  }, [hideNumbers, showNumbers])

  return { numbersVisible, message, sheetOpen, openSheet, closeSheet }
}

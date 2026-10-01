import { useEffect, useRef, useState } from 'react'

import { useTerminalSessions } from '../terminal/terminal-session-context'
import { createTerminalLineReader, MAX_READING_LINES } from '../terminal/reading/reading-lines'
import type { ReadingProfile } from '../terminal/reading/reading-profiles'
import {
  buildTerminalReading,
  createReadingTurnCache,
  type TerminalReading,
} from '../terminal/reading/terminal-reading'

type TerminalReadingOptions = {
  /** Só lê enquanto alguém mostra a Leitura: fechada, ela não custa nada. */
  enabled: boolean
  /** Intervalo mínimo entre duas releituras durante o stream. */
  throttleMs?: number
  maxLines?: number
}

/**
 * A Leitura de um terminal, relida quando a tela muda — no máximo uma vez por
 * `throttleMs`, com a última mudança sempre lida no fim (nada fica para trás
 * quando o stream para). O leitor incremental fica no ref: entre uma leitura
 * e outra só a tela e as linhas novas são relidas.
 */
export function useTerminalReading(
  sessionId: string,
  profile: ReadingProfile,
  { enabled, throttleMs = 250, maxLines = MAX_READING_LINES }: TerminalReadingOptions,
): TerminalReading | null {
  const store = useTerminalSessions()
  const [reading, setReading] = useState<TerminalReading | null>(null)
  const readerRef = useRef<ReturnType<typeof createTerminalLineReader> | null>(null)
  const turnCacheRef = useRef(createReadingTurnCache())
  const readerKeyRef = useRef('')

  useEffect(() => {
    if (!enabled) return undefined

    let timer: ReturnType<typeof setTimeout> | null = null
    let lastRun = 0

    const run = () => {
      timer = null
      lastRun = performance.now()
      const source = store.getReadingSource(sessionId)
      if (!source) {
        setReading(null)
        return
      }
      // Outro terminal (Reiniciar) ou outro limite: o cache do antigo não vale.
      const key = `${source.generation}:${maxLines}`
      if (!readerRef.current || readerKeyRef.current !== key) {
        readerRef.current = createTerminalLineReader(maxLines)
        readerKeyRef.current = key
      }
      const { lines, droppedLines } = readerRef.current.read(source.buffer, source.cols)
      setReading(buildTerminalReading(lines, profile, droppedLines, turnCacheRef.current))
    }

    const schedule = () => {
      if (timer !== null) return
      timer = setTimeout(run, Math.max(0, throttleMs - (performance.now() - lastRun)))
    }

    run()
    const unsubscribe = store.subscribeOutput(sessionId, schedule)
    return () => {
      unsubscribe()
      if (timer !== null) clearTimeout(timer)
    }
  }, [enabled, maxLines, profile, sessionId, store, throttleMs])

  return enabled ? reading : null
}

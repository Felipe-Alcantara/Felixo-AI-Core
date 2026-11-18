import { useCallback, useEffect, useState } from 'react'

/**
 * A sessão curta em que um agente pode clicar e digitar neste bloco Página Web
 * (aberta pela pessoa no cartão). `secondsLeft` conta em tempo real; ao chegar
 * a zero o main também encerra, então a faixa some sozinha.
 */
export function useWebpageActSession(nodeId: string): {
  secondsLeft: number | null
  end: () => void
} {
  const [expiresAt, setExpiresAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const apply = (sessions: { idDoElemento: string; expiraEm: number }[] | undefined) => {
      setNow(Date.now())
      setExpiresAt(sessions?.find((session) => session.idDoElemento === nodeId)?.expiraEm ?? null)
    }
    let alive = true
    void window.felixo?.canvas?.listWebpageActSessions?.().then((result) => {
      if (alive && result?.ok) apply(result.sessions)
    })
    const off = window.felixo?.canvas?.onWebpageActSessions?.((data) => apply(data.sessions))
    return () => {
      alive = false
      off?.()
    }
  }, [nodeId])

  useEffect(() => {
    if (expiresAt === null) return undefined
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [expiresAt])

  const end = useCallback(() => {
    void window.felixo?.canvas?.endWebpageActSession?.({ idDoElemento: nodeId })
  }, [nodeId])

  const secondsLeft = expiresAt === null ? null : Math.max(0, Math.ceil((expiresAt - now) / 1000))
  return { secondsLeft: secondsLeft === 0 ? null : secondsLeft, end }
}

/** `4:07`, para a faixa do bloco. */
export function formatSessionTime(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

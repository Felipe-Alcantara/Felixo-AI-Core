import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  cliSetupNoticeKey,
  presentCliSetupStatus,
  type CliSetupPresentation,
  type CliSetupStatus,
} from './cli-setup-presentation'

/**
 * O status da instalação automática das CLIs, pronto para a interface.
 *
 * O processo principal conduz a instalação sozinho e emite o andamento por
 * IPC; aqui só assinamos esse fluxo. A primeira leitura vem de `getStatus()`
 * porque a instalação começa poucos segundos depois de o app abrir e pode ter
 * avançado antes de este componente montar.
 *
 * Sem `window.felixo` (navegador, testes) tudo fica desligado.
 */
export function useCliSetupStatus(): {
  presentation: CliSetupPresentation
  /**
   * Identidade do aviso atual (ver `cliSetupNoticeKey`). Muda quando chega um
   * resultado novo — quem guarda estado ligado a um aviso usa isto para não
   * levá-lo ao próximo.
   */
  noticeKey: string | null
  dismissed: boolean
  dismiss: () => void
  retry: () => void
} {
  const [status, setStatus] = useState<CliSetupStatus | null>(null)
  const [dismissedKey, setDismissedKey] = useState<string | null>(null)

  useEffect(() => {
    const bridge = window.felixo?.cliSetup
    if (!bridge) return

    let cancelled = false
    // Se um evento `onStatus` chegar antes de `getStatus()` resolver, o
    // snapshot inicial já está desatualizado quando a promise finalmente
    // resolve — sem esta guarda, ele sobrescrevia o status mais novo já
    // aplicado pelo evento e a interface "regredia" visualmente.
    let receivedPush = false

    void bridge.getStatus().then((result) => {
      if (!cancelled && !receivedPush && result?.status) {
        setStatus(result.status)
      }
    })

    const unsubscribe = bridge.onStatus((next) => {
      if (cancelled) return
      receivedPush = true
      setStatus(next)
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const presentation = useMemo(() => presentCliSetupStatus(status), [status])
  const noticeKey = cliSetupNoticeKey(status)

  // Resultados positivos são confirmação, não uma interrupção permanente.
  // O usuário ainda consegue encontrá-los no indicador da barra e no histórico
  // de notificações; o toast só precisa ficar tempo suficiente para ser lido.
  useEffect(() => {
    if (presentation.tone !== 'success' || noticeKey === null) return

    const timeout = window.setTimeout(() => {
      setDismissedKey((current) => (current === noticeKey ? current : noticeKey))
    }, 6_000)

    return () => window.clearTimeout(timeout)
  }, [noticeKey, presentation.tone])

  const dismiss = useCallback(() => {
    setDismissedKey(noticeKey)
  }, [noticeKey])

  /**
   * Nova tentativa: o processo principal emite o novo status por IPC, então
   * não há nada a fazer com o retorno — a interface reage ao fluxo, como no
   * resto do ciclo.
   */
  const retry = useCallback(() => {
    void window.felixo?.cliSetup?.retry()
  }, [])

  const dismissed = dismissedKey !== null && dismissedKey === noticeKey

  return { presentation, noticeKey, dismissed, dismiss, retry }
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  presentUpdateStatus,
  updateNoticeKey,
  type UpdatePresentation,
  type UpdateStatus,
} from './update-presentation'

/**
 * O status do auto-updater, pronto para a interface.
 *
 * O processo principal já verifica sozinho (logo após abrir e a cada dez
 * minutos) e emite o resultado por IPC; aqui só assinamos esse fluxo. A
 * primeira leitura vem de `getStatus()` porque a verificação inicial pode ter
 * acontecido antes de este componente montar — sem ela, uma atualização já
 * baixada ficaria invisível até o próximo ciclo.
 *
 * Sem `window.felixo` (navegador, testes) tudo fica desligado.
 */
export function useUpdateStatus(): {
  presentation: UpdatePresentation
  dismissed: boolean
  dismiss: () => void
  install: () => void
  check: () => void
} {
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [dismissedKey, setDismissedKey] = useState<string | null>(null)

  useEffect(() => {
    const bridge = window.felixo?.updates
    if (!bridge) return

    let cancelled = false

    void bridge.getStatus().then((result) => {
      if (!cancelled && result?.status) {
        setStatus(result.status)
      }
    })

    const unsubscribe = bridge.onStatus((next) => {
      if (!cancelled) {
        setStatus(next)
      }
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const presentation = useMemo(() => presentUpdateStatus(status), [status])

  const noticeKey = updateNoticeKey(status)

  const dismiss = useCallback(() => {
    setDismissedKey(noticeKey)
  }, [noticeKey])

  const install = useCallback(() => {
    void window.felixo?.updates?.install()
  }, [])

  /**
   * Verifica agora, sem esperar o ciclo de dez minutos.
   *
   * O processo principal já emite o novo status por IPC, incluindo o
   * 'checking' — então não há nada a fazer com o retorno aqui: a interface
   * reage ao fluxo, como no resto do ciclo.
   */
  const check = useCallback(() => {
    void window.felixo?.updates?.check()
  }, [])

  const dismissed = dismissedKey !== null && dismissedKey === noticeKey

  return { presentation, dismissed, dismiss, install, check }
}

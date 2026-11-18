import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { MousePointerClick, X } from 'lucide-react'

import { BROWSER_REQUEST_ARM_MS, isRepeatedClick } from './agent-browser-request'
import { describeGuestAddress, findWebpageGuest } from '../services/webpage-guest-registry'
import type { CanvasAgentWebpageActRequest } from '../types'

const BUTTON_CLASS =
  'felixo-btn flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-xs disabled:opacity-50'

const CAMPO: Record<NonNullable<CanvasAgentWebpageActRequest['campoSensivel']>, string> = {
  senha: 'um campo de senha',
  pagamento: 'um campo de pagamento',
  quadro: 'um quadro interno da página (pode ser de pagamento)',
}

/**
 * Cartão dos pedidos de agente para clicar e digitar num bloco Página Web
 * (`felixo browser click` / `type`).
 *
 * Permitir abre uma sessão curta (5 min) naquele bloco: dentro dela o agente
 * age sem novo cartão, e o bloco mostra uma faixa com o botão de encerrar.
 * Digitar em campo de senha, de pagamento ou em quadro interno não entra na
 * sessão: o cartão volta a cada vez, pedindo a confirmação daquele campo. O
 * texto a digitar nunca aparece aqui, só quantos caracteres.
 */
export function AgentWebpageActCard() {
  const [requests, setRequests] = useState<CanvasAgentWebpageActRequest[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ requestId: string; message: string } | null>(null)
  const [armedId, setArmedId] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const load = useCallback(async () => {
    const result = await window.felixo?.canvas?.listWebpageActRequests?.()
    if (mountedRef.current && result?.ok) setRequests(result.requests ?? [])
  }, [])

  useEffect(() => {
    void load()
    return window.felixo?.canvas?.onWebpageActRequests?.((data) => setRequests(data.requests ?? []))
  }, [load])

  const request = requests[0] ?? null
  const armKey = request ? `${request.id}:${request.campoSensivel ?? ''}` : null
  useEffect(() => {
    if (armKey === null) return undefined
    const timer = window.setTimeout(() => setArmedId(armKey), BROWSER_REQUEST_ARM_MS)
    return () => window.clearTimeout(timer)
  }, [armKey])

  const decide = useCallback(
    async (target: CanvasAgentWebpageActRequest, aprovar: boolean, webContentsId?: number) => {
      setBusy(true)
      setError(null)
      try {
        const result = await window.felixo?.canvas?.decideWebpageActRequest?.({
          id: target.id,
          aprovar,
          idDoElemento: target.idDoElemento,
          tipo: target.tipo,
          ...(webContentsId !== undefined ? { webContentsId } : {}),
          ...(aprovar && target.campoSensivel ? { confirmarCampo: true } : {}),
        })
        if (!result?.ok && mountedRef.current) {
          setError({ requestId: target.id, message: result?.message ?? 'Não foi possível atender o pedido.' })
        }
      } finally {
        if (mountedRef.current) setBusy(false)
        void load()
      }
    },
    [load],
  )

  if (!request) return null

  const guest = findWebpageGuest(request.idDoElemento)
  const sensivel = request.campoSensivel
  const what =
    request.tipo === 'clicar'
      ? `clicar em (${request.x}, ${request.y}) de`
      : `digitar ${request.caracteres} caractere(s) em ${sensivel ? CAMPO[sensivel] : 'um campo de'}`
  const disabled = busy || armedId !== armKey
  const shownError = error?.requestId === request.id ? error.message : null

  const onClick = (aprovar: boolean) => (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (isRepeatedClick(event.detail)) return
    void decide(request, aprovar, aprovar ? guest?.guestId : undefined)
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-28 z-50 flex justify-center px-4">
      <section
        aria-labelledby="agent-webpage-act-title"
        className="pointer-events-auto w-full max-w-md rounded-xl border border-white/10 bg-(--f-surface-panel) p-3 text-(--f-core-white-soft) shadow-2xl"
        data-felixo-agent-webpage-act={request.id}
        data-felixo-floating-layer
      >
        <div className="flex items-start gap-2">
          <MousePointerClick size={14} className="mt-0.5 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 id="agent-webpage-act-title" className="text-sm font-medium text-(--f-core-white)">
              Um agente quer {what} uma Página Web
              {requests.length > 1 && (
                <span className="ml-2 text-xs font-normal text-(--f-core-secondary)">+{requests.length - 1} na fila</span>
              )}
            </h2>
            <p className="truncate text-[11px] text-(--f-core-secondary)" title={request.origem || undefined}>
              {request.origem ? `Pedido de um agente em ${request.origem}` : 'Pedido de um agente'}
            </p>
          </div>
        </div>

        <div className="mt-2 rounded-md border border-white/8 bg-black/15 px-2 py-1.5">
          {guest ? (
            <>
              <p className="break-all font-mono text-[11px] text-(--f-core-white)">{describeGuestAddress(guest.getUrl())}</p>
              <p className="mt-0.5 text-[11px] text-(--f-core-secondary)">Perfil: {guest.profileName}</p>
            </>
          ) : (
            <p className="text-xs text-(--color-warning)">
              O bloco {request.idDoElemento} não está aberto neste canvas. Só é possível recusar.
            </p>
          )}
        </div>

        <p className="mt-1.5 text-[11px] text-(--f-core-secondary)">
          {sensivel
            ? 'Campos de senha e de pagamento pedem a sua confirmação a cada digitação, mesmo na sessão. O texto não é mostrado aqui.'
            : 'Permitir libera o agente para clicar e digitar neste bloco por 5 minutos. Uma faixa no bloco mostra a sessão e deixa encerrar na hora.'}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {guest && (
            <button
              type="button"
              disabled={disabled}
              onClick={onClick(true)}
              className={`${BUTTON_CLASS} border-white/40 bg-white/12 text-(--f-core-white) hover:bg-white/16`}
            >
              <MousePointerClick size={12} aria-hidden /> {sensivel ? 'Confirmar neste campo' : 'Permitir por 5 min'}
            </button>
          )}
          <button
            type="button"
            disabled={disabled}
            onClick={onClick(false)}
            className={`${BUTTON_CLASS} border-white/10 bg-white/4 text-(--f-core-white-soft) hover:border-white/25 hover:bg-white/10`}
          >
            <X size={12} aria-hidden /> Recusar
          </button>
        </div>

        {shownError && (
          <p role="alert" className="mt-2 rounded-sm bg-red-500/10 p-2 text-xs text-red-400">
            {shownError}
          </p>
        )}
      </section>
      <p role="status" className="sr-only">
        {`Um agente quer ${what} uma Página Web.`}
      </p>
    </div>
  )
}

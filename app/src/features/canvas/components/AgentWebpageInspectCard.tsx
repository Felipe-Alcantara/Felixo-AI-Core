import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { Eye, X } from 'lucide-react'

import { BROWSER_REQUEST_ARM_MS, isRepeatedClick } from './agent-browser-request'
import { describeGuestAddress, findWebpageGuest } from '../services/webpage-guest-registry'
import type { CanvasAgentWebpageInspectRequest } from '../types'

const BUTTON_CLASS =
  'felixo-btn flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-xs disabled:opacity-50'

/**
 * Cartão dos pedidos de agente para olhar um bloco Página Web
 * (`felixo browser capture` / `read`).
 *
 * A página pode estar logada como a pessoa, e o que o agente vê vai ao
 * provedor dele: nada acontece sem o clique em "Permitir", e cada permissão
 * vale para um pedido. O cartão diz qual endereço (sem query nem hash) e qual
 * perfil, e se o bloco não está aberto só deixa recusar. Só olhar: o agente
 * não clica, não digita e não lê cookies nem senhas.
 *
 * Mesmas travas do cartão de abertura: não rouba o foco, e os botões esperam
 * `BROWSER_REQUEST_ARM_MS` depois de o cartão mostrar um pedido novo.
 */
export function AgentWebpageInspectCard() {
  const [requests, setRequests] = useState<CanvasAgentWebpageInspectRequest[]>([])
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
    const result = await window.felixo?.canvas?.listWebpageInspectRequests?.()
    if (mountedRef.current && result?.ok) setRequests(result.requests ?? [])
  }, [])

  useEffect(() => {
    void load()
    return window.felixo?.canvas?.onWebpageInspectRequests?.((data) => setRequests(data.requests ?? []))
  }, [load])

  const request = requests[0] ?? null
  const requestId = request?.id ?? null
  useEffect(() => {
    if (requestId === null) return undefined
    const timer = window.setTimeout(() => setArmedId(requestId), BROWSER_REQUEST_ARM_MS)
    return () => window.clearTimeout(timer)
  }, [requestId])

  const decide = useCallback(
    async (target: CanvasAgentWebpageInspectRequest, aprovar: boolean, webContentsId?: number) => {
      setBusy(true)
      setError(null)
      try {
        const result = await window.felixo?.canvas?.decideWebpageInspectRequest?.({
          id: target.id,
          aprovar,
          idDoElemento: target.idDoElemento,
          tipo: target.tipo,
          ...(webContentsId !== undefined ? { webContentsId } : {}),
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

  // Lido a cada render do cartão: o endereço de agora, não o de quando o bloco abriu.
  const guest = findWebpageGuest(request.idDoElemento)
  const what = request.tipo === 'captura' ? 'tirar uma captura de tela de' : 'ler o conteúdo de'
  const disabled = busy || armedId !== request.id
  const shownError = error?.requestId === request.id ? error.message : null

  const onClick = (aprovar: boolean) => (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (isRepeatedClick(event.detail)) return
    void decide(request, aprovar, aprovar ? guest?.guestId : undefined)
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <section
        aria-labelledby="agent-webpage-inspect-title"
        className="pointer-events-auto w-full max-w-md rounded-xl border border-white/10 bg-(--f-surface-panel) p-3 text-(--f-core-white-soft) shadow-2xl"
        data-felixo-agent-webpage-inspect={request.id}
        data-felixo-floating-layer
      >
        <div className="flex items-start gap-2">
          <Eye size={14} className="mt-0.5 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 id="agent-webpage-inspect-title" className="text-sm font-medium text-(--f-core-white)">
              Um agente quer {what} uma Página Web
              {requests.length > 1 && (
                <span className="ml-2 text-xs font-normal text-(--f-core-secondary)">
                  +{requests.length - 1} na fila
                </span>
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
              <p className="break-all font-mono text-[11px] text-(--f-core-white)">
                {describeGuestAddress(guest.getUrl())}
              </p>
              <p className="mt-0.5 text-[11px] text-(--f-core-secondary)">Perfil: {guest.profileName}</p>
            </>
          ) : (
            <p className="text-xs text-(--color-warning)">
              O bloco {request.idDoElemento} não está aberto neste canvas. Só é possível recusar.
            </p>
          )}
        </div>

        <p className="mt-1.5 text-[11px] text-(--f-core-secondary)">
          {request.tipo === 'captura'
            ? 'O agente recebe uma imagem do que está na tela, inclusive o que estiver logado nesse perfil.'
            : 'O agente recebe o texto visível e a lista de botões e links. Não recebe cookies, senhas nem valores digitados.'}
          {' Ele não clica nem digita. Vale só para este pedido.'}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {guest && (
            <button
              type="button"
              disabled={disabled}
              onClick={onClick(true)}
              className={`${BUTTON_CLASS} border-white/40 bg-white/12 text-(--f-core-white) hover:bg-white/16`}
            >
              <Eye size={12} aria-hidden /> Permitir
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

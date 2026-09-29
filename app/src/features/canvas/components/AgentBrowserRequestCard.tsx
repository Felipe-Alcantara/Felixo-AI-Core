import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, Globe, X } from 'lucide-react'

import { describeLinkDestination } from '../../shared/links/link-destination'
import {
  describeBrowserRequestOrigin,
  describeBrowserRequestSuggestion,
  pickBrowserRequest,
} from './agent-browser-request'
import type { CanvasAgentBrowserRequest } from '../types'

type Destino = 'externo' | 'embutido' | null

const BUTTON_CLASS =
  'felixo-btn flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-xs disabled:opacity-50'
const SUGGESTED_CLASS = 'border-white/40 bg-white/12 text-(--f-core-white) hover:bg-white/16'
const OTHER_CLASS = 'border-white/10 bg-white/4 text-(--f-core-white-soft) hover:border-white/25 hover:bg-white/10'

/**
 * Cartão dos pedidos de agente para abrir uma página (`felixo browser open`).
 *
 * Nenhuma página que um agente pede abre sem a pessoa: o cartão mostra o
 * destino (host e endereço inteiro) e pergunta navegador, Página Web ou
 * recusar. O destino que o agente sugeriu vem destacado, mas os dois estão
 * sempre disponíveis.
 *
 * Não rouba o foco nem responde a teclas globais: quem está digitando num
 * terminal quando o pedido chega não pode confirmá-lo sem querer com um
 * Enter. O cartão entra na ordem do Tab e se anuncia pela região `status`.
 */
export function AgentBrowserRequestCard() {
  const [requests, setRequests] = useState<CanvasAgentBrowserRequest[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const load = useCallback(async () => {
    const result = await window.felixo?.canvas?.listBrowserRequests?.()
    if (mountedRef.current && result?.ok) setRequests(result.requests ?? [])
  }, [])

  useEffect(() => {
    void load()
    return window.felixo?.canvas?.onBrowserRequests?.((data) => setRequests(data.requests ?? []))
  }, [load])

  const request = useMemo(() => pickBrowserRequest(requests), [requests])
  const destination = useMemo(
    () => (request ? describeLinkDestination(request.url, 'pagina-web') : null),
    [request],
  )

  const decide = useCallback(
    async (ids: string[], destino: Destino) => {
      if (busy || ids.length === 0) return
      setBusy(true)
      setError(null)
      try {
        for (const id of ids) {
          const result = await window.felixo?.canvas?.decideBrowserRequest?.({ id, destino })
          if (!result?.ok) {
            if (mountedRef.current) setError(result?.message ?? 'Não foi possível atender o pedido.')
            break
          }
        }
      } finally {
        if (mountedRef.current) setBusy(false)
        void load()
      }
    },
    [busy, load],
  )

  if (!request || !destination) return null

  const queued = requests.length - 1
  const suggested: Destino = request.modo === 'embutido' ? 'embutido' : 'externo'

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <section
        aria-labelledby="agent-browser-request-title"
        className="pointer-events-auto w-full max-w-md rounded-xl border border-white/10 bg-(--f-surface-panel) p-3 text-(--f-core-white-soft) shadow-2xl"
        data-felixo-agent-browser-request={request.id}
      >
        <div className="flex items-start gap-2">
          <Globe size={14} className="mt-0.5 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 id="agent-browser-request-title" className="text-sm font-medium text-(--f-core-white)">
              Um agente quer abrir uma página
              {queued > 0 && (
                <span className="ml-2 text-xs font-normal text-(--f-core-secondary)">
                  +{queued} na fila
                </span>
              )}
            </h2>
            <p
              className="truncate text-[11px] text-(--f-core-secondary)"
              title={typeof request.origem === 'string' && request.origem ? request.origem : undefined}
            >
              {describeBrowserRequestOrigin(request)}
            </p>
          </div>
        </div>

        <div className="mt-2 rounded-md border border-white/8 bg-black/15 px-2 py-1.5">
          {destination.ok ? (
            <>
              <p className="break-all text-xs font-medium text-(--f-core-white)">{destination.headline}</p>
              <p className="mt-0.5 line-clamp-3 break-all font-mono text-[11px] text-(--f-core-secondary)">
                {destination.url}
              </p>
            </>
          ) : (
            <p className="text-xs text-(--color-warning)">Endereço recusado: {destination.reason}.</p>
          )}
        </div>

        <p className="mt-1.5 text-[11px] text-(--f-core-secondary)">
          {describeBrowserRequestSuggestion(request)}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {destination.ok && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void decide([request.id], 'externo')}
                className={`${BUTTON_CLASS} ${suggested === 'externo' ? SUGGESTED_CLASS : OTHER_CLASS}`}
              >
                <ExternalLink size={12} aria-hidden /> Abrir no navegador
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void decide([request.id], 'embutido')}
                className={`${BUTTON_CLASS} ${suggested === 'embutido' ? SUGGESTED_CLASS : OTHER_CLASS}`}
              >
                <Globe size={12} aria-hidden /> Abrir como Página Web
              </button>
            </>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void decide([request.id], null)}
            className={`${BUTTON_CLASS} ${OTHER_CLASS}`}
          >
            <X size={12} aria-hidden /> Recusar
          </button>
          {queued > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void decide(requests.map((item) => item.id), null)}
              className="felixo-btn-flat ml-auto rounded-xs text-[11px] text-(--f-core-secondary) underline-offset-2 hover:text-(--f-core-white-soft) hover:underline disabled:opacity-50"
            >
              Recusar todos ({requests.length})
            </button>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-2 rounded-sm bg-red-500/10 p-2 text-xs text-red-400">
            {error}
          </p>
        )}
      </section>
      <p role="status" className="sr-only">
        {`Um agente quer abrir ${destination.ok ? destination.headline : 'uma página'}.`}
      </p>
    </div>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { ExternalLink, Globe, X } from 'lucide-react'

import { describeLinkDestination } from '../../shared/links/link-destination'
import {
  BROWSER_REQUEST_ARM_MS,
  browserDecisionError,
  browserDecisionParams,
  browserRequestArmKey,
  describeBrowserRequestOrigin,
  describeBrowserRequestSuggestion,
  isRepeatedClick,
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
 * destino (host e endereço inteiro, numa caixa com rolagem) e pergunta
 * navegador, Página Web ou recusar. O destino que o agente sugeriu vem
 * destacado, mas os dois estão sempre disponíveis.
 *
 * Não rouba o foco nem responde a teclas globais: quem está digitando num
 * terminal quando o pedido chega não pode confirmá-lo sem querer com um
 * Enter. O cartão entra na ordem do Tab e se anuncia pela região `status`.
 * Pelo mesmo motivo, quando passa a mostrar outro pedido, os botões esperam
 * `BROWSER_REQUEST_ARM_MS` para valer, e o clique repetido de um duplo clique
 * não decide nada.
 */
export function AgentBrowserRequestCard() {
  const [requests, setRequests] = useState<CanvasAgentBrowserRequest[]>([])
  const [busy, setBusy] = useState(false)
  // O erro é do pedido que falhou: quando o cartão passa ao próximo, fica para trás.
  const [error, setError] = useState<{ requestId: string; message: string } | null>(null)
  const [armedKey, setArmedKey] = useState<string | null>(null)
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

  // Os botões só valem um tempo depois de o cartão mostrar o que está
  // mostrando: até lá, `armedKey` ainda é o do pedido anterior.
  const armKey = browserRequestArmKey(request)
  useEffect(() => {
    if (armKey === null) return
    const timer = window.setTimeout(() => setArmedKey(armKey), BROWSER_REQUEST_ARM_MS)
    return () => window.clearTimeout(timer)
  }, [armKey])

  const decide = useCallback(
    async (targets: CanvasAgentBrowserRequest[], destino: Destino) => {
      if (busy || targets.length === 0) return
      setBusy(true)
      setError(null)
      try {
        for (const target of targets) {
          const result = await window.felixo?.canvas?.decideBrowserRequest?.(
            browserDecisionParams(target, destino),
          )
          const failure = browserDecisionError(result)
          if (failure) {
            if (mountedRef.current) setError({ requestId: target.id, message: failure })
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
  const actionsDisabled = busy || armedKey !== armKey
  const shownError = error?.requestId === request.id ? error.message : null

  /** Um clique vale uma decisão (ver `isRepeatedClick`). */
  const onChoose =
    (targets: CanvasAgentBrowserRequest[], destino: Destino) =>
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      if (isRepeatedClick(event.detail)) return
      void decide(targets, destino)
    }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <section
        aria-labelledby="agent-browser-request-title"
        className="pointer-events-auto w-full max-w-md rounded-xl border border-white/10 bg-(--f-surface-panel) p-3 text-(--f-core-white-soft) shadow-2xl"
        data-felixo-agent-browser-request={request.id}
        // Clicar no cartão não é "clicar fora" para a gaveta do terminal
        // aberta atrás dele (ver `FLOATING_LAYER_SELECTOR`).
        data-felixo-floating-layer
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
              {/* O endereço inteiro, sempre: o que aparece aqui é o que abre. A
                  caixa rola (inclusive pelo teclado) em vez de cortar o fim. */}
              <div
                role="region"
                aria-label="Endereço completo"
                tabIndex={0}
                className="mt-0.5 max-h-24 overflow-y-auto overscroll-contain break-all font-mono text-[11px] text-(--f-core-secondary)"
              >
                {destination.url}
              </div>
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
                disabled={actionsDisabled}
                onClick={onChoose([request], 'externo')}
                className={`${BUTTON_CLASS} ${suggested === 'externo' ? SUGGESTED_CLASS : OTHER_CLASS}`}
              >
                <ExternalLink size={12} aria-hidden /> Abrir no navegador
              </button>
              <button
                type="button"
                disabled={actionsDisabled}
                onClick={onChoose([request], 'embutido')}
                className={`${BUTTON_CLASS} ${suggested === 'embutido' ? SUGGESTED_CLASS : OTHER_CLASS}`}
              >
                <Globe size={12} aria-hidden /> Abrir como Página Web
              </button>
            </>
          )}
          <button
            type="button"
            disabled={actionsDisabled}
            onClick={onChoose([request], null)}
            className={`${BUTTON_CLASS} ${OTHER_CLASS}`}
          >
            <X size={12} aria-hidden /> Recusar
          </button>
          {queued > 0 && (
            <button
              type="button"
              disabled={actionsDisabled}
              onClick={onChoose(requests, null)}
              className="felixo-btn-flat ml-auto rounded-xs text-[11px] text-(--f-core-secondary) underline-offset-2 hover:text-(--f-core-white-soft) hover:underline disabled:opacity-50"
            >
              Recusar todos ({requests.length})
            </button>
          )}
        </div>

        {shownError && (
          <p role="alert" className="mt-2 rounded-sm bg-red-500/10 p-2 text-xs text-red-400">
            {shownError}
          </p>
        )}
      </section>
      <p role="status" className="sr-only">
        {`Um agente quer abrir ${destination.ok ? destination.headline : 'uma página'}.`}
      </p>
    </div>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, PenLine } from 'lucide-react'
import type { Node } from '@xyflow/react'
import { CanvasPanel } from './CanvasPanel'
import {
  applyWriteRequestResult,
  describeWriteRequest,
  formatWriteRequestTime,
  pickPendingWriteRequest,
  previewWriteContent,
} from './canvas-write-agent-requests'
import type { CanvasWriteAgentRequest } from '../../types'

type AgentCanvasWriteRequestsPanelProps = {
  onClose: () => void
  toolsMenuOpen?: boolean
  nodes: Node[]
}

/**
 * Onde a pessoa vê e confirma pedidos de escrita que um agente deixou com
 * `felixo canvas escrever` — o "maior risco de segurança do app" que a task
 * original nomeia (prompt injection tentando mandar escrever em outro
 * lugar). Nada é escrito sem um clique explícito aqui.
 *
 * Só um pedido por vez fica em destaque, como o Fetch All já faz: a fila é
 * atendida em ordem, e a pessoa nunca autoriza no escuro — o conteúdo a
 * escrever fica visível antes do clique, não só o id do elemento.
 */
export function AgentCanvasWriteRequestsPanel({
  onClose,
  toolsMenuOpen,
  nodes,
}: AgentCanvasWriteRequestsPanelProps) {
  const [requests, setRequests] = useState<CanvasWriteAgentRequest[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastApplied, setLastApplied] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const loadRequests = useCallback(async () => {
    const result = await window.felixo?.canvas?.listWriteRequests()
    if (mountedRef.current && result?.ok) {
      setRequests(result.requests ?? [])
    }
  }, [])

  useEffect(() => {
    void loadRequests()
    return window.felixo?.canvas?.onWriteRequests((data) => {
      setRequests(data.requests ?? [])
    })
  }, [loadRequests])

  const pendingRequest = useMemo(() => pickPendingWriteRequest(requests), [requests])

  const resolveRequest = useCallback(
    async (id: string, aceito: boolean) => {
      setBusy(true)
      setError(null)
      setLastApplied(false)

      try {
        const result = await window.felixo?.canvas?.resolveWriteRequest({ id, aceito })
        if (!mountedRef.current) return
        const uiUpdate = applyWriteRequestResult(result, aceito)
        if (uiUpdate.error) {
          setError(uiUpdate.error)
          return
        }
        setLastApplied(uiUpdate.applied)
      } finally {
        if (mountedRef.current) setBusy(false)
        void loadRequests()
      }
    },
    [loadRequests],
  )

  return (
    <CanvasPanel
      title="Pedidos de escrita"
      icon={<PenLine size={15} />}
      onClose={onClose}
      panelId="agent-canvas-write-requests"
      size="md"
      toolsMenuOpen={toolsMenuOpen}
    >
      {lastApplied && !pendingRequest && (
        <p className="mb-3 rounded-sm bg-emerald-500/10 p-2 text-xs text-emerald-400">
          Escrita aplicada.
        </p>
      )}

      {error && (
        <p className="mb-3 rounded-sm bg-red-500/10 p-2 text-xs text-red-400">{error}</p>
      )}

      {pendingRequest ? (
        <div className="rounded-sm border border-[color-mix(in_srgb,var(--color-warning)_38%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)] p-2.5">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-(--color-warning)" />
            <div className="min-w-0 flex-1">
              <p className="text-xs leading-relaxed text-(--color-warning)">
                {describeWriteRequest(pendingRequest, nodes)}
              </p>
              <p className="mt-1 text-[11px] text-(--color-warning)">
                Pedido às {formatWriteRequestTime(pendingRequest)}
              </p>
            </div>
          </div>

          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-sm bg-black/20 p-2 text-[11px] text-zinc-200">
            {previewWriteContent(pendingRequest) || '(vazio — a nota ficaria em branco)'}
          </pre>

          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void resolveRequest(pendingRequest.id, true)}
              disabled={busy}
              className="felixo-btn flex-1 rounded-sm bg-(--color-warning) px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-[color-mix(in_srgb,var(--color-warning)_24%,transparent)] disabled:opacity-50"
            >
              {busy ? 'Aplicando…' : 'Aceitar e escrever'}
            </button>
            <button
              type="button"
              onClick={() => void resolveRequest(pendingRequest.id, false)}
              disabled={busy}
              className="felixo-btn rounded-sm bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 ring-1 ring-white/10 hover:bg-zinc-700 disabled:opacity-50"
            >
              Recusar
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-zinc-500">
          Nenhum pedido de escrita esperando. Um agente pede com{' '}
          <code className="rounded-sm bg-zinc-800 px-1 py-0.5">felixo canvas escrever</code>; nada é
          escrito sem confirmação aqui.
        </p>
      )}
    </CanvasPanel>
  )
}

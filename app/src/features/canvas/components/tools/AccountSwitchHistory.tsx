import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { AccountSwitchHistoryEntry } from '../../../shared/types/account-chain'
import { getAccountChainBridge, CHAIN_UNAVAILABLE_MESSAGE } from '../../services/account-chain-client'
import { toHistoryRow } from '../../services/account-chain-view'
import { useClockTick } from '../../hooks/useAccountChain'

/** Quantas trocas a aba mostra (o canal aceita até 50). */
const HISTORY_LIMIT = 50

/**
 * Aba "Trocas": as últimas trocas de conta, com data e hora absolutas e
 * relativas, origem → destino, motivo e estado. É o registro que prova que
 * toda troca teve motivo e horário; "Ir para o bloco" só foca, nunca abre nada.
 *
 * `sessionFilter` restringe às trocas de um bloco (painel de detalhes).
 */
export function AccountSwitchHistory({
  onFocusNode,
  existingNodeIds,
  sessionFilter,
  compact = false,
}: {
  onFocusNode?: (nodeId: string) => void
  existingNodeIds?: ReadonlySet<string>
  sessionFilter?: string
  compact?: boolean
}) {
  const [entries, setEntries] = useState<AccountSwitchHistoryEntry[] | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const load = useCallback(async () => {
    const bridge = getAccountChainBridge()
    if (!bridge) {
      setMessage(CHAIN_UNAVAILABLE_MESSAGE)
      setEntries([])
      return
    }
    setLoading(true)
    try {
      const result = await bridge.history({ limit: HISTORY_LIMIT })
      if (!mounted.current) return
      if (!result.ok) {
        setMessage(result.message ?? 'Não foi possível ler o registro de trocas.')
        return
      }
      setMessage(null)
      setEntries(result.entries)
    } catch {
      if (mounted.current) setMessage('Não foi possível falar com o processo principal.')
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timerId = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timerId)
  }, [load])

  const nowMs = useClockTick()
  const visible = (entries ?? []).filter(
    (entry) =>
      !sessionFilter ||
      entry.sourceSessionId === sessionFilter ||
      entry.targetSessionId === sessionFilter,
  )

  return (
    <div className="space-y-2 text-[12px] text-zinc-300">
      {!compact && (
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 text-[11px] text-zinc-500">
            Últimas {HISTORY_LIMIT} trocas e avisos, com motivo e horário.
          </p>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="felixo-btn flex items-center gap-1.5 rounded-md bg-zinc-800 px-2 py-1 text-xs text-zinc-200 ring-1 ring-white/10 hover:bg-zinc-700 disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin motion-reduce:animate-none' : undefined} />
            Atualizar
          </button>
        </div>
      )}

      {message && (
        <p role="alert" className="text-[11px] text-theme-error">
          {message}
        </p>
      )}

      {entries === null ? (
        <p className="text-[11px] text-zinc-500">Carregando o registro…</p>
      ) : visible.length === 0 ? (
        <p className="rounded-md border border-white/10 bg-white/2 px-3 py-3 text-center text-[11px] text-zinc-500">
          {sessionFilter ? 'Nenhuma troca registrada para este bloco.' : 'Nenhuma troca registrada.'}
        </p>
      ) : (
        <ul aria-label="Registro de trocas de conta" className="space-y-1.5">
          {visible.map((entry) => {
            const row = toHistoryRow(entry, nowMs)
            const canFocus =
              row.nodeId !== null &&
              onFocusNode !== undefined &&
              (existingNodeIds?.has(row.nodeId) ?? true)
            return (
              <li key={row.id} className="rounded-md border border-white/10 bg-white/2 px-2.5 py-2">
                <div className="flex items-baseline gap-2">
                  <time dateTime={row.at} className="shrink-0 text-[11px] tabular-nums text-zinc-400">
                    {row.when}
                  </time>
                  {row.whenRelative && (
                    <span className="text-[10px] text-zinc-500">({row.whenRelative})</span>
                  )}
                  <span className="ml-auto shrink-0 rounded-sm bg-white/6 px-1.5 py-0.5 text-[10px] text-zinc-300">
                    {row.stateLabel}
                  </span>
                </div>
                <p className="mt-1 text-[12px] text-zinc-100">{row.route}</p>
                <p className="mt-0.5 text-[11px] text-zinc-400">
                  {row.kindLabel} · {row.reason}
                </p>
                {canFocus && row.nodeId && (
                  <button
                    type="button"
                    onClick={() => onFocusNode?.(row.nodeId as string)}
                    className="felixo-btn mt-1 rounded-sm px-1.5 py-0.5 text-[11px] text-sky-300 hover:bg-white/6"
                  >
                    Ir para o bloco
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { ClipboardCheck } from 'lucide-react'

import { useApprovalQueue } from '../hooks/useApprovalQueue'
import type { ApprovalItem } from '../services/approval-queue'
import type { CanvasAgentLaunchTask } from '../types'

const TONE_CLASS = {
  accept: 'border-emerald-400/40 bg-emerald-400/10 hover:bg-emerald-400/20',
  refuse: 'border-red-400/30 bg-red-400/5 hover:bg-red-400/15',
  neutral: 'border-white/10 bg-white/4 hover:border-white/30 hover:bg-white/10',
} as const

export type ApprovalPanelViewProps = {
  items: ApprovalItem[]
  open: boolean
  busyKey: string | null
  error: { key: string; message: string } | null
  onToggle: () => void
  onAct: (item: ApprovalItem, actionId: string) => void
}

/** Parte visual do painel (sem IPC): a lista do que espera a pessoa e os botões de cada pedido. */
export function ApprovalPanelView({ items, open, busyKey, error, onToggle, onAct }: ApprovalPanelViewProps) {
  if (items.length === 0) return null

  return (
    // Camada flutuante: clicar aqui não é "clicar fora" da gaveta do terminal.
    <div
      data-felixo-floating-layer
      className="pointer-events-none fixed inset-x-0 bottom-12 z-40 flex justify-center px-4"
    >
      <section
        aria-label="Aprovações pendentes"
        className="pointer-events-auto w-full max-w-md rounded-xl border border-white/10 bg-(--f-surface-panel) text-(--f-core-white-soft) shadow-2xl"
      >
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className="felixo-btn flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
        >
          <ClipboardCheck size={15} aria-hidden />
          <span className="font-medium">
            {items.length === 1 ? '1 aprovação pendente' : `${items.length} aprovações pendentes`}
          </span>
          <span className="ml-auto text-[11px] opacity-60">lembrete às 12h e 18h</span>
        </button>
        {open && (
          <ul className="flex max-h-[50vh] flex-col gap-3 overflow-y-auto border-t border-white/10 p-3">
            {items.map((item) => (
              <li key={item.key} className="flex flex-col gap-2">
                <p className="text-[11px] opacity-70">{item.origin}</p>
                <p className="whitespace-pre-wrap text-sm font-medium">{item.title}</p>
                {item.details.map((line, index) => (
                  <p key={`${index}-${line}`} className="whitespace-pre-wrap text-xs opacity-70">
                    {line}
                  </p>
                ))}
                <div className="flex flex-wrap gap-2">
                  {item.actions.map((action) => (
                    // `aria-disabled`, não `disabled`: o botão focado que some do foco manda o Delete ao canvas.
                    <button
                      key={action.id}
                      type="button"
                      title={action.hint}
                      aria-disabled={busyKey !== null}
                      onClick={() => onAct(item, action.id)}
                      className={`felixo-btn rounded-sm border px-3 py-1.5 text-left text-xs aria-disabled:opacity-50 ${TONE_CLASS[action.tone]}`}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
                {error?.key === item.key && (
                  <p role="alert" className="rounded-sm bg-red-500/10 p-2 text-xs text-red-400">
                    {error.message}
                  </p>
                )}
                <p className="text-[11px] opacity-50">Se ninguém responder, {item.timeoutNote}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

/**
 * Painel das aprovações pendentes de todos os agentes (decisões do
 * orquestrador e das CLIs e perguntas de agente), numa fila só. Aparece só
 * quando há algo pendente; nas janelas fixas de 12h e 18h abre sozinho para
 * lembrar. Aprovar e recusar usam os mesmos IPCs do chat e do diálogo de
 * pergunta: o main continua sendo quem decide.
 */
export function ApprovalPanel({
  onOpenAgents,
}: {
  /** Abre um terminal por task quando a pessoa aceita um pedido de agentes de um coordenador. */
  onOpenAgents?: (tasks: CanvasAgentLaunchTask[], cwd: string) => Promise<void>
} = {}) {
  const { items, act } = useApprovalQueue({ onOpenAgents })
  const [open, setOpen] = useState(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [error, setError] = useState<{ key: string; message: string } | null>(null)
  const countRef = useRef(items.length)
  useEffect(() => {
    countRef.current = items.length
  }, [items.length])

  // Janela de aprovação aberta (12h/18h): se há pedido esperando, mostra a lista.
  useEffect(() => window.felixo?.approvalWindows?.onWindow?.(() => {
    if (countRef.current > 0) setOpen(true)
  }), [])

  const onAct = useCallback(
    async (item: ApprovalItem, actionId: string) => {
      if (busyKey !== null) return
      setBusyKey(item.key)
      setError(null)
      try {
        const result = await act(item, actionId)
        if (!result.ok) setError({ key: item.key, message: result.message ?? 'Não foi possível responder.' })
      } finally {
        setBusyKey(null)
      }
    },
    [act, busyKey],
  )

  return (
    <ApprovalPanelView
      items={items}
      open={open}
      busyKey={busyKey}
      error={error}
      onToggle={() => setOpen((current) => !current)}
      onAct={(item, actionId) => void onAct(item, actionId)}
    />
  )
}

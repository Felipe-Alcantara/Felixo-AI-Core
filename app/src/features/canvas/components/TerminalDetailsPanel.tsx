import { Copy, Info, Terminal as TerminalIcon } from 'lucide-react'
import { CanvasPanel } from './tools/CanvasPanel'
import { useSessionMetadata } from '../terminal/terminal-session-context'
import { activityLabel, formatSessionAge, formatSessionStart } from '../terminal/session-metadata'
import type { TerminalNodeData } from '../types'

export function TerminalDetailsPanel({
  nodeId,
  data,
  onClose,
  toolsMenuOpen,
}: {
  nodeId: string
  data: TerminalNodeData
  onClose: () => void
  toolsMenuOpen: boolean
}) {
  const metadata = useSessionMetadata(nodeId)
  const value = (text: string | undefined, fallback = 'não informado') => text?.trim() || fallback

  return (
    <CanvasPanel title="Detalhes do terminal" icon={<Info size={15} />} onClose={onClose} toolsMenuOpen={toolsMenuOpen}>
      <div className="space-y-3 text-xs text-zinc-300">
        <div className="flex items-center gap-2 text-sm font-medium text-emerald-200">
          <TerminalIcon size={14} />
          <span className="truncate">{value(data.label, 'Terminal')}</span>
        </div>
        <Detail label="Pasta de trabalho" value={value(data.cwd)} copy={data.cwd} />
        <Detail label="Estado" value={metadata ? activityLabel(metadata.activity) : 'sessão não iniciada'} />
        <Detail label="Aberto há" value={formatSessionAge(metadata?.startedAt)} />
        <Detail label="Início da sessão PTY" value={formatSessionStart(metadata?.startedAt)} />
        <Detail label="ID do elemento" value={nodeId} copy={nodeId} mono />
        <Detail label="ID da sessão PTY" value={value(metadata?.ptySessionId)} copy={metadata?.ptySessionId} mono />
        <Detail label="Agente" value={value(data.command, 'Shell padrão')} />
        {data.args && data.args.length > 0 && <Detail label="Argumentos" value={data.args.join(' ')} mono />}
        <p className="border-t border-white/10 pt-2 text-[11px] leading-relaxed text-zinc-500">
          “Aberto há” mede a instância atual da PTY. Ao reiniciar, o relógio recomeça; o ID do elemento continua estável.
        </p>
      </div>
    </CanvasPanel>
  )
}

function Detail({ label, value, copy, mono = false }: { label: string; value: string; copy?: string; mono?: boolean }) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="flex items-start gap-1 rounded border border-white/5 bg-black/20 px-2 py-1.5">
        <span className={`min-w-0 flex-1 break-words ${mono ? 'font-mono text-[11px]' : ''}`}>{value}</span>
        {copy && <button type="button" className="shrink-0 text-zinc-500 hover:text-zinc-100" aria-label={`Copiar ${label}`} onClick={() => void navigator.clipboard?.writeText(copy)}><Copy size={12} /></button>}
      </div>
    </div>
  )
}

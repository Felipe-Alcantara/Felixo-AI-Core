import { Terminal, FileText, ShieldAlert } from 'lucide-react'

type ApprovalRequest = {
  threadId: string
  approvalId: string
  approvalType: 'command' | 'file' | 'permission'
  description: string
  canDeny: boolean
}

type Props = {
  request: ApprovalRequest
  onApprove: () => void
  onDeny: () => void
}

const icons = {
  command: Terminal,
  file: FileText,
  permission: ShieldAlert,
}

const labels = {
  command: 'Executar comando',
  file: 'Modificar arquivo',
  permission: 'Permissão solicitada',
}

export function CliApprovalModal({ request, onApprove, onDeny }: Props) {
  const Icon = icons[request.approvalType]
  const label = labels[request.approvalType]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm">
      <section
        className="w-full max-w-[480px] rounded-3xl border border-white/10 bg-[#242423] shadow-shell"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b border-white/[0.08] px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/10 text-amber-400">
            <Icon size={15} aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">{label}</h2>
            <p className="mt-0.5 text-xs text-zinc-500">A CLI aguarda sua confirmação para continuar.</p>
          </div>
        </header>

        <div className="px-5 py-4">
          <p className="text-xs text-zinc-400 mb-1">Detalhes</p>
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5">
            <code className="text-xs text-zinc-200 break-all whitespace-pre-wrap">
              {request.description}
            </code>
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-white/[0.08] px-5 py-4">
          {request.canDeny && (
            <button
              type="button"
              onClick={onDeny}
              className="rounded-full px-4 py-1.5 text-xs font-medium text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-200"
            >
              Negar
            </button>
          )}
          <button
            type="button"
            onClick={onApprove}
            className="rounded-full bg-amber-500 px-4 py-1.5 text-xs font-semibold text-black transition hover:bg-amber-400"
          >
            Aprovar
          </button>
        </footer>
      </section>
    </div>
  )
}

import { MonitorCog, User, X } from 'lucide-react'

type FelixoSettingsModalProps = {
  isOpen: boolean
  runtimeLabel: string
  projectsCount: number
  activeProjectsCount: number
  automationsCount: number
  onClose: () => void
}

export function FelixoSettingsModal({
  isOpen,
  runtimeLabel,
  projectsCount,
  activeProjectsCount,
  automationsCount,
  onClose,
}: FelixoSettingsModalProps) {
  if (!isOpen) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <section
        className="w-full max-w-[560px] rounded-3xl border border-white/10 bg-[#242423] shadow-shell"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Felixo</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Configuracoes locais do workspace e do perfil do app.
            </p>
          </div>

          <button
            type="button"
            title="Fechar"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-100"
          >
            <X size={16} aria-hidden="true" />
            <span className="sr-only">Fechar</span>
          </button>
        </header>

        <div className="space-y-4 px-5 py-5">
          <section className="rounded-2xl border border-white/[0.08] bg-black/10 p-3">
            <div className="mb-3 flex items-center gap-2 text-xs font-medium text-zinc-300">
              <User size={14} aria-hidden="true" />
              Perfil local
            </div>
            <div className="grid gap-2 text-xs text-zinc-400 sm:grid-cols-2">
              <Metric label="Nome" value="Felixo" />
              <Metric label="Runtime" value={runtimeLabel} />
            </div>
          </section>

          <section className="rounded-2xl border border-white/[0.08] bg-black/10 p-3">
            <div className="mb-3 flex items-center gap-2 text-xs font-medium text-zinc-300">
              <MonitorCog size={14} aria-hidden="true" />
              Estado do app
            </div>
            <div className="grid gap-2 text-xs text-zinc-400 sm:grid-cols-3">
              <Metric label="Projetos" value={`${projectsCount}`} />
              <Metric label="Ativos" value={`${activeProjectsCount}`} />
              <Metric label="Automações" value={`${automationsCount}`} />
            </div>
          </section>

          <p className="text-xs leading-relaxed text-zinc-600">
            As configuracoes de CLIs ficam no modal "Modelos". Esta area fica
            separada para evitar misturar perfil do app com configuracao de
            provedores.
          </p>
        </div>
      </section>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-black/15 px-3 py-2">
      <span className="block text-[10px] uppercase text-zinc-600">{label}</span>
      <span className="mt-1 block truncate font-mono text-zinc-200">{value}</span>
    </div>
  )
}

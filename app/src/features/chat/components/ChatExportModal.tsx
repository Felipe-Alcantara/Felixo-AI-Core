import { Download, FileJson, FileText, X } from 'lucide-react'

type ChatExportModalProps = {
  isOpen: boolean
  messagesCount: number
  onClose: () => void
  onExportJson: () => void
  onExportMarkdown: () => void
}

export function ChatExportModal({
  isOpen,
  messagesCount,
  onClose,
  onExportJson,
  onExportMarkdown,
}: ChatExportModalProps) {
  if (!isOpen) {
    return null
  }

  const disabled = messagesCount === 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <section
        className="w-full max-w-[460px] rounded-3xl border border-white/10 bg-[var(--color-panel)] shadow-shell"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">
              Exportar chat
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              {messagesCount} mensagens com conteúdo.
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

        <div className="space-y-3 px-5 py-5">
          <button
            type="button"
            disabled={disabled}
            onClick={onExportJson}
            className="flex w-full items-center gap-3 rounded-2xl border border-white/[0.08] bg-black/10 px-4 py-3 text-left text-sm text-zinc-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:text-zinc-600 disabled:hover:bg-black/10"
          >
            <FileJson size={18} aria-hidden="true" />
            JSON compacto
            <Download size={15} aria-hidden="true" className="ml-auto" />
          </button>

          <button
            type="button"
            disabled={disabled}
            onClick={onExportMarkdown}
            className="flex w-full items-center gap-3 rounded-2xl border border-white/[0.08] bg-black/10 px-4 py-3 text-left text-sm text-zinc-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:text-zinc-600 disabled:hover:bg-black/10"
          >
            <FileText size={18} aria-hidden="true" />
            Markdown
            <Download size={15} aria-hidden="true" className="ml-auto" />
          </button>
        </div>
      </section>
    </div>
  )
}

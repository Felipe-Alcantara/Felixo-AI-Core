import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

type CopyButtonProps = {
  /** Performs the copy and resolves with the copied text (empty = nothing). */
  onCopy: () => Promise<string>
  /** Dica e nome acessível; o padrão fala do terminal. */
  title?: string
  label?: string
}

/**
 * Copies the terminal's current selection (or visible viewport) to the
 * clipboard, with brief feedback. Lets you grab agent output the terminal
 * otherwise won't let you select/copy through normal app shortcuts.
 */
export function CopyButton({
  onCopy,
  title = 'Copiar seleção (ou a tela visível)',
  label = 'Copiar do terminal',
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  return (
    <button
      type="button"
      // nodrag so the button works inside a draggable node header.
      className="felixo-btn-icon nodrag rounded-sm p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
      onClick={async () => {
        const text = await onCopy()
        if (text) {
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1500)
        }
      }}
      title={title}
      aria-label={label}
    >
      {copied ? <Check size={15} className="text-(--f-core-white-soft)" /> : <Copy size={15} />}
    </button>
  )
}

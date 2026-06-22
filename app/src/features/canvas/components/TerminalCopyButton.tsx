import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

type CopyButtonProps = {
  /** Performs the copy and resolves with the copied text (empty = nothing). */
  onCopy: () => Promise<string>
}

/**
 * Copies the terminal's current selection (or visible viewport) to the
 * clipboard, with brief feedback. Lets you grab agent output the terminal
 * otherwise won't let you select/copy through normal app shortcuts.
 */
export function CopyButton({ onCopy }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  return (
    <button
      type="button"
      // nodrag so the button works inside a draggable node header.
      className="nodrag rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
      onClick={async () => {
        const text = await onCopy()
        if (text) {
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1500)
        }
      }}
      title="Copiar seleção (ou a tela visível)"
      aria-label="Copiar do terminal"
    >
      {copied ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} />}
    </button>
  )
}

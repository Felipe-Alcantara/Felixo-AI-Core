import { useEffect, useId, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { getFocusableElements, tabTrapTarget } from '../services/keyboard-focus'
import { CANVAS_SHORTCUTS, formatShortcutKeys } from '../services/canvas-shortcuts'
import { formatShortcut } from '../services/dictation'

type Badge = { id: string; number: number; left: number; top: number }

/**
 * Camadas dos atalhos de agente: o número grande sobre cada cartão visível
 * (Alt+Q), o aviso "Ninguém esperando você" e a folha de atalhos (`?`).
 * Sem animação nenhuma: reduced motion já é respeitado por construção.
 */
export function TerminalShortcutsLayer({
  terminalIds,
  numbersVisible,
  message,
  sheetOpen,
  onCloseSheet,
  dictationShortcut,
}: {
  terminalIds: readonly string[]
  numbersVisible: boolean
  message: string | null
  sheetOpen: boolean
  onCloseSheet: () => void
  dictationShortcut: string
}) {
  const platform = window.felixo?.platform ?? 'linux'
  return (
    <>
      {numbersVisible && <NumberBadges terminalIds={terminalIds} />}
      <div role="status" aria-live="polite" className="pointer-events-none fixed bottom-12 left-1/2 z-50 -translate-x-1/2">
        {message && <p className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 shadow-lg ring-1 ring-white/10">{message}</p>}
      </div>
      {sheetOpen && (
        <ShortcutsSheet platform={platform} dictation={formatShortcut(dictationShortcut, platform)} onClose={onCloseSheet} />
      )}
    </>
  )
}

function ShortcutsSheet({ platform, dictation, onClose }: { platform: string; dictation: string; onClose: () => void }) {
  const painelRef = useRef<HTMLDivElement>(null)
  const tituloId = useId()

  useEffect(() => {
    const dialog = painelRef.current
    if (!dialog) return
    const previous = document.activeElement
    ;(getFocusableElements(dialog)[0] ?? dialog).focus()
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') {
        evento.preventDefault()
        evento.stopPropagation()
        onClose()
        return
      }
      if (evento.key !== 'Tab') return
      const elementos = getFocusableElements(dialog)
      const atual = document.activeElement
      const destino = tabTrapTarget(
        elementos,
        atual instanceof HTMLElement ? atual : null,
        evento.shiftKey,
        atual instanceof Node && dialog.contains(atual),
      )
      if (destino || elementos.length === 0) {
        evento.preventDefault()
        ;(destino ?? dialog).focus()
      }
    }
    document.addEventListener('keydown', aoTeclar)
    return () => {
      document.removeEventListener('keydown', aoTeclar)
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
  }, [onClose])

  return (
    <div
      // `nokey`: Delete/Backspace na folha não apagam o bloco selecionado atrás.
      className="nokey fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(evento) => {
        if (!painelRef.current?.contains(evento.target as Node)) onClose()
      }}
    >
      <div
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        tabIndex={-1}
        className="max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto overscroll-contain rounded-lg bg-zinc-800 p-4 shadow-2xl ring-1 ring-white/10 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-sky-400"
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <h2 id={tituloId} className="text-sm font-semibold text-zinc-100">
            Atalhos do teclado
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="felixo-btn-icon shrink-0 rounded-sm p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
            aria-label="Fechar"
          >
            <X size={15} />
          </button>
        </div>
        <ul className="divide-y divide-white/5 text-xs">
          {[
            ...CANVAS_SHORTCUTS,
            { id: 'dictation', keys: '', description: 'Ditar por voz (configurável em Configurações)', context: 'Em qualquer lugar' },
          ].map((entry) => (
            <li key={entry.id} className="flex items-start justify-between gap-3 py-2">
              <div>
                <p className="text-zinc-100">{entry.description}</p>
                <p className="text-zinc-500">{entry.context}</p>
              </div>
              <kbd className="shrink-0 rounded-sm bg-zinc-900 px-1.5 py-0.5 font-mono text-zinc-200 ring-1 ring-white/10">
                {entry.id === 'dictation' ? dictation : formatShortcutKeys(entry.keys, platform)}
              </kbd>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/** Montado só enquanto os números estão à vista: mede os cartões uma vez, ao montar. */
function NumberBadges({ terminalIds }: { terminalIds: readonly string[] }) {
  // Cartões fora da janela não ganham selo.
  const [badges] = useState<Badge[]>(() =>
    terminalIds.flatMap((id, index) => {
      const element = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(id)}"]`)
      const rect = element?.getBoundingClientRect()
      if (!rect || rect.width === 0 || rect.right < 0 || rect.bottom < 0 || rect.left > window.innerWidth || rect.top > window.innerHeight) {
        return []
      }
      return [{ id, number: index + 1, left: rect.left + rect.width / 2, top: rect.top + rect.height / 2 }]
    }),
  )
  return (
    <div aria-hidden="true" data-terminal-numbers className="pointer-events-none fixed inset-0 z-50">
      {badges.map((badge) => (
        <span
          key={badge.id}
          style={{ left: badge.left, top: badge.top }}
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-lg bg-black/80 px-4 py-1 text-5xl font-bold text-white ring-2 ring-sky-400"
        >
          {badge.number}
        </span>
      ))}
    </div>
  )
}

import { useEffect } from 'react'
import { Check, Palette } from 'lucide-react'
import {
  FRAME_COLORS,
  FRAME_COLOR_LABELS,
  FRAME_COLOR_SWATCHES,
  readFrameColor,
} from './frame-colors'
import type { FrameColor } from '../types'

type NodeColorMenuProps = {
  x: number
  y: number
  current: unknown
  onSelect: (color: FrameColor | undefined) => void
  onClose: () => void
}

/**
 * Menu de clique direito num bloco: escolhe a cor da moldura. Um só menu para
 * todos os tipos de nó — terminal, nota, arquivo, página, Notion, desenho e
 * grupo — em vez de um seletor em cada componente.
 */
export function NodeColorMenu({ x, y, current, onSelect, onClose }: NodeColorMenuProps) {
  const active = readFrameColor(current)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      role="menu"
      aria-label="Cor da moldura"
      className="fixed z-50 w-44 rounded-lg border border-white/10 bg-(--f-surface-panel) p-2 text-xs text-(--f-core-white-soft) shadow-2xl"
      style={{ left: x, top: y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <p className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] opacity-70">
        <Palette size={12} aria-hidden /> Cor
      </p>
      <div className="grid grid-cols-3 gap-1.5">
        {FRAME_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            role="menuitemradio"
            aria-checked={active === color}
            aria-label={FRAME_COLOR_LABELS[color]}
            title={FRAME_COLOR_LABELS[color]}
            onClick={() => onSelect(color)}
            className="flex h-7 items-center justify-center rounded-sm border border-white/10 hover:border-white/40"
            style={{ backgroundColor: FRAME_COLOR_SWATCHES[color] }}
          >
            {active === color && <Check size={13} className="text-black/70" aria-hidden />}
          </button>
        ))}
      </div>
      <button
        type="button"
        role="menuitem"
        onClick={() => onSelect(undefined)}
        disabled={!active}
        className="mt-2 w-full rounded-sm px-2 py-1 text-left hover:bg-white/10 disabled:opacity-40"
      >
        Sem cor
      </button>
    </div>
  )
}

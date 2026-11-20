import { useEffect, useRef } from 'react'
import { Check, Palette } from 'lucide-react'
import {
  FRAME_COLORS,
  FRAME_COLOR_LABELS,
  FRAME_COLOR_SWATCHES,
  readFrameColor,
} from './frame-colors'
import type { FrameColor } from '../types'
import { proximoItemDoMenu } from '../services/menu-keyboard'
import { useDismissOnOutside } from '../../shared/focus/useDismissOnOutside'

/** Itens do menu que o teclado percorre, na ordem do DOM (o "Sem cor" some do percurso quando desabilitado). */
const ITENS = '[role^=menuitem]:not(:disabled)'

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

  const menuRef = useRef<HTMLDivElement>(null)
  // Fecha ao clicar em qualquer lugar fora — inclusive dentro de outro bloco,
  // que antes não contava porque só o fundo vazio do canvas fechava o menu.
  useDismissOnOutside(true, menuRef, onClose)

  // O menu abre no ponteiro e não pertence ao fluxo do DOM: o foco entra nele (na cor atual, ou na primeira) e volta
  // para onde estava ao fechar, em vez de cair no body, onde Delete/Backspace são teclas do canvas.
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null
    const menu = menuRef.current
    const itens = [...(menu?.querySelectorAll<HTMLElement>(ITENS) ?? [])]
    ;(itens.find((item) => item.getAttribute('aria-checked') === 'true') ?? itens[0])?.focus()
    return () => {
      const ativo = document.activeElement
      const foiParar = !ativo || ativo === document.body || menu?.contains(ativo)
      if (anterior && anterior.isConnected && foiParar) anterior.focus()
    }
  }, [])

  // Rolar ou dar zoom no canvas move os blocos e deixaria o menu no lugar antigo: fecha (a roda sobre o próprio menu não).
  useEffect(() => {
    const aoRolar = (event: WheelEvent) => {
      const alvo = event.target
      if (!(alvo instanceof Node) || !menuRef.current?.contains(alvo)) onClose()
    }
    window.addEventListener('wheel', aoRolar, { capture: true, passive: true })
    return () => window.removeEventListener('wheel', aoRolar, true)
  }, [onClose])

  const aoTeclar = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Tab') {
      // Sair do menu pelo Tab o fecha: um menu fixo não tem para onde o foco seguir.
      onClose()
      return
    }
    const itens = [...event.currentTarget.querySelectorAll<HTMLElement>(ITENS)]
    const proximo = proximoItemDoMenu(event.key, itens.indexOf(document.activeElement as HTMLElement), itens.length)
    if (proximo === null) return
    event.preventDefault()
    itens[proximo]?.focus()
  }

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Cor da moldura"
      className="fixed z-50 w-44 rounded-lg border border-white/10 bg-(--f-surface-panel) p-2 text-xs text-(--f-core-white-soft) shadow-2xl"
      style={{ left: x, top: y }}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={aoTeclar}
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
            className="flex h-7 items-center justify-center rounded-sm border border-white/10 hover:border-white/40 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-hidden"
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
        className="mt-2 w-full rounded-sm px-2 py-1 text-left hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-hidden disabled:opacity-40"
      >
        Sem cor
      </button>
    </div>
  )
}

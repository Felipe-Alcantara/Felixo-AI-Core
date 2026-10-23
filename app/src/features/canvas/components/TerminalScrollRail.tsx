import { Fragment } from 'react'
import { ArrowDownToLine, ChevronDown, ChevronUp, type LucideIcon } from 'lucide-react'
import type { ClaudeScrollAction } from '../terminal/terminal-claude-scroll'

const ACTIONS: ReadonlyArray<{ action: ClaudeScrollAction; label: string; key: string; Icon: LucideIcon }> = [
  { action: 'pageUp', label: 'Subir meia página', key: 'PageUp', Icon: ChevronUp },
  { action: 'pageDown', label: 'Descer meia página', key: 'PageDown', Icon: ChevronDown },
  { action: 'bottom', label: 'Ir para o fim da conversa', key: 'Ctrl+End', Icon: ArrowDownToLine },
]

type TerminalScrollRailProps = {
  /** O Claude está mostrando o aviso de "ir para o fim": a conversa está rolada para cima. */
  scrolledUp: boolean
  onScroll: (action: ClaudeScrollAction) => void
}

/**
 * Trilho de rolagem do app para o Claude Code em tela cheia. Nessa tela o xterm
 * não guarda histórico, então não há a barra de sempre; quem rola a conversa é
 * o Claude, que não diz onde a rolagem está. O trilho manda as teclas dele e só
 * sabe dizer uma coisa: se a conversa está rolada para cima, e então acende o
 * botão de ir ao fim. Não é uma barra com posição.
 *
 * O `mousedown` não rouba o foco do terminal: quem digita no Claude continua
 * digitando depois do clique.
 */
export function TerminalScrollRail({ scrolledUp, onScroll }: TerminalScrollRailProps) {
  return (
    <div
      role="group"
      aria-label="Rolagem do Claude Code"
      data-felixo-claude-scroll-rail
      data-scrolled-up={scrolledUp}
      className="flex w-6 shrink-0 flex-col items-center gap-0.5 border-l border-white/6 py-1"
    >
      {ACTIONS.map(({ action, label, key, Icon }) => (
        <Fragment key={action}>
          {action === 'pageDown' && (
            <span
              aria-hidden="true"
              className={`w-px flex-1 rounded-full ${scrolledUp ? 'bg-(--f-core-white)/50' : 'bg-white/10'}`}
            />
          )}
          <button
            type="button"
            aria-label={label}
            title={`${label} (${key})`}
            data-felixo-claude-scroll={action}
            className={`felixo-btn-icon rounded-sm p-0.5 ${
              action === 'bottom' && scrolledUp
                ? 'bg-(--f-core-white)/15 text-(--f-core-white)'
                : 'text-zinc-500 hover:bg-white/10 hover:text-zinc-100'
            }`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onScroll(action)}
          >
            <Icon size={14} aria-hidden="true" />
          </button>
        </Fragment>
      ))}
    </div>
  )
}

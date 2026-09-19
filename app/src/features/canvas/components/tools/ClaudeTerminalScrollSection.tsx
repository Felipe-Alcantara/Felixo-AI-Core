import { useState } from 'react'
import { ScrollText } from 'lucide-react'
import { FelixoToggle } from '../../../shared/components/FelixoToggle'
import { loadClaudeTerminalScroll, saveClaudeTerminalScroll } from '../../services/terminal-scroll-preference'

/**
 * Barra de rolagem no terminal do Claude Code. Por padrão ele usa a tela
 * alternativa do terminal, que não tem histórico para rolar. Ligado, o Felixo
 * abre os terminais NOVOS do Claude com `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1`.
 */
export function ClaudeTerminalScrollSection() {
  const [enabled, setEnabled] = useState(loadClaudeTerminalScroll)

  function change(next: boolean) {
    setEnabled(next)
    saveClaudeTerminalScroll(next)
  }

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-black/10 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
            <ScrollText size={14} aria-hidden="true" />
            Rolagem no terminal do Claude Code
          </div>
          <p className="mt-2 text-xs leading-relaxed text-zinc-500">
            O Claude Code usa a tela alternativa do terminal, que não guarda histórico, então não
            há barra de rolagem como no Codex. Ligado, os terminais novos do Claude abrem no modo
            clássico dele (com barra de rolagem). Terminais já abertos não mudam. Efeitos em
            menus, seleção com o mouse e redesenho ainda não foram conferidos numa janela real.
          </p>
        </div>
        <FelixoToggle checked={enabled} onChange={change} label="Rolagem no terminal do Claude Code" />
      </div>
      {enabled && (
        <p className="mt-2 text-[11px] leading-relaxed text-emerald-300/80">
          Ativado — vale para os próximos terminais do Claude Code.
        </p>
      )}
    </section>
  )
}

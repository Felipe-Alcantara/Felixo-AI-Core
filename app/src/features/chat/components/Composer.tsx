import type { FormEvent, KeyboardEvent } from 'react'
import { ChevronDown, Mic, Plus, Send } from 'lucide-react'
import type { Agent, AgentId } from '../types'

type ComposerProps = {
  input: string
  starters: string[]
  agents: Agent[]
  selectedAgent: Agent
  variant?: 'home' | 'dock'
  onInputChange: (value: string) => void
  onSelectAgent: (agentId: AgentId) => void
  onSubmit: () => void
}

export function Composer({
  input,
  starters,
  agents,
  selectedAgent,
  variant = 'dock',
  onInputChange,
  onSelectAgent,
  onSubmit,
}: ComposerProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      onSubmit()
    }
  }

  const isHome = variant === 'home'

  return (
    <form
      onSubmit={handleSubmit}
      className={
        isHome
          ? ''
          : 'shrink-0 border-t border-white/[0.08] bg-[#171717] px-5 py-4 max-sm:px-3 max-sm:py-3 [@media(max-height:620px)]:py-2'
      }
    >
      <div
        className={
          isHome
            ? 'mx-auto w-full max-w-[600px]'
            : 'mx-auto w-full max-w-[680px]'
        }
      >
        <div className="rounded-[1.45rem] border border-white/[0.08] bg-[#2b2b2a] shadow-soft">
          <textarea
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={isHome ? 3 : 2}
            placeholder="Como posso ajudar você hoje?"
            className="max-h-36 min-h-16 w-full resize-none bg-transparent px-5 py-4 text-[13px] leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-500 max-sm:px-4 max-sm:py-3 [@media(max-height:620px)]:min-h-12"
          />

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] px-4 py-2.5 max-sm:px-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <button
                type="button"
                title="Adicionar contexto"
                className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-100"
              >
                <Plus size={17} aria-hidden="true" />
                <span className="sr-only">Adicionar contexto</span>
              </button>

              <select
                value={selectedAgent.id}
                onChange={(event) => onSelectAgent(event.target.value as AgentId)}
                className="max-w-36 appearance-none truncate rounded-full border border-white/[0.08] bg-transparent px-3 py-1.5 text-[12px] text-zinc-300 outline-none transition hover:bg-white/[0.06] focus:ring-2 focus:ring-violet-200/40 max-sm:max-w-28"
                aria-label="Selecionar agente"
              >
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>

              <span className="flex items-center gap-1 rounded-full border border-white/[0.08] px-3 py-1.5 text-[12px] text-zinc-400 max-[420px]:hidden">
                {selectedAgent.tone}
                <ChevronDown size={12} aria-hidden="true" />
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                title="Voz"
                className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-100"
              >
                <Mic size={15} aria-hidden="true" />
                <span className="sr-only">Voz</span>
              </button>
              <button
                type="submit"
                title="Enviar"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-200 text-zinc-950 transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-100 focus:ring-offset-2 focus:ring-offset-[#2b2b2a]"
              >
                <Send size={15} aria-hidden="true" />
                <span className="sr-only">Enviar</span>
              </button>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap justify-center gap-2 [@media(max-height:620px)]:hidden">
          {starters.map((starter) => (
            <button
              key={starter}
              type="button"
              onClick={() => onInputChange(`${starter}: `)}
              className="shrink-0 rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-[12px] text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-violet-200/40"
            >
              {starter}
            </button>
          ))}
        </div>
      </div>
    </form>
  )
}

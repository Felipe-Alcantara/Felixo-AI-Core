import type { FormEvent, KeyboardEvent } from 'react'
import { Send } from 'lucide-react'

type ComposerProps = {
  input: string
  starters: string[]
  onInputChange: (value: string) => void
  onSubmit: () => void
}

export function Composer({
  input,
  starters,
  onInputChange,
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

  return (
    <form
      onSubmit={handleSubmit}
      className="shrink-0 border-t border-white/10 bg-black/20 px-5 py-4"
    >
      <div className="mx-auto max-w-2xl">
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {starters.map((starter) => (
            <button
              key={starter}
              type="button"
              onClick={() => onInputChange(starter)}
              className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-300 transition hover:bg-white/[0.08] focus:outline-none focus:ring-2 focus:ring-violet-200/50"
            >
              {starter}
            </button>
          ))}
        </div>

        <div className="flex items-end gap-3 rounded-[1.65rem] border border-white/10 bg-zinc-900/85 p-3 shadow-soft">
          <textarea
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            placeholder="Joga a ideia aqui..."
            className="max-h-32 min-h-14 flex-1 resize-none bg-transparent px-1 py-1 text-sm leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-600"
          />
          <button
            type="submit"
            title="Enviar"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-200 text-zinc-950 transition hover:bg-violet-100 focus:outline-none focus:ring-2 focus:ring-violet-100 focus:ring-offset-2 focus:ring-offset-zinc-900"
          >
            <Send size={18} aria-hidden="true" />
            <span className="sr-only">Enviar</span>
          </button>
        </div>
      </div>
    </form>
  )
}

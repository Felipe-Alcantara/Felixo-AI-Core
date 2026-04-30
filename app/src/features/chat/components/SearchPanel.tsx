import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import type { ChatSession } from '../types'

type SearchPanelProps = {
  sessions: ChatSession[]
  isOpen: boolean
  onClose: () => void
  onSelectSession: (session: ChatSession) => void
}

function highlight(text: string, query: string) {
  if (!query) return text
  const index = text.toLowerCase().indexOf(query.toLowerCase())
  if (index === -1) return text
  return (
    text.slice(0, index) +
    `<mark class="bg-amber-400/30 text-inherit rounded-sm">${text.slice(index, index + query.length)}</mark>` +
    text.slice(index + query.length)
  )
}

export function SearchPanel({ sessions, isOpen, onClose, onSelectSession }: SearchPanelProps) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  const filtered = query.trim()
    ? sessions.filter((s) => {
        const q = query.toLowerCase()
        if (s.title.toLowerCase().includes(q)) return true
        return s.messages.some((m) => m.content.toLowerCase().includes(q))
      })
    : sessions

  return (
    <div
      className={[
        'absolute inset-0 z-20 flex flex-col bg-[#272727]',
        'transition-opacity duration-200',
        isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
      ].join(' ')}
    >
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-white/[0.08] px-3">
        <Search size={13} className="shrink-0 text-zinc-500" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Pesquisar chats..."
          className="min-w-0 flex-1 bg-transparent text-[13px] text-zinc-200 placeholder-zinc-600 outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="shrink-0 rounded p-0.5 text-zinc-500 transition hover:text-zinc-300"
          >
            <X size={12} />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-zinc-500 transition hover:text-zinc-300"
        >
          Esc
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {filtered.length === 0 ? (
          <p className="px-4 pt-6 text-center text-[12px] text-zinc-600">
            {query ? 'Nenhum chat encontrado.' : 'Nenhum chat ainda.'}
          </p>
        ) : (
          filtered.map((session) => {
            const snippet = session.messages.find((m) => {
              const q = query.toLowerCase()
              return q && m.content.toLowerCase().includes(q)
            })?.content ?? session.messages[session.messages.length - 1]?.content ?? ''

            const trimmedSnippet = snippet.length > 80 ? snippet.slice(0, 80) + '…' : snippet

            return (
              <button
                key={session.id}
                type="button"
                onClick={() => { onSelectSession(session); onClose() }}
                className="flex w-full flex-col gap-0.5 px-4 py-2.5 text-left transition hover:bg-white/[0.05]"
              >
                <span
                  className="text-[12px] font-medium text-zinc-300"
                  dangerouslySetInnerHTML={{ __html: highlight(session.title, query) }}
                />
                {trimmedSnippet && (
                  <span
                    className="text-[11px] text-zinc-600 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: highlight(trimmedSnippet, query) }}
                  />
                )}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

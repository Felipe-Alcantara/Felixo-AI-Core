import { Bot, User } from 'lucide-react'
import type { Agent, ChatMessage } from '../types'

type ChatThreadProps = {
  agents: Agent[]
  messages: ChatMessage[]
}

export function ChatThread({ agents, messages }: ChatThreadProps) {
  return (
    <section className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
      <div className="mx-auto flex max-w-2xl flex-col gap-3">
        {messages.map((message) => {
          const agent = agents.find((item) => item.id === message.agent)
          const isUser = message.role === 'user'

          return (
            <article
              key={message.id}
              className={`flex items-end gap-2 ${isUser ? 'justify-end' : ''}`}
            >
              {!isUser && (
                <span className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-violet-200/20 bg-violet-200/10 text-violet-100">
                  <Bot size={16} aria-hidden="true" />
                </span>
              )}

              <div
                className={`max-w-[78%] rounded-[1.45rem] border px-4 py-3 shadow-soft max-sm:max-w-[86%] ${
                  isUser
                    ? 'rounded-br-md border-sky-200/20 bg-sky-200/10'
                    : 'rounded-bl-md border-white/10 bg-white/[0.055]'
                }`}
              >
                <div className="mb-1.5 flex items-center justify-between gap-4">
                  <span className="text-[11px] font-medium text-zinc-400">
                    {isUser ? 'Você' : agent?.name ?? 'Felixo'}
                  </span>
                  <span className="text-[10px] text-zinc-600">
                    {message.createdAt}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-100">
                  {message.content}
                </p>
              </div>

              {isUser && (
                <span className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-sky-200/20 bg-sky-200/10 text-sky-100">
                  <User size={15} aria-hidden="true" />
                </span>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}

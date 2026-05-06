import { useEffect, useRef } from 'react'
import { Bot, User } from 'lucide-react'
import type { ChatMessage, ContextAttachment, Model } from '../types'
import { MarkdownContent } from './MarkdownContent'

type ChatThreadProps = {
  models: Model[]
  messages: ChatMessage[]
}

export function ChatThread({ models, messages }: ChatThreadProps) {
  const threadEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  return (
    <section className="min-h-0 flex-1 overflow-y-auto px-8 py-7 max-sm:px-4 max-sm:py-4 [@media(max-height:620px)]:py-3">
      <div className="mx-auto flex max-w-[720px] flex-col gap-4">
        {messages.map((message) => {
          const model = models.find((item) => item.id === message.model)
          const isUser = message.role === 'user'

          return (
            <article
              key={message.id}
              className={`flex min-w-0 items-end gap-2 ${isUser ? 'justify-end' : ''}`}
            >
              {!isUser && (
                  <span className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-orange-200/20 bg-orange-200/10 text-orange-100">
                  <Bot size={16} aria-hidden="true" />
                </span>
              )}

              <div
                className={`min-w-0 max-w-[78%] rounded-[1.45rem] border px-4 py-3 shadow-soft max-sm:max-w-[86%] ${
                  isUser
                    ? 'rounded-br-md border-sky-200/[0.15] bg-sky-200/[0.08]'
                    : 'rounded-bl-md border-white/[0.08] bg-[#252524]'
                }`}
              >
                <div className="mb-1.5 flex items-center justify-between gap-4">
                  <span className="text-[11px] font-medium text-zinc-400">
                    {isUser ? 'Você' : model?.name ?? 'Felixo'}
                  </span>
                  <span className="text-[10px] text-zinc-600">
                    {message.createdAt}
                  </span>
                </div>
                {isUser ? (
                  <>
                    <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-100">
                      {message.content}
                    </p>
                    <MessageAttachments attachments={message.attachments ?? []} />
                  </>
                ) : (
                  <MarkdownContent content={message.content} />
                )}
                <span>
                  {message.isStreaming && (
                    <span className="ml-1 inline-block h-4 w-1.5 animate-pulse rounded-full bg-orange-200 align-middle" />
                  )}
                </span>
              </div>

              {isUser && (
                <span className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-sky-200/20 bg-sky-200/10 text-sky-100">
                  <User size={15} aria-hidden="true" />
                </span>
              )}
            </article>
          )
        })}
        <div ref={threadEndRef} />
      </div>
    </section>
  )
}

function MessageAttachments({
  attachments,
}: {
  attachments: ContextAttachment[]
}) {
  if (attachments.length === 0) {
    return null
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      {attachments.map((attachment) =>
        isImageAttachment(attachment) && attachment.previewUrl ? (
          <figure
            key={attachment.id}
            className="overflow-hidden rounded-lg border border-sky-200/[0.12] bg-black/20"
          >
            <div className="flex max-h-72 min-h-32 items-center justify-center bg-black/20">
              <img
                src={attachment.previewUrl}
                alt={attachment.name}
                className="max-h-72 w-full object-contain"
              />
            </div>
            <figcaption className="flex min-w-0 items-center justify-between gap-3 border-t border-white/[0.06] px-2.5 py-1.5 text-[11px] text-zinc-400">
              <span className="min-w-0 truncate">{attachment.name}</span>
              <span className="shrink-0 font-mono text-[10px] text-zinc-600">
                {formatFileSize(attachment.size)}
              </span>
            </figcaption>
          </figure>
        ) : (
          <div
            key={attachment.id}
            title={attachment.path || attachment.name}
            className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-sky-200/[0.12] bg-black/15 px-2.5 py-1.5 text-[11px] text-zinc-300"
          >
            <span className="min-w-0 truncate">{attachment.name}</span>
            <span className="shrink-0 font-mono text-[10px] text-zinc-600">
              {formatFileSize(attachment.size)}
            </span>
          </div>
        ),
      )}
    </div>
  )
}

function isImageAttachment(attachment: ContextAttachment) {
  return (
    attachment.type.startsWith('image/') ||
    /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(attachment.name)
  )
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

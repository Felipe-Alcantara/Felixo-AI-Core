import { useEffect, useRef, useState } from 'react'
import { Bot, Maximize2, User, X } from 'lucide-react'
import type { ChatMessage, ContextAttachment, Model } from '../types'
import { MarkdownContent } from './MarkdownContent'

type ExpandedImage = {
  id: string
  name: string
  size: number
  src: string
  isLoadingOriginal: boolean
}

type ChatThreadProps = {
  models: Model[]
  messages: ChatMessage[]
}

export function ChatThread({ models, messages }: ChatThreadProps) {
  const threadEndRef = useRef<HTMLDivElement>(null)
  const [expandedImage, setExpandedImage] = useState<ExpandedImage | null>(null)

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  function openImageAttachment(attachment: ContextAttachment) {
    if (!attachment.previewUrl) {
      return
    }

    const shouldLoadOriginal = Boolean(
      attachment.path && window.felixo?.files?.readImageAttachment,
    )

    setExpandedImage({
      id: attachment.id,
      name: attachment.name,
      size: attachment.size,
      src: attachment.previewUrl,
      isLoadingOriginal: shouldLoadOriginal,
    })

    if (!attachment.path || !window.felixo?.files?.readImageAttachment) {
      return
    }

    void window.felixo.files
      .readImageAttachment({
        path: attachment.path,
        name: attachment.name,
        type: attachment.type,
      })
      .then((result) => {
        setExpandedImage((currentImage) => {
          if (!currentImage || currentImage.id !== attachment.id) {
            return currentImage
          }

          if (!result.ok || !result.dataUrl) {
            return { ...currentImage, isLoadingOriginal: false }
          }

          return {
            ...currentImage,
            src: result.dataUrl,
            size: result.size ?? attachment.size,
            isLoadingOriginal: false,
          }
        })
      })
      .catch(() => {
        setExpandedImage((currentImage) =>
          currentImage?.id === attachment.id
            ? { ...currentImage, isLoadingOriginal: false }
            : currentImage,
        )
      })
  }

  return (
    <>
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
                      <MessageAttachments
                        attachments={message.attachments ?? []}
                        onOpenImage={openImageAttachment}
                      />
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

      {expandedImage && (
        <ImageLightbox
          image={expandedImage}
          onClose={() => setExpandedImage(null)}
        />
      )}
    </>
  )
}

function MessageAttachments({
  attachments,
  onOpenImage,
}: {
  attachments: ContextAttachment[]
  onOpenImage: (attachment: ContextAttachment) => void
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
            <button
              type="button"
              title={`Expandir ${attachment.name}`}
              onClick={() => onOpenImage(attachment)}
              className="group relative flex max-h-72 min-h-32 w-full items-center justify-center bg-black/20 outline-none focus:ring-2 focus:ring-sky-200/40"
            >
              <img
                src={attachment.previewUrl}
                alt={attachment.name}
                className="max-h-72 w-full object-contain"
              />
              <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-black/60 text-zinc-200 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                <Maximize2 size={14} aria-hidden="true" />
              </span>
            </button>
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

function ImageLightbox({
  image,
  onClose,
}: {
  image: ExpandedImage
  onClose: () => void
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={image.name}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
    >
      <section
        onMouseDown={(event) => event.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-[min(96vw,1200px)] flex-col overflow-hidden rounded-xl border border-white/10 bg-zinc-950 shadow-shell"
      >
        <header className="flex min-h-12 items-center justify-between gap-3 border-b border-white/[0.08] px-3 py-2">
          <div className="min-w-0">
            <div className="truncate text-[12px] font-medium text-zinc-100">
              {image.name}
            </div>
            <div className="font-mono text-[10px] text-zinc-600">
              {formatFileSize(image.size)}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {image.isLoadingOriginal && (
              <span className="h-2 w-2 animate-pulse rounded-full bg-sky-200" />
            )}
            <button
              type="button"
              title="Fechar imagem"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-100"
            >
              <X size={16} aria-hidden="true" />
              <span className="sr-only">Fechar imagem</span>
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 items-center justify-center bg-black p-3">
          <img
            src={image.src}
            alt={image.name}
            className="max-h-[78vh] max-w-full object-contain"
          />
        </div>
      </section>
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

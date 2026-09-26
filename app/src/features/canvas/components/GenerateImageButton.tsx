// "Gerar imagem", na seção Criar da sidebar: a pessoa descreve a imagem, escolhe
// um modelo do catálogo público de imagem do OpenRouter e o Openia gera. Este
// componente só dispara o pedido e mostra o estado — a imagem entra no canvas
// sozinha pelo evento `canvas:image-generated`, que o CanvasView já escuta.
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronDown, CircleAlert, LoaderCircle, RotateCw, WandSparkles } from 'lucide-react'
import { FelixoSelect, type FelixoSelectOption } from '../../shared/components/FelixoSelect'
import { useOpeniaImageGeneration } from '../hooks/useOpeniaImageGeneration'
import { IMAGE_PROMPT_MAX_CHARS, type ImageGenerationState } from '../services/openia-image-store'

type Props = {
  /** Mesma forma dos outros botões da sidebar (vem do CanvasToolbar). */
  triggerClassName: string
}

type FieldError = { field: 'prompt' | 'model' | 'generation'; message: string }

const ERROR_TEXT = 'text-xs leading-snug text-theme-error'

/**
 * Popover no padrão de "Página Web" (Esc e clique fora fecham e devolvem o foco
 * ao gatilho). Fechar não interrompe a geração: o gatilho continua mostrando
 * "Gerando imagem…" e, se a geração falhar com o popover fechado, um alerta no
 * ícone avisa que há um motivo para ler.
 */
export function GenerateImageButton({ triggerClassName }: Props) {
  const image = useOpeniaImageGeneration()
  const { acknowledge, loadModels } = image
  const [open, setOpen] = useState(false)
  const [fieldError, setFieldError] = useState<FieldError | null>(null)
  const popoverId = useId()
  const promptId = `${popoverId}-prompt`
  const modelId = `${popoverId}-model`
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const promptRef = useRef<HTMLTextAreaElement>(null)

  const generation = image.generation
  const pending = generation.status === 'pending'
  const failed = generation.status === 'error'

  const close = useCallback(() => {
    setOpen(false)
    setFieldError(null)
    // Quem fechou já viu o desfecho; um pedido em andamento continua.
    acknowledge()
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }, [acknowledge])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      // `defaultPrevented`: o Esc que fechou a lista de modelos não fecha o popover junto.
      if (
        event.key !== 'Escape' ||
        event.defaultPrevented ||
        !event.target ||
        !containerRef.current?.contains(event.target as Node)
      ) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      close()
    }
    const onOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) close()
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onOutsideClick)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onOutsideClick)
    }
  }, [open, close])

  const toggle = () => {
    if (open) {
      close()
      return
    }
    setOpen(true)
    // O catálogo é uma consulta de rede: só quando a pessoa abre, e uma vez só (o serviço guarda 10 min).
    void loadModels()
  }

  const submit = () => {
    const outcome = image.generate()
    if (outcome.ok) {
      setFieldError(null)
      return
    }
    setFieldError(outcome)
    window.requestAnimationFrame(() => {
      if (outcome.field === 'prompt') promptRef.current?.focus()
      else if (outcome.field === 'model') document.getElementById(modelId)?.focus()
    })
  }

  const onPromptKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter quebra linha (descrições longas são comuns); Ctrl/Cmd+Enter gera.
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !pending) {
      event.preventDefault()
      submit()
    }
  }

  const models = image.models
  const modelOptions: FelixoSelectOption[] =
    models.status === 'ready'
      ? models.models.map((model) => ({
          value: model.id,
          label: model.name,
          meta: model.vendor,
          searchText: `${model.name} ${model.id} ${model.vendor}`,
        }))
      : []
  const modelPlaceholder =
    models.status === 'error'
      ? 'Catálogo indisponível'
      : models.status === 'ready' && modelOptions.length === 0
        ? 'Nenhum modelo de imagem no catálogo'
        : 'Escolha o modelo'

  const promptError = fieldError?.field === 'prompt' ? fieldError : null
  const modelError = fieldError?.field === 'model' ? fieldError : null
  const generationError = fieldError?.field === 'generation' ? fieldError : null

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        className={`${triggerClassName} w-full`}
        title={
          failed && !open
            ? 'A última geração de imagem falhou — abra para ver o motivo'
            : 'Gerar uma imagem por IA com o Openia (OpenRouter) e colocá-la no canvas'
        }
        aria-expanded={open}
        aria-controls={popoverId}
        aria-description={failed && !open ? 'A última geração falhou; abra para ver o motivo.' : undefined}
      >
        {pending ? (
          <LoaderCircle size={16} className="motion-safe:animate-spin" aria-hidden="true" />
        ) : failed && !open ? (
          <CircleAlert size={16} className="text-theme-error" aria-hidden="true" />
        ) : (
          <WandSparkles size={16} aria-hidden="true" />
        )}
        {pending ? 'Gerando imagem…' : 'Gerar imagem'}
        <ChevronDown
          size={14}
          className={`ml-auto transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          id={popoverId}
          role="group"
          aria-label="Gerar imagem com o Openia"
          className="felixo-anim-sequential-panel felixo-sidebar-inline-panel mt-2 w-full rounded-lg bg-zinc-800 p-2 shadow-xl ring-1 ring-white/10"
        >
          <label htmlFor={promptId} className="felixo-field-label">
            Descrição da imagem
          </label>
          <textarea
            ref={promptRef}
            id={promptId}
            autoFocus
            rows={4}
            value={image.prompt}
            maxLength={IMAGE_PROMPT_MAX_CHARS}
            onChange={(event) => {
              image.setPrompt(event.target.value)
              if (promptError) setFieldError(null)
            }}
            onKeyDown={onPromptKeyDown}
            placeholder="Ex.: um gato astronauta em aquarela"
            aria-invalid={promptError ? true : undefined}
            aria-describedby={`${promptId}-hint${promptError ? ` ${promptId}-error` : ''}`}
            className="felixo-field w-full resize-y px-2 py-1.5 text-sm outline-hidden"
          />
          <div
            id={`${promptId}-hint`}
            className="mb-2 mt-0.5 flex items-center justify-between gap-2 text-[11px] text-zinc-500"
          >
            <span>Ctrl+Enter gera</span>
            <span>
              {image.prompt.length}/{IMAGE_PROMPT_MAX_CHARS}
            </span>
          </div>
          {promptError && (
            <p id={`${promptId}-error`} role="alert" className={`-mt-1 mb-2 ${ERROR_TEXT}`}>
              {promptError.message}
            </p>
          )}

          <label htmlFor={modelId} className="felixo-field-label">
            Modelo de imagem
          </label>
          <FelixoSelect
            id={modelId}
            value={image.model}
            onChange={(value) => {
              image.setModel(value)
              if (modelError) setFieldError(null)
            }}
            options={modelOptions}
            placeholder={modelPlaceholder}
            loading={models.status === 'loading'}
            disabled={modelOptions.length === 0}
            invalid={Boolean(modelError)}
            searchable={modelOptions.length > 8}
            searchPlaceholder="Buscar modelo…"
            menuLabel="Modelos que geram imagem"
            aria-label="Modelo de imagem"
            className="mb-2"
          />
          {modelError && (
            <p role="alert" className={`-mt-1 mb-2 ${ERROR_TEXT}`}>
              {modelError.message}
            </p>
          )}
          {models.status === 'error' && (
            <div className="mb-2 flex items-start gap-2" role="alert">
              <p className={`min-w-0 flex-1 ${ERROR_TEXT}`}>{models.message}</p>
              <button
                type="button"
                onClick={() => void loadModels({ force: true })}
                className="felixo-btn-icon inline-flex shrink-0 items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] text-zinc-300 hover:bg-white/5 hover:text-zinc-100"
                title="Consultar o catálogo de modelos de imagem de novo"
              >
                <RotateCw size={11} aria-hidden="true" />
                Tentar de novo
              </button>
            </div>
          )}

          <p className="mb-2 text-[11px] leading-relaxed text-zinc-500">
            O Openia gera com a sua chave do OpenRouter, que pode cobrar créditos.
          </p>

          <GenerationStatus generation={generation} extraError={generationError?.message} />

          {/*
            Dois botões fixos, e não um que troca de papel: com um só, o segundo
            clique de um duplo clique em "Gerar" cancelava o pedido, e um clique
            em "Cancelar" que chegasse junto com o fim da geração disparava outra
            (paga). Cada um fica sempre no mesmo lugar e, quando não vale,
            `aria-disabled` (não `disabled`): o foco não cai para o `<body>` no
            meio da geração, e o Esc continua fechando o popover.
          */}
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={pending ? undefined : submit}
              aria-disabled={pending || undefined}
              className="felixo-btn felixo-primary-action flex-1 px-3 py-1.5 text-sm aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
            >
              Gerar
            </button>
            <button
              type="button"
              onClick={pending && !generation.cancelling ? () => void image.cancel() : undefined}
              aria-disabled={!pending || generation.cancelling || undefined}
              title={pending ? 'Interromper a geração em andamento' : 'Nada sendo gerado agora'}
              className="felixo-btn rounded-sm px-3 py-1.5 text-sm text-(--f-core-white-soft) ring-1 ring-white/15 hover:bg-white/6 aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-transparent"
            >
              {pending && generation.cancelling ? 'Cancelando…' : 'Cancelar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Linha de estado do pedido: anunciada ao leitor de tela sem repetir o cronômetro a cada segundo. */
function GenerationStatus({
  generation,
  extraError,
}: {
  generation: ImageGenerationState
  extraError?: string
}) {
  if (extraError) {
    return (
      <p role="alert" className={`mb-2 ${ERROR_TEXT}`}>
        {extraError}
      </p>
    )
  }
  switch (generation.status) {
    case 'pending':
      return (
        <p role="status" className="mb-2 flex items-center gap-1.5 text-xs text-zinc-300">
          <LoaderCircle size={12} className="shrink-0 motion-safe:animate-spin" aria-hidden="true" />
          {generation.cancelling ? 'Cancelando a geração…' : 'Gerando imagem…'}
          <ElapsedSeconds startedAt={generation.startedAt} />
        </p>
      )
    case 'success':
      return (
        <p role="status" className="mb-2 text-xs text-zinc-300">
          {generation.count > 1
            ? `${generation.count} imagens adicionadas ao canvas.`
            : 'Imagem adicionada ao canvas.'}
        </p>
      )
    case 'cancelled':
      return (
        <p role="status" className="mb-2 text-xs text-zinc-400">
          {generation.message}
        </p>
      )
    case 'error':
      return (
        <p role="alert" className={`mb-2 ${ERROR_TEXT}`}>
          {generation.message}
        </p>
      )
    default:
      return null
  }
}

function secondsSince(startedAt: number) {
  return Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
}

/** Tempo desde o início; fora da região viva, para o leitor de tela não ler cada segundo. */
function ElapsedSeconds({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(() => secondsSince(startedAt))
  useEffect(() => {
    const timer = window.setInterval(() => setElapsed(secondsSince(startedAt)), 1000)
    return () => window.clearInterval(timer)
  }, [startedAt])
  return (
    <span className="ml-auto tabular-nums text-zinc-500" aria-hidden="true">
      {elapsed} s
    </span>
  )
}

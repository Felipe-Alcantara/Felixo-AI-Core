import { useLayoutEffect, useRef, type PropsWithChildren, type RefObject } from 'react'
import { Loader2, Mic, MicOff, X } from 'lucide-react'
import type { Dictation } from '../hooks/useDictation'
import { formatElapsed } from '../services/dictation'
import { useDismissOnOutside } from '../../shared/focus/useDismissOnOutside'
import { FelixoPopoverSurface } from '../../shared/components/FelixoPopoverSurface'

const VIEWPORT_GAP = 8

type Props = { dictation: Dictation; shortcutLabel: string }

/**
 * Botão de microfone + indicador de gravação. Gravando: ponto vermelho e
 * cronômetro; transcrevendo: spinner; erro/aviso: texto visível (não só
 * tooltip) para a pessoa saber por que nada apareceu no terminal.
 */
export function DictationButton({ dictation, shortcutLabel }: Props) {
  const { state, elapsedMs, notice, toggle, cancel, dismiss } = dictation
  const recording = state.phase === 'recording'
  const transcribing = state.phase === 'transcribing'
  const failed = state.phase === 'error'

  const containerRef = useRef<HTMLDivElement>(null)
  // O aviso flutuante some ao clicar fora, com Esc ou ao sair da janela, como
  // os outros menus — antes só o "Fechar" o tirava da frente.
  useDismissOnOutside(failed || Boolean(notice), containerRef, dismiss)

  const title = recording
    ? `Parar e transcrever (${shortcutLabel})`
    : transcribing
      ? 'Transcrevendo…'
      : `Ditar por voz (${shortcutLabel})`

  return (
    <div ref={containerRef} className="relative flex items-center gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={transcribing}
        aria-pressed={recording}
        aria-label={title}
        title={title}
        data-dictation-state={state.phase}
        className={`felixo-btn-icon flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs ${
          recording ? 'bg-red-500/20 text-red-200' : 'text-(--f-core-white-soft) hover:bg-white/10'
        } disabled:opacity-60`}
      >
        {transcribing ? (
          <Loader2 size={14} className="animate-spin" aria-hidden />
        ) : failed ? (
          <MicOff size={14} aria-hidden />
        ) : (
          <Mic size={14} aria-hidden />
        )}
        {recording && (
          <>
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" aria-hidden />
            <span role="timer" aria-label="Tempo de gravação">{formatElapsed(elapsedMs)}</span>
          </>
        )}
      </button>
      {recording && (
        <button
          type="button"
          onClick={cancel}
          aria-label="Descartar gravação"
          title="Descartar gravação"
          className="felixo-btn-icon rounded-sm p-1 text-zinc-300 hover:bg-white/10"
        >
          <X size={12} aria-hidden />
        </button>
      )}
      {(failed || notice) && (
        <DictationNotice anchorRef={containerRef} role={failed ? 'alert' : 'status'}>
          <p className={failed ? 'text-red-300' : undefined}>{failed ? state.message : notice}</p>
          <button type="button" onClick={dismiss} className="mt-1 text-[10px] opacity-70 hover:opacity-100">
            Fechar
          </button>
        </DictationNotice>
      )}
    </div>
  )
}

/**
 * O aviso sai por portal: a barra do topo corta o que passa da altura dela
 * (`overflow: hidden`), e o aviso absoluto ficava invisível — a pessoa via só
 * o microfone riscado, sem saber por quê. Fica logo abaixo do botão, alinhado
 * à direita dele e contido na janela.
 */
function DictationNotice({
  anchorRef,
  role,
  children,
}: PropsWithChildren<{ anchorRef: RefObject<HTMLElement | null>; role: 'alert' | 'status' }>) {
  const surfaceRef = useRef<HTMLDivElement>(null)

  // Posição escrita pela ref, sem re-render.
  useLayoutEffect(() => {
    const surface = surfaceRef.current
    if (!surface) return undefined
    const place = () => {
      const anchor = anchorRef.current?.getBoundingClientRect()
      if (!anchor) return
      const box = surface.getBoundingClientRect()
      const left = Math.max(VIEWPORT_GAP, Math.min(anchor.right - box.width, window.innerWidth - box.width - VIEWPORT_GAP))
      surface.style.left = `${left}px`
      surface.style.top = `${anchor.bottom + 4}px`
    }
    place()
    const resize = new ResizeObserver(place)
    resize.observe(surface)
    window.addEventListener('resize', place)
    return () => {
      resize.disconnect()
      window.removeEventListener('resize', place)
    }
  }, [anchorRef])

  return (
    <FelixoPopoverSurface
      surfaceRef={surfaceRef}
      role={role}
      className="w-72 p-2 text-[11px] leading-relaxed text-(--f-core-white-soft)"
    >
      {children}
    </FelixoPopoverSurface>
  )
}

import { Loader2, Mic, MicOff, X } from 'lucide-react'
import type { Dictation } from '../hooks/useDictation'
import { formatElapsed } from '../services/dictation'

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

  const title = recording
    ? `Parar e transcrever (${shortcutLabel})`
    : transcribing
      ? 'Transcrevendo…'
      : `Ditar por voz (${shortcutLabel})`

  return (
    <div className="relative flex items-center gap-1">
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
        <div
          role={failed ? 'alert' : 'status'}
          className="absolute right-0 top-full z-50 mt-1 w-72 rounded-md border border-white/10 bg-(--f-surface-panel) p-2 text-[11px] leading-relaxed text-(--f-core-white-soft) shadow-xl"
        >
          <p className={failed ? 'text-red-300' : undefined}>{failed ? state.message : notice}</p>
          <button type="button" onClick={dismiss} className="mt-1 text-[10px] opacity-70 hover:opacity-100">
            Fechar
          </button>
        </div>
      )}
    </div>
  )
}

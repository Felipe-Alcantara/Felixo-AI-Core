import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, CheckCircle2, CircleDashed, Copy } from 'lucide-react'
import {
  describeCliDiagnosis,
  type CliDiagnosis,
  type CliDiagnosisTone,
} from './cli-diagnosis'
import type { CliDiagnosisState } from './useCliDiagnosis'

const TONE_TEXT: Record<CliDiagnosisTone, string> = {
  ready: 'text-theme-success',
  missing: 'text-zinc-300',
  problem: 'text-theme-error',
}

const TONE_ICON: Record<CliDiagnosisTone, typeof CheckCircle2> = {
  ready: CheckCircle2,
  missing: CircleDashed,
  problem: AlertTriangle,
}

const COPY_FEEDBACK_MS = 2000

/**
 * O diagnóstico de UMA CLI: o que aconteceu (rótulo curto) e o que fazer
 * (texto escrito pelo processo principal). Vive dentro do cartão da CLI.
 */
export function CliDiagnosisLine({ diagnosis }: { diagnosis: CliDiagnosis }) {
  const { label, tone, detail } = describeCliDiagnosis(diagnosis)
  const Icon = TONE_ICON[tone]

  return (
    <div className="mt-2 space-y-0.5 text-[11px] leading-relaxed" data-cli-diagnosis={diagnosis.id}>
      <p className={`flex items-center gap-1.5 font-medium ${TONE_TEXT[tone]}`}>
        <Icon size={12} aria-hidden="true" className="shrink-0" />
        {label}
      </p>
      <p className="text-zinc-400">{detail}</p>
    </div>
  )
}

/**
 * Lista compacta para quem não está no gerenciador de modelos (o aviso de
 * falha da instalação). Rola sozinha: o aviso é estreito e fica sobre o canvas.
 */
export function CliDiagnosisList({ diagnoses }: { diagnoses: CliDiagnosis[] }) {
  if (diagnoses.length === 0) {
    return <p className="text-[11px] text-zinc-400">Nenhuma CLI para diagnosticar.</p>
  }

  return (
    <ul
      // Região rolável precisa ser alcançável pelo teclado.
      tabIndex={0}
      aria-label="Diagnóstico das CLIs de IA"
      className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-white/8 bg-black/20 p-2 outline-hidden focus-visible:ring-2 focus-visible:ring-white/25"
    >
      {diagnoses.map((diagnosis) => (
        <li key={diagnosis.id}>
          <p className="text-xs font-medium text-slate-100">{diagnosis.name}</p>
          <CliDiagnosisLine diagnosis={diagnosis} />
        </li>
      ))}
    </ul>
  )
}

/**
 * Fecho do diagnóstico: andamento, erro e o texto pronto para o suporte.
 * Não mostra nada enquanto o diagnóstico não foi pedido.
 */
export function CliDiagnosisFooter({ state }: { state: CliDiagnosisState }) {
  const supportText = state.report?.supportText ?? ''

  return (
    <>
      {state.running && !state.report && (
        <p role="status" className="text-[11px] text-zinc-400">
          Diagnosticando as CLIs…
        </p>
      )}
      {state.error && (
        <p role="alert" className="text-[11px] text-theme-error">
          {state.error}
        </p>
      )}
      {supportText && <CopySupportTextButton text={supportText} />}
    </>
  )
}

/**
 * Copia o texto do diagnóstico para colar num pedido de suporte. O texto já
 * sai minimizado do processo principal (sem nome de usuário, URL ou segredo),
 * então nada é filtrado aqui.
 */
export function CopySupportTextButton({ text }: { text: string }) {
  const [feedback, setFeedback] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timerRef = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  async function copy() {
    let next: 'copied' | 'failed' = 'copied'

    try {
      await navigator.clipboard.writeText(text)
    } catch {
      next = 'failed'
    }

    setFeedback(next)
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setFeedback('idle'), COPY_FEEDBACK_MS)
  }

  const label =
    feedback === 'copied'
      ? 'Texto copiado'
      : feedback === 'failed'
        ? 'Não foi possível copiar'
        : 'Copiar texto para o suporte'

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => void copy()}
        title="Copia o diagnóstico, sem nome de usuário nem segredos, para colar num pedido de suporte"
        className="felixo-btn inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/8 px-3 text-xs text-zinc-300 hover:bg-white/8 hover:text-zinc-100"
      >
        {feedback === 'copied' ? (
          <Check size={13} aria-hidden="true" className="text-(--f-core-white-soft)" />
        ) : (
          <Copy size={13} aria-hidden="true" />
        )}
        {label}
      </button>
      {/* O rótulo do botão muda, mas leitor de tela não anuncia isso sozinho. */}
      <span role="status" className="sr-only">
        {feedback === 'idle' ? '' : label}
      </span>
    </div>
  )
}

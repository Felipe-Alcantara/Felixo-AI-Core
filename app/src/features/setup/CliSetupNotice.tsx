import { AlertTriangle, CheckCircle2, Download, Loader2, Stethoscope, X } from 'lucide-react'
import { useCliSetupStatus } from './useCliSetupStatus'
import { useCliDiagnosis } from './useCliDiagnosis'
import { CliDiagnosisFooter, CliDiagnosisList } from './CliDiagnosisView'
import type { CliSetupPresentation } from './cli-setup-presentation'

const TONE_TEXT: Record<CliSetupPresentation['tone'], string> = {
  neutral: 'text-slate-300',
  info: 'text-(--f-core-white-soft)',
  success: 'text-(--f-core-white-soft)',
  error: 'text-theme-error',
}

/**
 * Marcador discreto na barra: diz que as CLIs estão sendo preparadas sem
 * exigir nada de quem só quer usar o app. Vira botão quando a instalação
 * falha — aí existe uma ação a oferecer.
 *
 * O estado mora aqui, e não no canvas, porque nada mais na tela depende dele:
 * subir a assinatura do IPC para o componente-pai faria a árvore inteira
 * redesenhar a cada linha de progresso da instalação.
 */
export function CliSetupIndicator() {
  const { presentation, retry } = useCliSetupStatus()

  if (!presentation.showIndicator) {
    return null
  }

  const busy = presentation.tone === 'info' || presentation.tone === 'neutral'
  const Icon = presentation.canRetry
    ? AlertTriangle
    : presentation.tone === 'success'
      ? CheckCircle2
      : Loader2

  const content = (
    <>
      <Icon size={14} className={busy ? 'animate-spin' : undefined} aria-hidden />
      <span className="truncate">{presentation.indicatorLabel}</span>
    </>
  )

  const shared = `flex items-center gap-1.5 rounded-md px-2 py-1 text-xs ${
    TONE_TEXT[presentation.tone]
  }`

  if (!presentation.canRetry) {
    // Sem ação disponível não é botão: um controle que não faz nada ao ser
    // clicado é pior do que um rótulo honesto, inclusive para leitores de tela.
    return (
      <div className={shared} title={presentation.toastDescription || presentation.indicatorLabel}>
        {content}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={retry}
      className={`${shared} transition hover:bg-white/10`}
      title={`${presentation.toastDescription}\n\nClique para tentar instalar de novo.`}
    >
      {content}
    </button>
  )
}

/**
 * Aviso flutuante sobre a preparação das CLIs. Some quando dispensado e volta
 * quando o resultado chega, porque aí a notícia é outra.
 */
export function CliSetupToast() {
  const { presentation, noticeKey, dismissed, dismiss, retry } = useCliSetupStatus()

  if (!presentation.showToast || dismissed) {
    return null
  }

  const Icon = presentation.canRetry
    ? AlertTriangle
    : presentation.tone === 'success'
      ? CheckCircle2
      : Download

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto fixed bottom-4 right-4 z-50 w-80 rounded-xl border border-white/10 bg-slate-900/95 p-4 shadow-xl backdrop-blur-sm"
    >
      <div className="flex items-start gap-3">
        <Icon
          size={18}
          className={`mt-0.5 shrink-0 ${TONE_TEXT[presentation.tone]}`}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-100">{presentation.toastTitle}</p>
          <p className="mt-1 text-xs text-slate-400">{presentation.toastDescription}</p>

          {presentation.progress !== null && !presentation.canRetry && (
            <div
              className="mt-3 h-1 overflow-hidden rounded-full bg-white/10"
              role="progressbar"
              aria-valuenow={presentation.progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-(--f-core-active) transition-[width] duration-300"
                style={{ width: `${presentation.progress}%` }}
              />
            </div>
          )}

          {presentation.canRetry && (
            // A chave amarra o diagnóstico a esta falha: quando chega outro
            // resultado, o painel remonta vazio em vez de mostrar a fotografia
            // da falha anterior.
            <CliSetupFailureActions key={noticeKey} onRetry={retry} onDismiss={dismiss} />
          )}
        </div>

        <button
          type="button"
          onClick={dismiss}
          className="-mr-1 -mt-1 rounded-md p-1 text-slate-500 transition hover:bg-white/10 hover:text-slate-300"
          aria-label="Dispensar aviso da instalação das CLIs"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}

/**
 * Ações do aviso de falha. "Ver diagnóstico" vem antes de "Tentar de novo":
 * se a CLI está no disco e só não é vista pelo app (PATH, permissão, atalho),
 * reinstalar não resolve, e a pessoa precisa saber disso antes de repetir.
 *
 * O diagnóstico entra ACIMA dos botões: o aviso cresce para cima (está preso
 * ao canto inferior), então os botões não saem de baixo do ponteiro.
 */
function CliSetupFailureActions({
  onRetry,
  onDismiss,
}: {
  onRetry: () => void
  onDismiss: () => void
}) {
  const diagnosis = useCliDiagnosis()
  const { running, report } = diagnosis.state

  return (
    <>
      {diagnosis.active && (
        <div className="mt-3 space-y-2">
          {report && <CliDiagnosisList diagnoses={report.diagnoses} />}
          <CliDiagnosisFooter state={diagnosis.state} />
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {diagnosis.available && (
          <button
            type="button"
            onClick={diagnosis.run}
            disabled={running}
            className="felixo-btn inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {running ? (
              <Loader2 size={13} aria-hidden="true" className="animate-spin" />
            ) : (
              <Stethoscope size={13} aria-hidden="true" />
            )}
            {running ? 'Diagnosticando…' : report ? 'Diagnosticar de novo' : 'Ver diagnóstico'}
          </button>
        )}
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md bg-(--f-core-white)/90 px-3 py-1.5 text-xs font-medium text-slate-950 transition hover:bg-(--f-core-active)"
        >
          Tentar de novo
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-md px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10"
        >
          Depois
        </button>
      </div>
    </>
  )
}

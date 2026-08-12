import { ArrowUpCircle, Loader2, RefreshCw, X } from 'lucide-react'
import type { UpdatePresentation } from './update-presentation'

const TONE_TEXT: Record<UpdatePresentation['tone'], string> = {
  neutral: 'text-slate-300',
  info: 'text-sky-300',
  success: 'text-emerald-300',
  error: 'text-rose-300',
}

type UpdateIndicatorProps = {
  presentation: UpdatePresentation
  onInstall: () => void
  /** Verifica de novo, oferecido quando a última verificação falhou. */
  onRetry: () => void
}

/**
 * Marcador discreto na barra: diz em que pé está a atualização sem exigir
 * nada de quem só quer trabalhar. Quando há uma ação — instalar o que já
 * baixou, ou tentar de novo depois de uma falha — ele próprio vira o botão.
 */
export function UpdateIndicator({
  presentation,
  onInstall,
  onRetry,
}: UpdateIndicatorProps) {
  if (!presentation.showIndicator) {
    return null
  }

  const busy = presentation.progress !== null && !presentation.canInstall
  const Icon = presentation.canInstall ? ArrowUpCircle : busy ? Loader2 : RefreshCw

  const content = (
    <>
      <Icon size={14} className={busy ? 'animate-spin' : undefined} aria-hidden />
      <span className="truncate">{presentation.indicatorLabel}</span>
    </>
  )

  const shared = `flex items-center gap-1.5 rounded-md px-2 py-1 text-xs ${
    TONE_TEXT[presentation.tone]
  }`

  const action = presentation.canInstall
    ? { onClick: onInstall, title: 'Reiniciar agora para aplicar a atualização' }
    : presentation.canRetry
      ? {
          onClick: onRetry,
          // O detalhe do erro continua no title, porque é ele que diz o que
          // deu errado — a nova tentativa entra como convite, não no lugar.
          title: `${presentation.toastDescription || presentation.indicatorLabel}\n\nClique para verificar de novo.`,
        }
      : null

  if (!action) {
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
      onClick={action.onClick}
      className={`${shared} transition hover:bg-white/10`}
      title={action.title}
    >
      {content}
    </button>
  )
}

/**
 * Número da versão instalada, discreto na barra. Some se ainda não chegou
 * (fora do Electron, ou IPC não respondeu ainda) em vez de mostrar um
 * placeholder vazio.
 */
export function AppVersionBadge({ version }: { version: string | null }) {
  if (!version) {
    return null
  }

  return (
    <span
      className="select-text px-1.5 text-xs text-slate-500"
      title="Versão instalada do Felixo AI Core"
    >
      v{version}
    </span>
  )
}

type UpdateToastProps = {
  presentation: UpdatePresentation
  dismissed: boolean
  onDismiss: () => void
  onInstall: () => void
}

/**
 * Aviso flutuante, no canto inferior direito. Some quando dispensado e volta
 * quando a atualização fica pronta, porque aí há uma ação nova a oferecer.
 */
export function UpdateToast({
  presentation,
  dismissed,
  onDismiss,
  onInstall,
}: UpdateToastProps) {
  if (!presentation.showToast || dismissed) {
    return null
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto fixed bottom-4 right-4 z-50 w-80 rounded-xl border border-white/10 bg-slate-900/95 p-4 shadow-xl backdrop-blur"
    >
      <div className="flex items-start gap-3">
        <ArrowUpCircle
          size={18}
          className={`mt-0.5 shrink-0 ${TONE_TEXT[presentation.tone]}`}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-100">{presentation.toastTitle}</p>
          <p className="mt-1 text-xs text-slate-400">{presentation.toastDescription}</p>

          {presentation.progress !== null && !presentation.canInstall && (
            <div
              className="mt-3 h-1 overflow-hidden rounded-full bg-white/10"
              role="progressbar"
              aria-valuenow={presentation.progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-sky-400 transition-[width] duration-300"
                style={{ width: `${presentation.progress}%` }}
              />
            </div>
          )}

          {presentation.canInstall && (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={onInstall}
                className="rounded-md bg-emerald-500/90 px-3 py-1.5 text-xs font-medium text-slate-950 transition hover:bg-emerald-400"
              >
                Reiniciar agora
              </button>
              <button
                type="button"
                onClick={onDismiss}
                className="rounded-md px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10"
              >
                Depois
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onDismiss}
          className="-mr-1 -mt-1 rounded-md p-1 text-slate-500 transition hover:bg-white/10 hover:text-slate-300"
          aria-label="Dispensar aviso de atualização"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}

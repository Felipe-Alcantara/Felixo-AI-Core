import { ArrowUpCircle, Loader2, RefreshCw } from 'lucide-react'
import type { UpdatePresentation } from './update-presentation'

const TONE_TEXT: Record<UpdatePresentation['tone'], string> = {
  neutral: 'text-slate-300',
  info: 'text-[var(--f-core-white-soft)]',
  success: 'text-[var(--f-core-white-soft)]',
  error: 'text-[var(--color-error)]',
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
      className="felixo-version-badge select-text"
      title="Versão instalada do Felixo AI Core"
    >
      v{version}
    </span>
  )
}

/**
 * Botão "Verificar atualizações", visível quando não há nada em andamento
 * (`presentation.canCheck`). Existe porque o app já verifica sozinho a cada
 * dez minutos, mas sem ele a única forma de checar na hora era esperar — o
 * indicador de status fica escondido de propósito quando está tudo em dia.
 */
export function CheckUpdateButton({
  presentation,
  onCheck,
}: {
  presentation: UpdatePresentation
  onCheck: () => void
}) {
  if (!presentation.canCheck) {
    return null
  }

  return (
    <button
      type="button"
      onClick={onCheck}
      className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-slate-500 transition hover:bg-white/10 hover:text-slate-300"
      title="Verificar se há uma atualização disponível agora"
    >
      <RefreshCw size={13} aria-hidden />
      Verificar atualizações
    </button>
  )
}

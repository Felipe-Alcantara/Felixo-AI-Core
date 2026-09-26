import { useId, type KeyboardEvent, type Ref, type SyntheticEvent } from 'react'
import type { NoticeModel } from './onboarding-ui-model'

type Props = {
  model: NoticeModel
  noticeRef?: Ref<HTMLDivElement>
  onView?: () => void
  onDismiss?: () => void
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void
}

const stopAtBoundary = (event: SyntheticEvent) => event.stopPropagation()

/**
 * Aviso de novidade, só apresentação. Não rouba foco (sem `autoFocus`) e não
 * some sozinho (sem timer, WCAG 2.2.1): fica até "Ver", "Agora não", abrir a
 * Ajuda ou Esc com o foco nele. Assim Enter e Espaço continuam indo para o
 * terminal enquanto a pessoa digita.
 */
export function OnboardingNotice({ model, noticeRef, onView, onDismiss, onKeyDown }: Props) {
  const titleId = `${useId()}-titulo`

  return (
    <div
      ref={noticeRef}
      role="region"
      aria-label={model.rotulo}
      aria-describedby={titleId}
      lang={model.lang}
      className="felixo-onboarding-notice nokey"
      data-felixo-popover-surface="true"
      data-felixo-onboarding="aviso"
      onPointerDown={stopAtBoundary}
      onMouseDown={stopAtBoundary}
      onClick={stopAtBoundary}
      onKeyDown={onKeyDown}
    >
      <p id={titleId} className="felixo-onboarding-notice__title">
        {model.titulo}
      </p>
      <div className="felixo-onboarding-notice__actions">
        <button
          type="button"
          className="felixo-onboarding-button felixo-onboarding-button--primary"
          data-felixo-onboarding-action="ver"
          onClick={onView}
        >
          {model.verLabel}
        </button>
        <button
          type="button"
          className="felixo-onboarding-button"
          data-felixo-onboarding-action="agora-nao"
          onClick={onDismiss}
        >
          {model.agoraNaoLabel}
        </button>
      </div>
    </div>
  )
}

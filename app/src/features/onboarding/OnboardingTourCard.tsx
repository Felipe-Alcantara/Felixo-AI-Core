import { useId, type KeyboardEvent, type Ref, type SyntheticEvent } from 'react'
import type { TourCardModel } from './onboarding-ui-model'

type Props = {
  model: TourCardModel
  cardRef?: Ref<HTMLDivElement>
  bodyRef?: Ref<HTMLDivElement>
  onSkip?: () => void
  onBack?: () => void
  onNext?: () => void
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void
  /**
   * Um diálogo modal está por cima: o card inteiro fica `inert` (fora do Tab e da
   * árvore de acessibilidade, sem clique nem tecla), no mesmo passo.
   */
  inert?: boolean
}

/** Clicar no tour não é "clique fora" para flyouts que a pessoa abriu (molde do `FelixoPopoverSurface`). */
const stopAtBoundary = (event: SyntheticEvent) => event.stopPropagation()

/**
 * Card do tutorial, só apresentação: textos, ids e estado dos botões chegam
 * prontos; posição, medição e foco são da camada (`OnboardingTourLayer`), que
 * escreve `top`/`left`/`data-modo` pela ref. Sem portal, sem coordenadas e sem
 * `key` por passo: o card nunca remonta entre passos, então o foco fica nele.
 *
 * Não é modal (`aria-modal="false"`, sem focus trap): o Tab segue para o canvas
 * e o Shift+Tab volta à sidebar. `nokey` impede o React Flow de apagar blocos
 * com Delete/Backspace enquanto o foco está aqui. Sem X nem atalhos de letra ou
 * número (1–4 são do AgentQuestionDialog).
 */
export function OnboardingTourCard({ model, cardRef, bodyRef, onSkip, onBack, onNext, onKeyDown, inert = false }: Props) {
  const id = useId()
  const ids = { tour: `${id}-tour`, title: `${id}-titulo`, counter: `${id}-contador`, body: `${id}-corpo` }

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={`${ids.tour} ${ids.title}`}
      aria-describedby={`${ids.counter} ${ids.body}`}
      lang={model.lang}
      tabIndex={-1}
      inert={inert}
      className="felixo-onboarding-card nokey"
      data-felixo-popover-surface="true"
      data-felixo-onboarding="card"
      data-passo={model.passoId}
      data-ancora={model.ancora ?? undefined}
      data-instancia={model.instancia}
      onPointerDown={stopAtBoundary}
      onMouseDown={stopAtBoundary}
      onClick={stopAtBoundary}
      onKeyDown={onKeyDown}
    >
      <div className="felixo-onboarding-card__header">
        <p id={ids.tour} className="felixo-onboarding-card__tour">
          {model.tourTitle}
        </p>
        <p id={ids.counter} className="felixo-onboarding-card__counter">
          {model.counter}
        </p>
      </div>
      <h2 id={ids.title} className="felixo-onboarding-card__title">
        {model.stepTitle}
      </h2>
      <div ref={bodyRef} id={ids.body} className="felixo-onboarding-card__body">
        {model.body}
      </div>
      {/* Ordem visual igual à de foco: Pular … Voltar, Próximo/Concluir. */}
      <div className="felixo-onboarding-card__footer">
        <button
          type="button"
          className="felixo-onboarding-button"
          data-felixo-onboarding-action="pular"
          onClick={onSkip}
        >
          {model.skipLabel}
        </button>
        <span className="felixo-onboarding-card__spacer" aria-hidden="true" />
        <button
          type="button"
          className="felixo-onboarding-button"
          data-felixo-onboarding-action="voltar"
          // Nunca sai do DOM nem fica `disabled`: o foco não se perde no passo 1.
          aria-disabled={model.isFirst ? 'true' : undefined}
          onClick={model.isFirst ? undefined : onBack}
        >
          {model.backLabel}
        </button>
        <button
          type="button"
          className="felixo-onboarding-button felixo-onboarding-button--primary"
          data-felixo-onboarding-action={model.nextAction}
          onClick={onNext}
        >
          {model.nextLabel}
        </button>
      </div>
    </div>
  )
}

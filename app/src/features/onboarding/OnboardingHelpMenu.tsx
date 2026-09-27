import { useEffect, useId, useLayoutEffect, useRef, useState, type Ref, type RefObject } from 'react'
import { getFocusableElements } from '../canvas/services/keyboard-focus'
import { FelixoPopoverSurface } from '../shared/components/FelixoPopoverSurface'
import { helpMenuKeyAction } from './onboarding-layout'
import type { OnboardingStore } from './onboarding-store'
import { onboardingStore, useOnboardingSnapshot } from './onboarding-store-proxy'
import { describeHelpMenu, type HelpActionModel, type HelpMenuModel } from './onboarding-ui-model'

export type HelpMenuCloseReason = 'escape' | 'tab' | 'fora' | 'acao'

type ContentProps = {
  model: HelpMenuModel
  confirming: boolean
  resetRef?: Ref<HTMLButtonElement>
  cancelRef?: Ref<HTMLButtonElement>
  onAction?: (action: HelpActionModel) => void
  onAskReset?: () => void
  onConfirmReset?: () => void
  onCancelReset?: () => void
}

/**
 * Conteúdo do menu Ajuda, só apresentação (testável sem portal): o tutorial do
 * canvas com o estado e a ação, as novidades e "Redefinir tutoriais" com a
 * confirmação na própria tela, em dois cliques. Nunca `window.confirm`, que
 * trava o renderer e a automação.
 */
export function OnboardingHelpMenuContent({
  model,
  confirming,
  resetRef,
  cancelRef,
  onAction,
  onAskReset,
  onConfirmReset,
  onCancelReset,
}: ContentProps) {
  const id = useId()
  const ids = { tutorial: `${id}-tutorial`, novidades: `${id}-novidades`, pergunta: `${id}-pergunta` }

  const renderActions = (actions: HelpActionModel[], describedBy: string) =>
    actions.length > 0 && (
      <div className="felixo-onboarding-help__actions">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            className="felixo-onboarding-button"
            data-felixo-onboarding-action={action.id}
            aria-describedby={describedBy}
            onClick={() => onAction?.(action)}
          >
            {action.label}
          </button>
        ))}
      </div>
    )

  return (
    <div className="felixo-onboarding-help">
      <section className="felixo-onboarding-help__section" aria-labelledby={ids.tutorial}>
        <h3 id={ids.tutorial} className="felixo-onboarding-help__heading">
          {model.tutorial.titulo}
        </h3>
        {model.tutorial.itens.map((item) => {
          const statusId = `${id}-${item.tourId}-status`
          return (
            <div key={item.tourId} className="felixo-onboarding-help__item" data-felixo-onboarding-status={item.statusKind}>
              <p id={statusId} className="felixo-onboarding-help__status">
                {item.status}
              </p>
              {renderActions(item.actions, `${ids.tutorial} ${statusId}`)}
            </div>
          )
        })}
      </section>

      <section className="felixo-onboarding-help__section" aria-labelledby={ids.novidades}>
        <h3 id={ids.novidades} className="felixo-onboarding-help__heading">
          {model.novidades.titulo}
        </h3>
        {model.novidades.vazio && <p className="felixo-onboarding-help__empty">{model.novidades.vazio}</p>}
        {model.novidades.itens.map((item) => {
          const titleId = `${id}-${item.tourId}-titulo`
          return (
            <div key={item.tourId} className="felixo-onboarding-help__item" data-felixo-onboarding-status={item.statusKind}>
              <p id={titleId} className="felixo-onboarding-help__title">
                {item.titulo}
              </p>
              <p className="felixo-onboarding-help__status">{item.status}</p>
              {renderActions(item.actions, titleId)}
            </div>
          )
        })}
      </section>

      <div className="felixo-onboarding-help__footer">
        {model.semPersistencia && <p className="felixo-onboarding-help__note">{model.semPersistencia}</p>}
        {confirming ? (
          <div className="felixo-onboarding-help__confirm" role="group" aria-labelledby={ids.pergunta}>
            <p id={ids.pergunta} className="felixo-onboarding-help__question">
              {model.redefinir.pergunta}
            </p>
            <div className="felixo-onboarding-help__actions">
              <button
                type="button"
                className="felixo-onboarding-button felixo-onboarding-button--primary"
                data-felixo-onboarding-action="confirmar-redefinir"
                onClick={onConfirmReset}
              >
                {model.redefinir.confirmar}
              </button>
              <button
                ref={cancelRef}
                type="button"
                className="felixo-onboarding-button"
                data-felixo-onboarding-action="cancelar-redefinir"
                onClick={onCancelReset}
              >
                {model.redefinir.cancelar}
              </button>
            </div>
          </div>
        ) : (
          <button
            ref={resetRef}
            type="button"
            className="felixo-onboarding-button"
            data-felixo-onboarding-action="redefinir"
            onClick={onAskReset}
          >
            {model.redefinir.label}
          </button>
        )}
      </div>
    </div>
  )
}

type Props = {
  id: string
  triggerRef: RefObject<HTMLButtonElement | null>
  onClose: (reason: HelpMenuCloseReason) => void
  store?: OnboardingStore
}

const VIEWPORT_GAP = 8

/**
 * Menu Ajuda (chunk preguiçoso): `FelixoPopoverSurface` ao lado do botão do rail,
 * com `role="group"`, `nokey` e o `lang` do catálogo usado. Esc com o foco no
 * menu, Tab para fora dele (`helpMenuKeyAction`) e clique fora fecham e devolvem
 * o foco ao botão. Abrir um tour fecha o menu primeiro e abre no quadro seguinte,
 * com o foco já de volta no botão Ajuda: é para lá que ele volta quando o tour
 * terminar.
 */
export function OnboardingHelpMenu({ id, triggerRef, onClose, store = onboardingStore }: Props) {
  const snapshot = useOnboardingSnapshot(store)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const resetRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const [confirming, setConfirming] = useState(false)
  // O idioma é o do documento na abertura do menu (não muda enquanto ele está aberto).
  const [lang] = useState(() => (typeof document === 'undefined' ? 'pt-BR' : document.documentElement.lang || 'pt-BR'))
  const model = describeHelpMenu({ ajuda: snapshot.ajuda, persistencia: snapshot.persistencia, lang })

  // Posição escrita pela ref, sem re-render: à direita do botão, contida na janela.
  useLayoutEffect(() => {
    const surface = surfaceRef.current
    if (!surface) return undefined
    const place = () => {
      const trigger = triggerRef.current
      if (!trigger) return
      const anchor = trigger.getBoundingClientRect()
      const box = surface.getBoundingClientRect()
      const left = Math.max(VIEWPORT_GAP, Math.min(anchor.right + VIEWPORT_GAP, window.innerWidth - box.width - VIEWPORT_GAP))
      const top = Math.max(VIEWPORT_GAP, Math.min(anchor.top, window.innerHeight - box.height - VIEWPORT_GAP))
      surface.style.left = `${left}px`
      surface.style.top = `${top}px`
      surface.style.maxHeight = `${Math.max(0, window.innerHeight - VIEWPORT_GAP * 2)}px`
      surface.dataset.posicionado = 'true'
    }
    place()
    const resize = new ResizeObserver(place)
    resize.observe(surface)
    window.addEventListener('resize', place)
    return () => {
      resize.disconnect()
      window.removeEventListener('resize', place)
    }
  }, [triggerRef])

  // Ao abrir, o foco entra no menu (ação da pessoa): a primeira ação disponível.
  useEffect(() => {
    surfaceRef.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    const inside = (target: EventTarget | null) =>
      target instanceof Node &&
      (Boolean(surfaceRef.current?.contains(target)) || Boolean(triggerRef.current?.contains(target)))
    const onKeyDown = (event: KeyboardEvent) => {
      const surface = surfaceRef.current
      const action = helpMenuKeyAction({
        key: event.key,
        shiftKey: event.shiftKey,
        defaultPrevented: event.defaultPrevented,
        inScope: inside(event.target),
        focusables: event.key === 'Tab' && surface ? getFocusableElements(surface) : [],
        active: document.activeElement instanceof HTMLElement ? document.activeElement : null,
      })
      if (!action) return
      event.preventDefault()
      event.stopPropagation()
      onClose(action)
    }
    const onMouseDown = (event: MouseEvent) => {
      if (!inside(event.target)) onClose('fora')
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onMouseDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onMouseDown)
    }
  }, [onClose, triggerRef])

  const openTour = (action: HelpActionModel) => {
    onClose('acao')
    window.requestAnimationFrame(() => store.open(action.tourId, 'ajuda', { stepId: action.stepId }))
  }

  const askReset = () => {
    setConfirming(true)
    window.requestAnimationFrame(() => cancelRef.current?.focus())
  }

  const cancelReset = () => {
    setConfirming(false)
    window.requestAnimationFrame(() => resetRef.current?.focus())
  }

  const confirmReset = () => {
    onClose('acao')
    window.requestAnimationFrame(() => store.reset())
  }

  return (
    <FelixoPopoverSurface
      surfaceRef={surfaceRef}
      id={id}
      role="group"
      ariaLabel={model.rotulo}
      lang={model.lang}
      className="felixo-onboarding-help-menu nokey"
    >
      <OnboardingHelpMenuContent
        model={model}
        confirming={confirming}
        resetRef={resetRef}
        cancelRef={cancelRef}
        onAction={openTour}
        onAskReset={askReset}
        onConfirmReset={confirmReset}
        onCancelReset={cancelReset}
      />
    </FelixoPopoverSurface>
  )
}

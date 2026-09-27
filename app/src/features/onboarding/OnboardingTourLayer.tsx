import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { ONBOARDING_ANCHORS, type StepTarget } from './onboarding-catalog'
import {
  LAYOUT_MARGIN,
  NOT_YIELDED,
  SIDEBAR_SCROLL_GATE_INITIAL,
  canRevealInSidebar,
  computeCardPlacement,
  computeRingRect,
  computeSidebarReveal,
  decideFocusOnOpen,
  enterSidebarScrollStep,
  focusHoldOnYield,
  hasOpenModal,
  isCompactViewport,
  nextModalYield,
  noteSidebarScrollEvent,
  noteTourSidebarScroll,
  resolveFocusAfterModal,
  resolveReturnFocus,
  resolveStepTarget,
  toRect,
  type ModalYield,
  type SidebarScrollGate,
  type TargetEnv,
  type TargetResolution,
} from './onboarding-layout'
import type { NoticeSession, OnboardingStore, TourSession } from './onboarding-store'
import { useOnboardingSnapshot } from './onboarding-store-proxy'
import {
  describeNotice,
  describeNoticeAnnouncement,
  describeTourAnnouncement,
  describeTourCard,
  type TourAnnouncementKind,
} from './onboarding-ui-model'
import { OnboardingFocusHold } from './OnboardingFocusHold'
import { OnboardingNotice } from './OnboardingNotice'
import { OnboardingTourCard } from './OnboardingTourCard'

/**
 * Casca do tutorial: mede, posiciona, observa e cuida do teclado e do foco.
 * Os textos vêm de `onboarding-ui-model.ts`, o desenho dos componentes
 * apresentacionais e as regras de geometria e foco de `onboarding-layout.ts`.
 *
 * Posição sem re-render: `top`, `left`, `width`, `max-height` e `data-modo` são
 * escritos pela ref dentro do callback de layout (molde do FelixoSelect, sem
 * `setState` por quadro). O React só re-renderiza em troca de passo ou de alvo.
 * O card nasce invisível (CSS sem `data-modo`) e é medido e posicionado no mesmo
 * quadro, sem piscar.
 *
 * Recálculo (no máximo um rAF por quadro, só com tour ou aviso na tela):
 * `resize` (o zoom também dispara), `scroll` da sidebar ou de qualquer ancestral
 * dos candidatos (um contêiner sem barra de rolagem, rolado pelo foco, move o
 * alvo sem mudar o tamanho de nada), `ResizeObserver` nos candidatos e no card,
 * fim de transição/animação da sidebar e do inspector, `MutationObserver` de
 * estrutura só na sidebar e de atributos nos candidatos e seus ancestrais até a
 * região do canvas, e uma conferência a cada meio segundo só enquanto o tour
 * aponta uma alternativa ao alvo preferido. Nunca há observador no body nem na
 * dock, onde a saída do xterm muta o DOM sem parar.
 *
 * O tour nunca clica, foca, expande nem rola nada além do contêiner da sidebar:
 * só destaca (anel) e explica (card). E rola a sidebar só até a pessoa rolar:
 * a partir daí, naquele passo, a rolagem é dela (`SidebarScrollGate`), o alvo
 * pode ficar recortado ou fora de vista e o anel mostra só a parte visível.
 *
 * Um diálogo modal por cima (a pergunta de um agente, a passagem de
 * responsabilidade) deixa o card e o aviso inertes até fechar, no mesmo passo,
 * com o foco que era deles num ponto de espera neutro (`useYieldToModal`).
 */

const SIDEBAR_SCROLL_SELECTOR = '.felixo-sidebar-scroll'
const SIDEBAR_REGION_SELECTOR = '[data-felixo-region="sidebar"]'
const CANVAS_REGION_SELECTOR = '[data-felixo-region="canvas"]'
const HELP_TRIGGER_SELECTOR = '[data-felixo-help-trigger]'
const OBSTACLE_SELECTOR = '[data-felixo-tour-avoid], [data-canvas-layout-warning]'
const ANIMATED_CHROME_SELECTOR = '.felixo-workbench-sidebar, .felixo-elements-inspector'
const OBSERVED_ATTRIBUTES = ['class', 'inert', 'aria-hidden', 'hidden', 'style']
const OWN_SURFACES_SELECTOR = '[data-felixo-onboarding="card"], [data-felixo-onboarding="aviso"]'
/**
 * Com o alvo preferido fora de alcance, o tour aponta uma alternativa (o menu do
 * canvas, por exemplo). Algo que só cobriu ou deslocou o preferido por um
 * instante (um contêiner rolado pelo foco, um overlay saindo) pode sumir sem
 * disparar nenhum dos gatilhos; então, só nesse estado, a posição é conferida
 * de novo a cada meio segundo. No alvo preferido não há verificação periódica.
 */
const FALLBACK_RECHECK_MS = 500

/** O aviso de novidade fica ao lado da Ajuda. */
const NOTICE_TARGETS: readonly StepTarget[] = Object.freeze([
  { anchor: 'rail-ajuda', body: 'passo.ajuda-novidade.corpo', label: 'Ajuda', side: 'direita' },
])

/**
 * `elementFromPoint` que olha através do card e do aviso. Sem isto a resolução
 * dependia de onde o próprio card estava: ancorado ao lado do alvo A, ele cobria
 * o alvo B e o fazia passar ("superfície do próprio tour"); ancorado em B, ele
 * saía de cima, B era rejeitado e o alvo voltava para A. Com a sidebar abrindo
 * no meio de um passo, isso virava um laço síncrono de `retarget` (React:
 * "Maximum update depth exceeded") e o boundary derrubava o tour. O anel já é
 * `pointer-events: none`; as superfícies ficam assim só durante a leitura.
 */
function hitTestBehindTour(x: number, y: number): Element | null {
  const surfaces = Array.from(document.querySelectorAll<HTMLElement>(OWN_SURFACES_SELECTOR))
  const previous = surfaces.map((surface) => surface.style.pointerEvents)
  for (const surface of surfaces) surface.style.pointerEvents = 'none'
  try {
    return document.elementFromPoint(x, y)
  } finally {
    surfaces.forEach((surface, index) => {
      surface.style.pointerEvents = previous[index]
    })
  }
}

function domTargetEnv(): TargetEnv {
  return {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    query: (selector) => document.querySelector<HTMLElement>(selector),
    style: (node) => {
      const style = getComputedStyle(node as unknown as Element)
      return { visibility: style.visibility, opacity: style.opacity }
    },
    scrollContainer: document.querySelector<HTMLElement>(SIDEBAR_SCROLL_SELECTOR),
    elementFromPoint: hitTestBehindTour,
  }
}

function readObstacles() {
  return Array.from(document.querySelectorAll(OBSTACLE_SELECTOR), (element) =>
    toRect(element.getBoundingClientRect()),
  ).filter((rect) => rect.width > 0 && rect.height > 0)
}

/**
 * Se o tour ainda pode rolar a sidebar neste passo (a pessoa não rolou) e o que
 * ele escreveu, para o evento `scroll` desse valor não contar como da pessoa.
 */
type SidebarReveal = { allowed: boolean; onTourScroll: (scrollTop: number) => void }

/** Resolve o alvo e escreve a posição do card (ou aviso) e do anel direto no DOM. */
function placeSurface(
  surface: HTMLElement,
  ring: HTMLElement | null,
  targets: readonly StepTarget[],
  reveal: SidebarReveal,
) {
  let env = domTargetEnv()
  let resolution = resolveStepTarget({ targets }, env)
  const scroller = env.scrollContainer as HTMLElement | null
  // Depois que a pessoa rola a sidebar, o alvo fica recortado ou fora de vista
  // (o anel mostra só a parte visível) em vez de a rolagem dela ser desfeita.
  if (resolution?.needsReveal && scroller && reveal.allowed) {
    const next = computeSidebarReveal({
      target: resolution.rect,
      container: toRect(scroller.getBoundingClientRect()),
      scrollTop: scroller.scrollTop,
    })
    // Instantâneo e só neste contêiner: nunca scrollIntoView (arrasta o shell).
    if (next !== null && Math.abs(next - scroller.scrollTop) > 0.5) {
      scroller.scrollTop = next
      // Lido de volta: o navegador limita ao máximo rolável.
      reveal.onTourScroll(scroller.scrollTop)
    }
    env = domTargetEnv()
    resolution = resolveStepTarget({ targets }, env)
  }

  const viewport = env.viewport
  surface.style.width = isCompactViewport(viewport) ? `${Math.max(0, viewport.width - LAYOUT_MARGIN * 2)}px` : ''
  surface.style.maxHeight = ''
  const natural = surface.getBoundingClientRect()
  const input = {
    viewport,
    target: resolution?.rect ?? null,
    card: { width: natural.width, height: natural.height },
    preferredSide: resolution?.target.side,
    obstacles: readObstacles(),
  }
  let placement = computeCardPlacement(input)
  if (placement.mode === 'folha' && Math.abs(placement.width - natural.width) > 0.5) {
    // A folha tem outra largura: o texto reflui e a altura muda; mede de novo.
    surface.style.width = `${placement.width}px`
    placement = computeCardPlacement({
      ...input,
      card: { width: placement.width, height: surface.getBoundingClientRect().height },
    })
  }
  surface.style.top = `${placement.top}px`
  surface.style.left = `${placement.left}px`
  surface.style.width = `${placement.width}px`
  surface.style.maxHeight = `${placement.maxHeight}px`
  surface.dataset.modo = placement.mode
  surface.dataset.lado = placement.side

  if (ring) {
    const rect = resolution ? computeRingRect(resolution.rect, viewport, resolution.clip) : null
    if (rect) {
      ring.style.top = `${rect.top}px`
      ring.style.left = `${rect.left}px`
      ring.style.width = `${rect.width}px`
      ring.style.height = `${rect.height}px`
      ring.dataset.visivel = 'true'
    } else {
      delete ring.dataset.visivel
    }
  }
  return resolution
}

type PlacementOptions = {
  surfaceRef: RefObject<HTMLDivElement | null>
  ringRef?: RefObject<HTMLDivElement | null>
  targets: readonly StepTarget[]
  /** Muda quando o que se observa muda (instância, passo, alvo): os observadores são refeitos. */
  trackKey: string
  /**
   * O passo mostrado (instância e índice, nunca o alvo). A cada passo novo o tour
   * volta a poder rolar a sidebar até o alvo; dentro do passo, só até a pessoa rolar.
   */
  revealKey: string
  onPlaced?: (resolution: TargetResolution | null) => void
}

function useSurfacePlacement({ surfaceRef, ringRef, targets, trackKey, revealKey, onPlaced }: PlacementOptions) {
  const scrollGate = useRef<SidebarScrollGate>(SIDEBAR_SCROLL_GATE_INITIAL)

  /** Posiciona e diz se ficou numa alternativa (ou sem alvo) em vez do alvo preferido. */
  const layout = useEffectEvent((): boolean => {
    const surface = surfaceRef.current
    if (!surface) return false
    scrollGate.current = enterSidebarScrollStep(scrollGate.current, revealKey)
    // Fora da chamada opcional: `onPlaced?.(placeSurface(...))` nem avaliaria o
    // argumento sem `onPlaced`, e o aviso (que não passa callback) nunca era posicionado.
    const resolution = placeSurface(surface, ringRef?.current ?? null, targets, {
      allowed: canRevealInSidebar(scrollGate.current),
      onTourScroll: (scrollTop) => {
        scrollGate.current = noteTourSidebarScroll(scrollGate.current, scrollTop)
      },
    })
    onPlaced?.(resolution)
    return targets.length > 0 && resolution?.anchor !== targets[0].anchor
  })
  const candidates = useEffectEvent(() =>
    targets
      .map((target) => document.querySelector<HTMLElement>(ONBOARDING_ANCHORS[target.anchor]))
      .filter((element): element is HTMLElement => element !== null),
  )

  useLayoutEffect(() => {
    let onFallback = layout()

    let frame = 0
    const schedule = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        onFallback = layout()
      })
    }
    const recheck = window.setInterval(() => {
      if (onFallback) schedule()
    }, FALLBACK_RECHECK_MS)
    const elements = candidates()
    const region = document.querySelector(CANVAS_REGION_SELECTOR)

    const resize = new ResizeObserver(schedule)
    elements.forEach((element) => resize.observe(element))
    if (surfaceRef.current) resize.observe(surfaceRef.current)

    const structure = new MutationObserver(schedule)
    const sidebar = document.querySelector(SIDEBAR_REGION_SELECTOR)
    if (sidebar) structure.observe(sidebar, { childList: true, subtree: true })

    const attributes = new MutationObserver(schedule)
    for (const element of elements) {
      for (let node: Element | null = element; node && node !== region && node !== document.body; node = node.parentElement) {
        attributes.observe(node, { attributes: true, attributeFilter: OBSERVED_ATTRIBUTES })
      }
    }

    const onChromeMotionEnd = (event: Event) => {
      if (event.target instanceof Element && event.target.closest(ANIMATED_CHROME_SELECTOR)) schedule()
    }
    // Abrir a gaveta do terminal rola o shell (sem barra de rolagem) de lado por um
    // instante: o alvo muda de lugar sem mudar de tamanho, e nenhum observador
    // acima dispara. Só rolagens que movem um candidato contam (a do xterm, não).
    // A rolagem da sidebar também diz quem a fez: o eco da do tour ou a da pessoa,
    // que tira do tour o direito de rolar até o fim do passo.
    const onScroll = (event: Event) => {
      const target = event.target
      if (target instanceof Element && target.matches(SIDEBAR_SCROLL_SELECTOR)) {
        scrollGate.current = noteSidebarScrollEvent(scrollGate.current, target.scrollTop)
        schedule()
      } else if (target === document) schedule()
      else if (target instanceof Node && elements.some((element) => target.contains(element))) schedule()
    }
    window.addEventListener('resize', schedule)
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    document.addEventListener('transitionend', onChromeMotionEnd, true)
    document.addEventListener('animationend', onChromeMotionEnd, true)

    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      window.clearInterval(recheck)
      resize.disconnect()
      structure.disconnect()
      attributes.disconnect()
      window.removeEventListener('resize', schedule)
      document.removeEventListener('scroll', onScroll, true)
      document.removeEventListener('transitionend', onChromeMotionEnd, true)
      document.removeEventListener('animationend', onChromeMotionEnd, true)
    }
  }, [surfaceRef, trackKey])
}

/**
 * Com que frequência o tour confere se um diálogo modal abriu ou fechou. Nenhum
 * evento avisa que um diálogo montou, e observar mutações no body está fora de
 * questão (a saída do xterm muta o DOM sem parar); um `querySelector` a cada
 * quarto de segundo, só com o tour ou o aviso na tela, custa quase nada.
 */
const MODAL_CHECK_MS = 250

/**
 * O tour cede a um diálogo modal (AgentQuestionDialog, HandoffDialog): enquanto
 * houver `[aria-modal="true"]` na tela, a superfície fica `inert` (fora do Tab e
 * da árvore de acessibilidade, sem clique nem tecla) e continua no mesmo passo.
 * O AgentQuestionDialog não pega o foco e escuta o teclado na janela: sem isto o
 * foco ficava num card coberto pelo overlay, o Enter avançava o tour por baixo e
 * o Esc de quem achava estar no tour dispensava a pergunta do agente.
 *
 * Confere a cada `MODAL_CHECK_MS` e a cada troca de foco (o HandoffDialog puxa o
 * foco ao abrir). Ao ceder, o foco que estava no tour vai para o ponto de espera
 * (`OnboardingFocusHold`, com `nokey`), antes de a superfície ficar inerte. Nunca
 * para o body: lá Delete e Backspace apagavam o bloco selecionado por baixo do
 * diálogo e `q` trocava o modo do canvas (`focusHoldOnYield`). Quando o diálogo
 * fecha, o foco volta ao controle do tour que o tinha, num quadro depois (o
 * diálogo devolve o foco antes), e só se ninguém o tirou da espera
 * (`resolveFocusAfterModal`).
 */
function useYieldToModal(
  surfaceRef: RefObject<HTMLDivElement | null>,
  holdRef: RefObject<HTMLDivElement | null>,
): boolean {
  const [cedido, setCedido] = useState(false)
  const yieldState = useRef<ModalYield>(NOT_YIELDED)
  const focusToReturn = useRef<unknown>(null)

  const check = useEffectEvent(() => {
    const previous = yieldState.current
    const next = nextModalYield(previous, {
      modalAberto: hasOpenModal(document),
      ativo: document.activeElement,
      superficie: surfaceRef.current,
    })
    if (next === previous) return
    // Antes de focar: o `focusin` da espera chama esta conferência de novo e acha o estado já cedido.
    yieldState.current = next
    focusHoldOnYield(next, holdRef.current)?.focus({ preventScroll: true })
    focusToReturn.current = next.cedido ? null : previous.foco
    setCedido(next.cedido)
  })

  useLayoutEffect(() => {
    const run = () => check()
    run()
    const timer = window.setInterval(run, MODAL_CHECK_MS)
    document.addEventListener('focusin', run, true)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('focusin', run, true)
    }
  }, [])

  // Depois do commit que tirou o `inert`: o card já pode receber o foco.
  useEffect(() => {
    const saved = focusToReturn.current
    if (cedido || saved === null) return undefined
    focusToReturn.current = null
    const frame = window.requestAnimationFrame(() => {
      const target = resolveFocusAfterModal<HTMLElement>({
        saved,
        current: document.activeElement,
        surface: surfaceRef.current,
        hold: holdRef.current,
      })
      target?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [cedido, surfaceRef, holdRef])

  return cedido
}

/**
 * Devolve o foco num rAF, só se ele estava no card (ou aviso) ao fechar e ninguém o
 * levou para outro lugar: o salvo na abertura, a Ajuda ou a região do canvas.
 */
function returnFocusSoon(focusWasInside: boolean, saved: unknown) {
  if (!focusWasInside) return
  window.requestAnimationFrame(() => {
    const target = resolveReturnFocus<HTMLElement>({
      focusWasInside,
      current: document.activeElement,
      saved,
      helpTrigger: document.querySelector<HTMLElement>(HELP_TRIGGER_SELECTOR),
      canvas: document.querySelector<HTMLElement>(CANVAS_REGION_SELECTOR),
    })
    target?.focus({ preventScroll: true })
  })
}

/** Falha de render forçada (só na instância devtools): prova que o canvas continua de pé. */
function ForcedRenderFailure(): never {
  throw new Error('Falha forçada do tutorial do canvas (felixo:onboarding:falha = render).')
}

function TourSurface({ store, tour }: { store: OnboardingStore; tour: TourSession }) {
  const cardRef = useRef<HTMLDivElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const holdRef = useRef<HTMLDivElement>(null)
  const openedInstance = useRef<number | null>(null)
  const shownStep = useRef<{ instancia: number; stepIndex: number } | null>(null)
  const model = describeTourCard(tour)
  const step = tour.passos[tour.stepIndex]

  const announce = (kind: TourAnnouncementKind) => {
    const { texto, lang } = describeTourAnnouncement(kind, tour)
    store.announce(texto, lang)
  }

  useSurfacePlacement({
    surfaceRef: cardRef,
    ringRef,
    targets: step?.targets ?? [],
    trackKey: `${tour.instancia}:${tour.stepIndex}:${tour.ancora ?? ''}`,
    revealKey: `${tour.instancia}:${tour.stepIndex}`,
    onPlaced: (resolution) => {
      const body = bodyRef.current
      // O corpo só entra na ordem de Tab quando transborda (para rolar pelo teclado).
      if (body) {
        if (body.scrollHeight > body.clientHeight + 1) body.tabIndex = 0
        else body.removeAttribute('tabindex')
      }
      if (resolution && resolution.anchor !== tour.ancora) store.retarget(resolution.anchor)
    },
  })
  const cedido = useYieldToModal(cardRef, holdRef)

  // Abertura: depois do posicionamento (efeito declarado antes), para o card já estar visível.
  const onOpened = useEffectEvent(() => {
    if (openedInstance.current === tour.instancia) return
    openedInstance.current = tour.instancia
    const card = cardRef.current
    if (!card) return
    const move = decideFocusOnOpen({
      trigger: tour.trigger,
      foco: tour.foco,
      activeElement: document.activeElement,
      canvasRegion: document.querySelector(CANVAS_REGION_SELECTOR),
    })
    // Com um diálogo modal por cima, o foco é dele (o card está inerte).
    if (hasOpenModal(document)) return
    if (move) {
      // O leitor de tela lê nome e descrição do diálogo; não há anúncio extra.
      card.focus({ preventScroll: true })
      return
    }
    if (tour.trigger === 'retomada') announce('retomado')
    else if (tour.foco === 'mover') announce('aberto-sem-foco')
  })
  useLayoutEffect(() => onOpened(), [tour.instancia])

  const onStepShown = useEffectEvent(() => {
    const previous = shownStep.current
    shownStep.current = { instancia: tour.instancia, stepIndex: tour.stepIndex }
    if (!previous || previous.instancia !== tour.instancia || previous.stepIndex === tour.stepIndex) return
    if (!hasOpenModal(document)) announce('passo')
  })
  useEffect(() => onStepShown(), [tour.instancia, tour.stepIndex])

  const close = (kind: 'botao' | 'esc' | 'concluir') => {
    const focusWasInside = Boolean(cardRef.current?.contains(document.activeElement))
    const saved = store.focusBeforeOpen()
    if (!hasOpenModal(document)) announce(kind === 'concluir' ? 'concluido' : 'fechado')
    if (kind === 'concluir') store.complete()
    else store.skip(kind)
    returnFocusSoon(focusWasInside, saved)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Com um diálogo modal aberto o Esc é dele (AgentQuestionDialog, HandoffDialog).
    if (event.key !== 'Escape' || event.defaultPrevented || hasOpenModal(document)) return
    event.preventDefault()
    event.stopPropagation()
    close('esc')
  }

  // Nos instantes entre o diálogo abrir e o card ficar inerte, um Enter num botão
  // do card ainda chegaria aqui: sob um modal, os botões não fazem nada.
  const skip = () => {
    if (!hasOpenModal(document)) close('botao')
  }
  const back = () => {
    if (!hasOpenModal(document)) store.back()
  }
  const next = () => {
    if (hasOpenModal(document)) return
    if (model?.isLast) close('concluir')
    else store.next()
  }

  return (
    <>
      <OnboardingFocusHold holdRef={holdRef} />
      <div ref={ringRef} className="felixo-onboarding-ring" aria-hidden="true" data-felixo-onboarding="anel" />
      {model && (
        <OnboardingTourCard
          model={model}
          cardRef={cardRef}
          bodyRef={bodyRef}
          onSkip={skip}
          onBack={back}
          onNext={next}
          onKeyDown={onKeyDown}
          inert={cedido}
        />
      )}
      {tour.falhaForcada && <ForcedRenderFailure />}
    </>
  )
}

function NoticeSurface({ store, aviso }: { store: OnboardingStore; aviso: NoticeSession }) {
  const noticeRef = useRef<HTMLDivElement>(null)
  const holdRef = useRef<HTMLDivElement>(null)
  const announced = useRef<string | null>(null)
  const model = describeNotice(aviso)

  useSurfacePlacement({
    surfaceRef: noticeRef,
    targets: NOTICE_TARGETS,
    trackKey: aviso.featureId,
    revealKey: aviso.featureId,
  })
  const cedido = useYieldToModal(noticeRef, holdRef)

  const onShown = useEffectEvent(() => {
    if (announced.current === aviso.featureId) return
    announced.current = aviso.featureId
    if (hasOpenModal(document)) return
    const { texto, lang } = describeNoticeAnnouncement(aviso)
    store.announce(texto, lang)
  })
  useEffect(() => onShown(), [aviso.featureId])

  const dismiss = () => {
    if (hasOpenModal(document)) return
    const focusWasInside = Boolean(noticeRef.current?.contains(document.activeElement))
    const saved = store.focusBeforeOpen()
    store.dismissNotice()
    returnFocusSoon(focusWasInside, saved)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || event.defaultPrevented || hasOpenModal(document)) return
    event.preventDefault()
    event.stopPropagation()
    dismiss()
  }

  return (
    <>
      <OnboardingFocusHold holdRef={holdRef} />
      <OnboardingNotice
        model={model}
        noticeRef={noticeRef}
        onView={() => {
          if (!hasOpenModal(document)) store.viewNotice()
        }}
        onDismiss={dismiss}
        onKeyDown={onKeyDown}
        inert={cedido}
      />
    </>
  )
}

/** Camada do tutorial no canvas: o tour (anel + card) ou o aviso de novidade. */
export function OnboardingTourLayer({ store }: { store: OnboardingStore }) {
  const snapshot = useOnboardingSnapshot(store)
  if (snapshot.tour) return <TourSurface store={store} tour={snapshot.tour} />
  if (snapshot.aviso) return <NoticeSurface store={store} aviso={snapshot.aviso} />
  return null
}

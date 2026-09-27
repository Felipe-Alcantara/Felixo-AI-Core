import { Suspense, lazy, useEffect, useEffectEvent, useRef } from 'react'
import { OnboardingErrorBoundary } from './OnboardingErrorBoundary'
import {
  loadOnboardingUi,
  onboardingStore,
  useOnboardingSnapshot,
  type OnboardingStoreProxy,
} from './onboarding-store-proxy'

/** A interface do tour só é baixada com tour ou aviso na tela (chunk preguiçoso da interface). */
const LazyOnboardingTourLayer = lazy(() =>
  loadOnboardingUi().then((module) => ({ default: module.OnboardingTourLayer })),
)

type Props = {
  /** `hydrated && edgesHydrated`: os alvos existem e "canvas com blocos" já pode ser lido. */
  hydrated: boolean
  nodeCount: number
  /** Tipos de bloco presentes (`"file,terminal"`), ou `null` quando o catálogo não tem gatilho de canvas. */
  nodeTypesKey: string | null
  store?: OnboardingStoreProxy
}

/**
 * Host do tutorial na árvore, logo depois da sidebar do canvas: a ordem de Tab
 * fica sidebar → tour → canvas, e o Shift+Tab volta à sidebar (sem portal no
 * fim do body). Eager e pequeno: só o procurador da store, o boundary e a região
 * live; a store de verdade chega no chunk dela quando o canvas hidrata.
 *
 * A região live existe sempre, vazia desde a montagem do canvas, e carrega a
 * decisão automática em `data-felixo-onboarding-decisao` (o smoke lê a decisão
 * de primeiro boot mesmo com a abertura suprimida). Para uma frase repetida ser
 * lida de novo, a região é esvaziada e o texto entra no quadro seguinte.
 *
 * Toda avaliação automática depende deste componente montado: no chat nada
 * aparece, e ao voltar o canvas remonta e a store retoma sem puxar o foco.
 */
export function OnboardingMount({ hydrated, nodeCount, nodeTypesKey, store = onboardingStore }: Props) {
  const snapshot = useOnboardingSnapshot(store)
  const liveRegionRef = useRef<HTMLDivElement>(null)

  // A store vem num chunk próprio: começa a baixar agora, durante a hidratação, para a
  // decisão do `canvasReady` não esperar o download.
  useEffect(() => store.preload(), [store])

  const reportReady = useEffectEvent(() => store.canvasReady(nodeCount))
  useEffect(() => {
    if (hydrated) reportReady()
  }, [hydrated])

  useEffect(() => () => store.canvasUnmounted(), [store])

  useEffect(() => {
    if (hydrated && nodeTypesKey !== null) store.canvasNodeTypes(nodeTypesKey)
  }, [store, hydrated, nodeTypesKey])

  const anuncio = snapshot.anuncio
  // Ao voltar do chat o canvas remonta: a última frase já foi lida e não se repete.
  const seqAtMount = useRef(anuncio?.seq ?? 0)
  useEffect(() => {
    const region = liveRegionRef.current
    if (!region || !anuncio || anuncio.seq <= seqAtMount.current) return
    region.textContent = ''
    const frame = window.requestAnimationFrame(() => {
      region.textContent = anuncio.texto
    })
    return () => window.cancelAnimationFrame(frame)
  }, [anuncio])

  const visible = snapshot.fase === 'tour' || snapshot.fase === 'aviso'

  return (
    <>
      <div
        ref={liveRegionRef}
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        lang={anuncio?.lang ?? 'pt-BR'}
        data-felixo-onboarding="anuncio"
        data-felixo-onboarding-decisao={snapshot.decisao}
      />
      {visible && (
        <OnboardingErrorBoundary store={store} resetKey={snapshot.tour?.instancia ?? snapshot.aviso?.featureId ?? 0}>
          <Suspense fallback={null}>
            <LazyOnboardingTourLayer store={store} />
          </Suspense>
        </OnboardingErrorBoundary>
      )}
    </>
  )
}

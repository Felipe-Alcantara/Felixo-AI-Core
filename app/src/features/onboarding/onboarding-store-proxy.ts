import { useSyncExternalStore } from 'react'
import type {
  OnboardingLogEntry,
  OnboardingReadResult,
  OnboardingSnapshot,
  OnboardingStore,
} from './onboarding-store'

/**
 * A store do tutorial que o canvas enxerga desde a montagem (chunk do canvas).
 *
 * É só um procurador. A autoridade continua sendo a store de `onboarding-store.ts`
 * (leitura, decisão automática, escritas com compare-and-set, sessão), que vem
 * num chunk preguiçoso com a state machine e o catálogo; o chunk do canvas fica
 * só com este módulo. O procurador:
 * - começa a baixar o chunk da store quando o canvas monta (`preload`), durante
 *   a hidratação e depois do primeiro desenho; quando o canvas hidrata, começa a
 *   ler o estado pelo IPC (como antes), e se o chunk ainda não chegou a store
 *   recebe essa mesma leitura: a primeira decisão espera o mais lento dos dois,
 *   não a soma;
 * - guarda as chamadas feitas antes de a store chegar e as repassa na mesma
 *   ordem, então a store vê exatamente a sequência que veria se estivesse ali;
 * - espelha o snapshot da store (o badge da Ajuda e a região live leem daqui).
 *
 * Antes de a store chegar nada abre: o snapshot é o inicial ("carregando").
 * Se o chunk não carregar, o tutorial fica desativado na sessão e o canvas
 * segue de pé, como numa falha de render da camada.
 */

type StoreCall = (store: OnboardingStore) => void

export type OnboardingStoreProxyDeps = {
  /** Importa o chunk da store e cria a store da janela com a leitura dada. */
  loadStore: (read: (() => Promise<OnboardingReadResult>) | null) => Promise<OnboardingStore>
  /** Leitura do estado pela ponte; `null` sem ponte (dev:web, bancada de bundle, testes). */
  read: (() => Promise<OnboardingReadResult>) | null
  log?: (entry: OnboardingLogEntry) => void
}

export type OnboardingStoreProxy = OnboardingStore & {
  /** Começa a baixar o chunk da store sem ler nem decidir nada (o canvas montou). */
  preload(): void
  /** Resolve com a store real ligada; rejeita se o chunk dela não carregou. */
  ready(): Promise<void>
}

/** Snapshot enquanto a store não chega: igual ao inicial da store, sem entradas na Ajuda. */
const INITIAL_SNAPSHOT: OnboardingSnapshot = Object.freeze({
  fase: 'carregando',
  tour: null,
  aviso: null,
  persistencia: 'carregando',
  automacao: Object.freeze({ autoOpen: false, reason: 'carregando' }),
  decisao: 'carregando',
  ajuda: Object.freeze([]),
  novidades: 0,
  anuncio: null,
})

function describeError(error: unknown) {
  return error instanceof Error ? { message: error.message, stack: error.stack ?? null } : { message: String(error) }
}

export function createOnboardingStoreProxy(deps: OnboardingStoreProxyDeps): OnboardingStoreProxy {
  const listeners = new Set<() => void>()
  let store: OnboardingStore | null = null
  let loading: Promise<OnboardingStore | null> | null = null
  let failed = false
  let pending: StoreCall[] = []
  let fallback = INITIAL_SNAPSHOT
  /** Leitura começada no `canvasReady`, entregue à primeira leitura da store. */
  let prefetched: Promise<OnboardingReadResult> | null = null

  const emit = () => listeners.forEach((listener) => listener())

  function log(entry: OnboardingLogEntry) {
    try {
      deps.log?.(entry)
    } catch {
      // O log é melhor esforço; nunca derruba o canvas.
    }
  }

  /** Tutorial desativado na sessão sem a store (o chunk dela não carregou, ou falhou antes de ser pedido). */
  function disable(message: string, details: unknown, decisao = fallback.decisao) {
    failed = true
    pending = []
    fallback = Object.freeze({ ...fallback, fase: 'desativado', tour: null, aviso: null, decisao })
    log({ level: 'error', message, details })
    emit()
  }

  const read = deps.read
  const storeRead = read
    ? () => {
        const promise = prefetched ?? read()
        prefetched = null
        return promise
      }
    : null

  function ensureStore(): Promise<OnboardingStore | null> {
    if (loading) return loading
    loading = deps.loadStore(storeRead).then(
      (created) => {
        store = created
        created.subscribe(emit)
        const queued = pending
        pending = []
        queued.forEach((call) => call(created))
        emit()
        return created
      },
      (error: unknown) => {
        disable('O tutorial do canvas não carregou e foi desativado nesta sessão.', describeError(error), 'indisponivel')
        return null
      },
    )
    return loading
  }

  /** Repassa já, ou guarda até a store chegar; `load` também começa a baixá-la. */
  function forward(call: StoreCall, options: { load?: boolean } = {}) {
    if (store) {
      call(store)
      return
    }
    if (failed) return
    pending.push(call)
    if (options.load) void ensureStore()
  }

  return {
    getSnapshot: () => store?.getSnapshot() ?? fallback,
    getServerSnapshot: () => INITIAL_SNAPSHOT,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    async load() {
      const created = await ensureStore()
      await created?.load()
    },
    canvasReady(...args: Parameters<OnboardingStore['canvasReady']>) {
      if (!store && !failed && read && !prefetched) {
        prefetched = read()
        // Quem trata o resultado é a store; aqui só não deixa a rejeição solta.
        prefetched.catch(() => undefined)
      }
      forward((target) => target.canvasReady(...args), { load: true })
    },
    canvasUnmounted: () => forward((target) => target.canvasUnmounted()),
    canvasNodeTypes: (...args: Parameters<OnboardingStore['canvasNodeTypes']>) =>
      forward((target) => target.canvasNodeTypes(...args)),
    setCapability: (...args: Parameters<OnboardingStore['setCapability']>) =>
      forward((target) => target.setCapability(...args)),
    open: (...args: Parameters<OnboardingStore['open']>) => forward((target) => target.open(...args), { load: true }),
    next: () => forward((target) => target.next()),
    back: () => forward((target) => target.back()),
    retarget: (...args: Parameters<OnboardingStore['retarget']>) => forward((target) => target.retarget(...args)),
    skip: (...args: Parameters<OnboardingStore['skip']>) => forward((target) => target.skip(...args)),
    complete: () => forward((target) => target.complete()),
    viewNotice: () => forward((target) => target.viewNotice()),
    dismissNotice: () => forward((target) => target.dismissNotice()),
    reset: () => forward((target) => target.reset(), { load: true }),
    reportFailure(...args: Parameters<OnboardingStore['reportFailure']>) {
      // O chunk da store não carregou: a falha já foi registrada e o tutorial está desativado.
      if (failed) return
      // A store está ligada ou a caminho: ela desativa o tutorial e registra a falha (uma vez).
      if (store || loading) {
        forward((target) => target.reportFailure(...args))
        return
      }
      const [error, componentStack] = args
      const failure = describeError(error)
      disable(
        'O tutorial do canvas falhou ao renderizar e foi desativado nesta sessão.',
        componentStack ? { ...failure, componentStack } : failure,
      )
    },
    announce: (...args: Parameters<OnboardingStore['announce']>) => forward((target) => target.announce(...args)),
    focusBeforeOpen: () => store?.focusBeforeOpen() ?? null,
    async settled() {
      await loading
      await store?.settled()
    },
    preload() {
      if (!store && !failed) void ensureStore()
    },
    async ready() {
      const created = await ensureStore()
      if (!created) throw new Error('O tutorial do canvas não carregou.')
    },
  }
}

const browser: Window | undefined = typeof window === 'undefined' ? undefined : window
const bridge = browser?.felixo?.onboarding ?? null

/** A store da janela: o procurador do chunk do canvas diante da store do chunk preguiçoso. */
export const onboardingStore = createOnboardingStoreProxy({
  loadStore: (read) =>
    import('./onboarding-store').then((module) => module.createWindowOnboardingStore(read ? { read } : {})),
  read: bridge ? () => bridge.read() : null,
  log: (entry) => {
    void browser?.felixo?.qaLogger?.log({
      level: entry.level,
      scope: 'renderer:onboarding',
      message: entry.message,
      details: entry.details ?? null,
    })
  },
})

/**
 * A interface do tutorial (chunk preguiçoso), sempre com a store real já ligada:
 * o menu Ajuda e a camada do tour nunca desenham o snapshot provisório.
 */
export function loadOnboardingUi() {
  return Promise.all([onboardingStore.ready(), import('./onboarding-ui-entry')]).then(([, ui]) => ui)
}

export function useOnboardingSnapshot(store: OnboardingStore = onboardingStore): OnboardingSnapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot)
}

/**
 * Só a contagem de novidades (badge da Ajuda): a barra lateral re-renderiza
 * quando o número muda, não a cada passo ou anúncio do tour.
 */
export function useOnboardingNovelties(store: OnboardingStore = onboardingStore): number {
  return useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().novidades,
    () => store.getServerSnapshot().novidades,
  )
}

import { useSyncExternalStore } from 'react'
import { clearFirstBootMarker, getOnboardingBootSignals } from './onboarding-boot-signals'
import {
  defaultOnboardingCatalog,
  type AnchorId,
  type OnboardingCatalog,
  type StepDef,
} from './onboarding-catalog'
import type { MessageKey } from './onboarding-messages'
import { readDevtoolsFault, type OnboardingFault } from './onboarding-devtools'
import {
  EMPTY_CANVAS_OBSERVATION,
  ONBOARDING_MAX_BYTES,
  SESSION_STORAGE_KEY,
  applyOnboardingEvent,
  chooseNovelty,
  countNovelties,
  decideAutomaticOpening,
  describeHelpEntries,
  describeIdleDecision,
  findTour,
  firstUseTour,
  hadPreviousUse,
  hasCanvasTriggers,
  normalizeOnboardingState,
  observeCanvasTypes,
  parseNodeTypesKey,
  parseSessionRecord,
  serializeOnboardingState,
  serializeSessionRecord,
  serializedByteLength,
  visibleSteps,
  type Availability,
  type CanvasObservation,
  type EventContext,
  type HelpEntry,
  type LeituraNormalizada,
  type OnboardingBootSignals,
  type OnboardingEvent,
  type OnboardingState,
  type SessionRecord,
  type TourTrigger,
} from './onboarding-state'

/**
 * Store do tutorial, uma por janela (singleton de módulo, no molde do
 * `openia-image-store.ts`).
 *
 * Orquestra o que a state machine pura não faz: ler o estado pelo IPC, decidir
 * a abertura quando o canvas hidrata, gravar com compare-and-set e reaplicar o
 * evento num conflito, retomar pela sessão depois de um reload e expor um
 * snapshot imutável para `useSyncExternalStore`.
 *
 * Regras de escrita:
 * - Reivindicações (primeiro uso, anúncio de novidade) são pessimistas: o tour
 *   ou o aviso só aparece depois de a escrita ser aplicada. Quem perde a
 *   corrida reaplica o evento sobre o estado da outra instância e vira no-op.
 * - Abrir, pular e concluir são otimistas: a tela muda na hora e a escrita
 *   segue em segundo plano, numa fila (uma escrita pendente nunca trava
 *   Próximo nem Pular).
 * - Próximo, Voltar e a retomada nunca escrevem: o passo vive na sessão.
 * - Sem ponte, com leitura falha ou estado de versão mais nova, tudo segue em
 *   memória e nada é gravado.
 *
 * A store não toca em DOM, rede nem processo: só nas dependências injetadas.
 */

type Bridge = NonNullable<NonNullable<Window['felixo']>['onboarding']>
export type OnboardingReadResult = Awaited<ReturnType<Bridge['read']>>
export type OnboardingWriteResult = Awaited<ReturnType<Bridge['write']>>

export type OnboardingBackend = {
  read: () => Promise<OnboardingReadResult>
  write: (request: { expectedRevision: number; value: unknown }) => Promise<OnboardingWriteResult>
}

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export type OnboardingLogEntry = { level: 'info' | 'warn' | 'error'; message: string; details?: unknown }

export type OnboardingStoreDeps = {
  /** Ponte `window.felixo.onboarding`; `null` sem ponte (dev:web, bancada de bundle, testes). */
  backend: OnboardingBackend | null
  /** sessionStorage da janela, para a retomada depois de um reload. */
  session: () => KeyValueStorage | null | undefined
  now: () => number
  bootSignals: () => OnboardingBootSignals
  clearFirstBootMarker: () => void
  getLocale: () => string
  /** Elemento focado no instante da abertura (a interface devolve o foco a ele). */
  getActiveElement: () => unknown
  catalog?: OnboardingCatalog
  schedule?: (callback: () => void, ms: number) => void
  readFault?: () => OnboardingFault | null
  log?: (entry: OnboardingLogEntry) => void
}

export type OnboardingPhase = 'carregando' | 'ocioso' | 'tour' | 'aviso' | 'desativado'
export type OnboardingPersistence = 'carregando' | 'ok' | 'indisponivel' | 'somente-leitura' | 'sem-ponte'
export type FocusIntent = 'mover' | 'manter'

export type TourSession = {
  tourId: string
  /** Título do tour ("Tutorial do canvas"), rótulo do card para o leitor de tela. */
  titulo: MessageKey
  /** `lang` do documento no instante da abertura; a camada resolve o catálogo de textos sem ler o DOM no render. */
  lang: string
  stepIndex: number
  passos: readonly StepDef[]
  trigger: TourTrigger
  /** `mover`: a interface leva o foco ao card (se puder); `manter`: nunca mexe no foco. */
  foco: FocusIntent
  /** Âncora efetivamente usada no passo atual (`null` até a interface resolver o alvo). */
  ancora: AnchorId | null
  /** Muda a cada abertura, nunca a cada passo: o card não remonta entre passos. */
  instancia: number
  /** Só na instância devtools: a camada falha no render (cenário de falha isolada do smoke). */
  falhaForcada: boolean
}

/** Aviso de novidade na tela; título e `lang` capturados no anúncio, como no tour. */
export type NoticeSession = { featureId: string; tourId: string; titulo: MessageKey; lang: string }

export type OnboardingSnapshot = {
  fase: OnboardingPhase
  tour: TourSession | null
  aviso: NoticeSession | null
  persistencia: OnboardingPersistence
  automacao: { autoOpen: boolean; reason: string }
  /** Exposto em `data-felixo-onboarding-decisao` (ex.: `suprimido:abriria-inicial`). */
  decisao: string
  ajuda: readonly HelpEntry[]
  /** Badge da Ajuda: novidades anunciadas e ainda não vistas. */
  novidades: number
  anuncio: { texto: string; seq: number; lang: string } | null
}

type CommitOutcome = 'aplicado' | 'no-op' | 'memoria' | 'falhou'

/** Prazo da leitura inicial: depois disso a sessão segue sem persistência. */
export const ONBOARDING_READ_TIMEOUT_MS = 4_000
const MAX_COMMIT_ATTEMPTS = 3

function safeGet(storage: KeyValueStorage | null | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null
  } catch {
    return null
  }
}

function safeSet(storage: KeyValueStorage | null | undefined, key: string, value: string | null): void {
  try {
    if (value === null) storage?.removeItem(key)
    else storage?.setItem(key, value)
  } catch {
    // Sem sessionStorage a retomada depois de um reload não acontece; nada mais muda.
  }
}

function initialSnapshot(catalog: OnboardingCatalog): OnboardingSnapshot {
  const ajuda = describeHelpEntries(null, { catalog, live: null, availability: () => 'desconhecido' })
  return Object.freeze({
    fase: 'carregando',
    tour: null,
    aviso: null,
    persistencia: 'carregando',
    automacao: { autoOpen: false, reason: 'carregando' },
    decisao: 'carregando',
    ajuda,
    novidades: countNovelties(ajuda),
    anuncio: null,
  })
}

/** Snapshot constante para `getServerSnapshot` (nada abre fora do navegador). */
const SERVER_SNAPSHOT = initialSnapshot(defaultOnboardingCatalog)

export function createOnboardingStore(deps: OnboardingStoreDeps) {
  const catalog = deps.catalog ?? defaultOnboardingCatalog
  const schedule = deps.schedule ?? ((callback: () => void, ms: number) => void setTimeout(callback, ms))
  const listeners = new Set<() => void>()

  let snapshot = initialSnapshot(catalog)
  /** Último estado conhecido e a revisão em que foi lido ou gravado. */
  let current: { revision: number; state: OnboardingState | null } = { revision: 0, state: null }
  let reading: { leitura: LeituraNormalizada; corrupted: boolean } | null = null
  let appVersion: string | null = null
  let markerCleared = false

  const canvas = { pronto: false, montado: false, nodeCount: 0 }
  let evaluation: 'pendente' | 'rodando' | 'feita' = 'pendente'
  let evaluatingNovelty = false
  let observation: CanvasObservation = EMPTY_CANVAS_OBSERVATION
  const capabilities = new Map<string, Availability>()
  let anchorFallbacks: string[] = []
  let focusBeforeOpen: unknown = null
  let instance = 0
  let announceSeq = 0

  let loadPromise: Promise<void> | null = null
  let writeQueue: Promise<unknown> = Promise.resolve()
  /** Tudo o que ainda está em andamento (leitura, avaliação, escritas); `settled()` espera por isto. */
  let activity: Promise<unknown> = Promise.resolve()

  function track<T>(promise: Promise<T>): Promise<T> {
    activity = Promise.all([activity, promise.catch(() => undefined)])
    return promise
  }

  const availability = (capability: string): Availability => capabilities.get(capability) ?? 'desconhecido'

  function log(entry: OnboardingLogEntry) {
    try {
      deps.log?.(entry)
    } catch {
      // O log é melhor esforço; nunca derruba a store.
    }
  }

  function emit() {
    listeners.forEach((listener) => listener())
  }

  /** Recalcula a Ajuda a partir do estado e da sessão viva, e publica um snapshot novo. */
  function update(patch: Partial<OnboardingSnapshot> = {}) {
    const next = { ...snapshot, ...patch }
    const live = next.tour ? { tourId: next.tour.tourId, stepIndex: next.tour.stepIndex } : null
    const ajuda = describeHelpEntries(current.state, { catalog, live, availability })
    snapshot = Object.freeze({ ...next, ajuda, novidades: countNovelties(ajuda) })
    emit()
  }

  function eventContext(): EventContext {
    return {
      now: deps.now(),
      catalog,
      appVersion,
      locale: deps.getLocale(),
      nodeCount: canvas.pronto ? canvas.nodeCount : null,
      origemPadrao: hadPreviousUse(canvas.nodeCount, deps.bootSignals()) ? 'uso-anterior' : 'primeiro-uso',
    }
  }

  function clearMarkerOnce() {
    if (markerCleared) return
    markerCleared = true
    try {
      deps.clearFirstBootMarker()
    } catch {
      // Sem storage o marcador fica; o SQLite já decide daqui em diante.
    }
  }

  function degrade(reason: string, details?: unknown) {
    if (snapshot.persistencia === 'ok') update({ persistencia: 'indisponivel' })
    log({ level: 'warn', message: `Tutorial sem persistência: ${reason}`, details })
  }

  // -------------------------------------------------------------------------
  // Leitura
  // -------------------------------------------------------------------------

  function readWithTimeout(backend: OnboardingBackend): Promise<OnboardingReadResult | 'timeout' | null> {
    return new Promise((resolve) => {
      let settled = false
      const finish = (value: OnboardingReadResult | 'timeout' | null) => {
        if (settled) return
        settled = true
        resolve(value)
      }
      schedule(() => finish('timeout'), ONBOARDING_READ_TIMEOUT_MS)
      backend.read().then(finish, () => finish(null))
    })
  }

  function load(): Promise<void> {
    if (loadPromise) return loadPromise
    loadPromise = track((async () => {
      const backend = deps.backend
      if (!backend) {
        finishLoad({ persistencia: 'sem-ponte', automacao: { autoOpen: false, reason: 'sem-ponte' } })
        return
      }
      const result = await readWithTimeout(backend)
      if (result === 'timeout' || !result || !result.ok) {
        const reason = result === 'timeout' ? 'timeout' : result ? result.message : 'excecao'
        log({ level: 'warn', message: 'Não foi possível ler o estado do tutorial.', details: { reason } })
        finishLoad({ persistencia: 'indisponivel', automacao: { autoOpen: false, reason: 'indisponivel' } })
        return
      }

      appVersion = result.appVersion
      const leitura = normalizeOnboardingState(result.value, { catalog })
      reading = { leitura, corrupted: result.corrupted }
      current = { revision: result.revision, state: leitura.tipo === 'valido' ? leitura.state : null }
      // Estado em qualquer forma: a partir daqui o SQLite decide, não o marcador.
      if (result.value !== null || result.corrupted) clearMarkerOnce()
      finishLoad({
        persistencia: leitura.tipo === 'futuro' ? 'somente-leitura' : 'ok',
        automacao: { autoOpen: result.automation.autoOpen, reason: result.automation.reason },
      })
    })())
    return loadPromise
  }

  function finishLoad(patch: Pick<OnboardingSnapshot, 'persistencia' | 'automacao'>) {
    // Uma ação da pessoa durante a leitura (abrir pela Ajuda) já tirou a fase de "carregando".
    update({ ...patch, fase: snapshot.fase === 'carregando' ? 'ocioso' : snapshot.fase })
    startEvaluation()
  }

  // -------------------------------------------------------------------------
  // Escrita (fila, compare-and-set e reaplicação do evento)
  // -------------------------------------------------------------------------

  async function runCommit(event: OnboardingEvent): Promise<CommitOutcome> {
    await load()
    for (let attempt = 0; attempt < MAX_COMMIT_ATTEMPTS; attempt++) {
      const next = applyOnboardingEvent(current.state, event, eventContext())
      if (next === current.state || !next) return 'no-op'

      const backend = deps.backend
      if (snapshot.persistencia !== 'ok' || !backend) {
        current = { ...current, state: next }
        update()
        return 'memoria'
      }

      const value = serializeOnboardingState(next)
      if (serializedByteLength(value) > ONBOARDING_MAX_BYTES) {
        current = { ...current, state: next }
        degrade('estado acima de 64 KiB')
        return 'falhou'
      }

      let result: OnboardingWriteResult | null
      try {
        result = await backend.write({ expectedRevision: current.revision, value })
      } catch (error) {
        result = null
        log({ level: 'error', message: 'Falha ao gravar o estado do tutorial.', details: String(error) })
      }
      if (!result || !result.ok) {
        current = { ...current, state: next }
        degrade('escrita recusada', result && !result.ok ? result.message : 'excecao')
        return 'falhou'
      }
      if (result.applied) {
        current = { revision: result.revision, state: next }
        clearMarkerOnce()
        update()
        return 'aplicado'
      }

      // Conflito: outra janela ou processo gravou antes. Adota o estado dela e
      // reaplica o MESMO evento; não existe função de mesclagem.
      const newer = normalizeOnboardingState(result.value, { catalog })
      if (newer.tipo === 'futuro') {
        current = { revision: result.revision, state: next }
        update({ persistencia: 'somente-leitura' })
        return 'memoria'
      }
      current = { revision: result.revision, state: newer.tipo === 'valido' ? newer.state : null }
      update()
    }
    log({ level: 'warn', message: 'Estado do tutorial em disputa; a escrita desistiu depois de 3 conflitos.' })
    return 'falhou'
  }

  function commit(event: OnboardingEvent): Promise<CommitOutcome> {
    const run = () => runCommit(event)
    const result = writeQueue.then(run, run)
    writeQueue = result.catch(() => undefined)
    return track(result)
  }

  // -------------------------------------------------------------------------
  // Sessão (retomada por janela)
  // -------------------------------------------------------------------------

  function saveSession(tour: TourSession, originalTrigger: TourTrigger) {
    safeSet(
      deps.session(),
      SESSION_STORAGE_KEY,
      serializeSessionRecord({ tourId: tour.tourId, stepIndex: tour.stepIndex, trigger: originalTrigger }),
    )
  }

  function clearSession() {
    safeSet(deps.session(), SESSION_STORAGE_KEY, null)
  }

  /** Gatilho original da abertura (o que a sessão grava); a retomada o preserva entre reloads. */
  let sessionTrigger: TourTrigger = 'ajuda'

  function showTour(tourId: string, trigger: TourTrigger, foco: FocusIntent, stepIndex: number, sessionOrigin: TourTrigger) {
    const tour = findTour(catalog, tourId)
    const passos = tour ? visibleSteps(tour, availability) : []
    if (!tour || passos.length === 0) return false
    const next: TourSession = {
      tourId,
      titulo: tour.title,
      lang: deps.getLocale(),
      stepIndex: Math.min(Math.max(0, stepIndex), passos.length - 1),
      passos,
      trigger,
      foco,
      ancora: null,
      instancia: ++instance,
      falhaForcada: deps.readFault?.() === 'render',
    }
    anchorFallbacks = []
    sessionTrigger = sessionOrigin
    saveSession(next, sessionOrigin)
    update({ fase: 'tour', tour: next, aviso: null })
    return true
  }

  // -------------------------------------------------------------------------
  // Decisão automática (uma vez por store, depois da leitura e da hidratação)
  // -------------------------------------------------------------------------

  function startEvaluation() {
    if (evaluation !== 'pendente' || !canvas.pronto || snapshot.persistencia === 'carregando') return
    evaluation = 'rodando'
    void track(
      evaluateOpening().finally(() => {
        evaluation = 'feita'
      }),
    )
  }

  function resume(record: SessionRecord): boolean {
    focusBeforeOpen = null
    return showTour(record.tourId, 'retomada', 'manter', record.stepIndex, record.trigger)
  }

  async function evaluateOpening(): Promise<void> {
    if (snapshot.fase === 'desativado') return
    const record = parseSessionRecord(safeGet(deps.session(), SESSION_STORAGE_KEY), catalog)
    if (record && snapshot.fase !== 'tour' && resume(record)) {
      update({ decisao: 'retomada' })
      return
    }
    if (snapshot.persistencia === 'sem-ponte' || snapshot.persistencia === 'indisponivel' || !reading) {
      update({ decisao: snapshot.persistencia === 'sem-ponte' ? 'sem-ponte' : 'indisponivel' })
      return
    }

    let leitura = reading.leitura
    let corrupted = reading.corrupted
    for (let step = 0; step < 3; step++) {
      const decision = decideAutomaticOpening({
        leitura,
        corrupted,
        nodeCount: canvas.nodeCount,
        sinais: deps.bootSignals(),
        autoOpen: snapshot.automacao.autoOpen,
        availability,
        catalog,
      })

      switch (decision.tipo) {
        case 'nada':
          update({ decisao: describeIdleDecision(decision) })
          return
        case 'recuperar': {
          const outcome = await commit({ tipo: 'RECUPERAR' })
          log({ level: 'warn', message: 'Estado do tutorial inválido; recuperado sem abrir nada.', details: { outcome } })
          update({ decisao: 'recuperado' })
          return
        }
        case 'reivindicar-inicial': {
          const outcome = await commit({ tipo: 'REIVINDICAR_INICIAL' })
          const tour = firstUseTour(catalog)
          const idle = snapshot.fase === 'ocioso' || snapshot.fase === 'carregando'
          if (outcome === 'aplicado' && tour && idle) {
            focusBeforeOpen = deps.getActiveElement()
            showTour(tour.id, 'primeiro-uso', 'mover', 0, 'primeiro-uso')
            update({ decisao: 'aberto' })
          } else {
            // Perdeu a corrida para outra instância (no-op) ou a escrita falhou.
            update({ decisao: outcome === 'falhou' ? 'indisponivel' : 'nada' })
          }
          return
        }
        case 'linha-de-base': {
          const outcome = await commit({ tipo: 'LINHA_DE_BASE' })
          if (outcome !== 'aplicado' && outcome !== 'no-op') {
            update({ decisao: 'indisponivel' })
            return
          }
          // Segue para as novidades sobre o estado recém-gravado (ou o da outra instância).
          if (!current.state) {
            update({ decisao: 'nada' })
            return
          }
          leitura = { tipo: 'valido', state: current.state, reparado: false, migradoDe: null }
          corrupted = false
          continue
        }
        case 'anunciar':
          // Com um tour já na tela (aberto pela Ajuda durante a leitura), a novidade
          // espera: é reavaliada quando o tour fechar.
          if (snapshot.fase !== 'ocioso') {
            update({ decisao: 'nada' })
            return
          }
          await claimNovelty(decision.featureId)
          return
      }
    }
    update({ decisao: 'nada' })
  }

  // -------------------------------------------------------------------------
  // Novidades (uma de cada vez, nunca roubando foco)
  // -------------------------------------------------------------------------

  async function claimNovelty(featureId: string): Promise<void> {
    const feature = catalog.features.find((item) => item.id === featureId)
    if (!feature) return
    const outcome = await commit({ tipo: 'ANUNCIAR', featureId })
    observation = {
      ...observation,
      pendentes: observation.pendentes.filter((id) => !current.state?.knownFeatures.includes(id)),
    }
    if (outcome === 'aplicado' && snapshot.fase === 'ocioso') {
      focusBeforeOpen = deps.getActiveElement()
      update({
        fase: 'aviso',
        aviso: { featureId, tourId: feature.tourId, titulo: feature.title, lang: deps.getLocale() },
        decisao: 'anunciado',
      })
    } else {
      update()
    }
  }

  function evaluateNovelties(): Promise<void> {
    if (
      evaluation !== 'feita' ||
      evaluatingNovelty ||
      !snapshot.automacao.autoOpen ||
      snapshot.persistencia !== 'ok' ||
      !canvas.montado ||
      snapshot.fase !== 'ocioso'
    ) {
      return Promise.resolve()
    }
    const choice = chooseNovelty({
      fase: snapshot.fase,
      state: current.state,
      pendentesCanvas: observation.pendentes,
      availability,
      catalog,
    })
    if (choice.tipo !== 'anunciar') return Promise.resolve()
    evaluatingNovelty = true
    return track(
      claimNovelty(choice.featureId).finally(() => {
        evaluatingNovelty = false
      }),
    )
  }

  // -------------------------------------------------------------------------
  // API: sinais do canvas e do ambiente
  // -------------------------------------------------------------------------

  /** O canvas hidratou (`hydrated && edgesHydrated`). Idempotente: StrictMode e remontagens não reavaliam. */
  function canvasReady(nodeCount: number) {
    canvas.montado = true
    canvas.nodeCount = Number.isInteger(nodeCount) && nodeCount > 0 ? nodeCount : 0
    if (canvas.pronto) {
      // Volta do chat: o tour reaparece no mesmo passo, sem puxar o foco.
      if (snapshot.tour && snapshot.tour.foco !== 'manter') {
        update({ tour: { ...snapshot.tour, foco: 'manter' } })
      }
      void evaluateNovelties()
      return
    }
    canvas.pronto = true
    void load()
    startEvaluation()
  }

  /**
   * O canvas saiu da tela (chat): nenhuma avaliação automática até ele voltar.
   * O tour aberto passa a `foco: 'manter'` já aqui: na volta, a camada remonta
   * antes de o canvas hidratar (antes do `canvasReady`) e puxaria o foco.
   */
  function canvasUnmounted() {
    canvas.montado = false
    if (snapshot.tour && snapshot.tour.foco !== 'manter') {
      update({ tour: { ...snapshot.tour, foco: 'manter' } })
    }
  }

  /** Tipos de bloco presentes (`"file,terminal"`). A hidratação nunca dispara; só a transição ao vivo. */
  function canvasNodeTypes(key: string) {
    if (!hasCanvasTriggers(catalog)) return
    observation = observeCanvasTypes(observation, parseNodeTypesKey(key), {
      pronto: canvas.pronto,
      state: current.state,
      catalog,
    })
    if (observation.pendentes.length > 0) void evaluateNovelties()
  }

  /** Disponibilidade de uma capability neste ambiente (nunca persistida). */
  function setCapability(capability: string, value: Availability) {
    if (capabilities.get(capability) === value) return
    capabilities.set(capability, value)
    update()
    void evaluateNovelties()
  }

  // -------------------------------------------------------------------------
  // API: ações da pessoa
  // -------------------------------------------------------------------------

  /** Abre um tour pela Ajuda ou pelo "Ver" do aviso. Sempre permitido; o foco vai para o card. */
  function open(tourId: string, origem: 'ajuda' | 'novidade', options: { stepId?: string | null } = {}) {
    const tour = findTour(catalog, tourId)
    if (!tour) return
    const passos = visibleSteps(tour, availability)
    const stepIndex = options.stepId ? Math.max(0, passos.findIndex((step) => step.id === options.stepId)) : 0
    focusBeforeOpen = deps.getActiveElement()
    if (!showTour(tourId, origem, 'mover', stepIndex, origem)) return
    void load()
    void commit({ tipo: 'ABRIR', tourId, origem, stepId: passos[stepIndex]?.id ?? null })
  }

  function moveStep(delta: number) {
    const tour = snapshot.tour
    if (!tour) return
    const stepIndex = Math.min(Math.max(0, tour.stepIndex + delta), tour.passos.length - 1)
    if (stepIndex === tour.stepIndex) return
    const next = { ...tour, stepIndex, ancora: null }
    saveSession(next, sessionTrigger)
    update({ tour: next })
  }

  function next() {
    moveStep(1)
  }

  function back() {
    moveStep(-1)
  }

  /** A interface resolveu o alvo do passo; um alvo alternativo fica registrado no próximo commit. */
  function retarget(anchor: AnchorId) {
    const tour = snapshot.tour
    const step = tour?.passos[tour.stepIndex]
    if (!tour || !step || tour.ancora === anchor) return
    if (anchor !== step.targets[0]?.anchor) {
      const fallback = `${step.id}:${anchor}`
      if (!anchorFallbacks.includes(fallback)) anchorFallbacks = [...anchorFallbacks, fallback]
    }
    update({ tour: { ...tour, ancora: anchor } })
  }

  function closeTour(event: (tourId: string, stepId: string | null) => OnboardingEvent) {
    const tour = snapshot.tour
    if (!tour) return
    const stepId = tour.passos[tour.stepIndex]?.id ?? null
    clearSession()
    update({ fase: 'ocioso', tour: null })
    void track(commit(event(tour.tourId, stepId)).then(() => evaluateNovelties()))
  }

  /** Pular tutorial (botão ou Esc). Um tour já concluído continua concluído. */
  function skip(via: 'botao' | 'esc') {
    const fallbacks = anchorFallbacks
    closeTour((tourId, stepId) => ({ tipo: 'PULAR', tourId, via, stepId, anchorFallbacks: fallbacks }))
  }

  function complete() {
    const fallbacks = anchorFallbacks
    closeTour((tourId) => {
      const tour = findTour(catalog, tourId)
      const last = tour ? visibleSteps(tour, availability).at(-1)?.id ?? null : null
      return { tipo: 'CONCLUIR', tourId, stepId: last, anchorFallbacks: fallbacks }
    })
  }

  /** "Ver" no aviso de novidade: abre o mini-tour, com foco (é ação da pessoa). */
  function viewNotice() {
    const aviso = snapshot.aviso
    if (!aviso) return
    open(aviso.tourId, 'novidade')
  }

  /** "Agora não", Esc no aviso ou abrir a Ajuda: a novidade fica "Novo" na Ajuda e não volta sozinha. */
  function dismissNotice() {
    if (!snapshot.aviso) return
    update({ fase: 'ocioso', aviso: null })
    void evaluateNovelties()
  }

  /** Redefinir tutoriais (confirmado na própria Ajuda) e abrir o inicial em seguida. */
  function reset() {
    void commit({ tipo: 'REDEFINIR' })
    const tour = firstUseTour(catalog)
    if (tour) open(tour.id, 'ajuda')
  }

  /** A camada do tutorial falhou no render: desativa na sessão, sem reabertura automática. */
  function reportFailure(error?: unknown, componentStack?: string | null) {
    clearSession()
    update({ fase: 'desativado', tour: null, aviso: null })
    const failure = error instanceof Error ? { message: error.message, stack: error.stack ?? null } : { message: String(error) }
    log({
      level: 'error',
      message: 'O tutorial do canvas falhou ao renderizar e foi desativado nesta sessão.',
      details: componentStack ? { ...failure, componentStack } : failure,
    })
  }

  /**
   * Texto para a região live (a camada formata; o chunk eager não carrega
   * mensagens). `lang` é o do catálogo efetivamente usado, para o leitor de
   * tela pronunciar o texto no idioma certo.
   */
  function announce(texto: string, lang = 'pt-BR') {
    update({ anuncio: { texto, seq: ++announceSeq, lang } })
  }

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => SERVER_SNAPSHOT,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    load,
    canvasReady,
    canvasUnmounted,
    canvasNodeTypes,
    setCapability,
    open,
    next,
    back,
    retarget,
    skip,
    complete,
    viewNotice,
    dismissNotice,
    reset,
    reportFailure,
    announce,
    /** Elemento focado quando o tour ou o aviso abriu; a interface devolve o foco a ele ao fechar. */
    focusBeforeOpen: () => focusBeforeOpen,
    /** Resolve quando leitura, avaliação e escritas pendentes terminaram (testes e smoke). */
    async settled(): Promise<void> {
      for (let round = 0; round < 50; round++) {
        const pending = activity
        await pending
        // Um passo a mais de microtask deixa as continuações encadeadas registrarem trabalho novo.
        await Promise.resolve()
        if (pending === activity) return
      }
    },
  }
}

export type OnboardingStore = ReturnType<typeof createOnboardingStore>

const browser: Window | undefined = typeof window === 'undefined' ? undefined : window

function browserSession(): KeyValueStorage | null {
  try {
    return browser?.sessionStorage ?? null
  } catch {
    return null
  }
}

function browserLocalStorage(): Pick<Storage, 'removeItem'> | null {
  try {
    return browser?.localStorage ?? null
  } catch {
    return null
  }
}

/** A store da janela. Sem `window` (testes) ela nasce sem ponte e sem storage. */
export const onboardingStore = createOnboardingStore({
  backend: browser?.felixo?.onboarding ?? null,
  session: browserSession,
  now: () => Date.now(),
  bootSignals: getOnboardingBootSignals,
  clearFirstBootMarker: () => clearFirstBootMarker(browserLocalStorage()),
  getLocale: () => browser?.document.documentElement.lang || 'pt-BR',
  getActiveElement: () => browser?.document.activeElement ?? null,
  readFault: () => readDevtoolsFault(browser),
  log: (entry) => {
    void browser?.felixo?.qaLogger?.log({
      level: entry.level,
      scope: 'renderer:onboarding',
      message: entry.message,
      details: entry.details ?? null,
    })
  },
})

export function useOnboardingSnapshot(store: OnboardingStore = onboardingStore): OnboardingSnapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot)
}

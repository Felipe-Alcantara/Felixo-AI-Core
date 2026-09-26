import {
  defaultOnboardingCatalog,
  type FeatureDef,
  type OnboardingCatalog,
  type StepDef,
  type TourDef,
} from './onboarding-catalog'
import type { MessageKey } from './onboarding-messages'

/**
 * State machine pura do tutorial e das novidades.
 *
 * Tudo aqui é função pura sobre dados: normalizar o que veio do disco (nunca
 * lança), decidir a abertura automática, aplicar um evento e descrever a Ajuda.
 * Relógio, versão do app, locale e catálogo chegam por parâmetro, então os testes
 * fixam todos eles (aceite T1.e). A store (`onboarding-store.ts`) orquestra o
 * resto: leitura, compare-and-set, sessão e interface.
 *
 * "Visto" é persistido (`seenAt`, `status`, `announcedAt`). "Disponível" é do
 * ambiente, calculado a cada sessão e nunca gravado.
 */

export const ONBOARDING_SCHEMA_VERSION = 1
/** Teto do valor serializado; o processo principal recusa escrita acima disso. */
export const ONBOARDING_MAX_BYTES = 64 * 1024

export type TourStatus = 'disponivel' | 'ativo' | 'dispensado' | 'concluido'
export type TourTrigger = 'primeiro-uso' | 'ajuda' | 'novidade' | 'retomada'
export type OnboardingOrigin = 'primeiro-uso' | 'uso-anterior' | 'recuperado'
export type Availability = 'desconhecido' | 'disponivel' | 'indisponivel'

export type TourContext = {
  appVersion: string | null
  nodeCount: number | null
  locale: string
  anchorFallbacks: readonly string[]
}

export type TourRecord = {
  status: TourStatus
  /** Versão do roteiro na última interação. */
  tourVersion: number
  /** Id do passo na última interação. */
  step: string | null
  /** "Visto" = `seenAt` preenchido. */
  seenAt: string | null
  lastShownAt: string | null
  timesShown: number
  dismissedAt: string | null
  completedAt: string | null
  /** Tours de novidade: quando o aviso foi reivindicado. */
  announcedAt: string | null
  trigger: TourTrigger | null
  context: TourContext
  /** Campos que um build mais novo gravou e este não conhece; regravados intactos. */
  extras: Readonly<Record<string, unknown>>
}

export type OnboardingState = {
  schemaVersion: typeof ONBOARDING_SCHEMA_VERSION
  createdAt: string
  updatedAt: string
  origin: OnboardingOrigin
  /** Versão do produto: só contexto, nunca decide nada. */
  appVersion: { first: string | null; last: string | null }
  /** Maior revisão de catálogo que já gravou; nunca diminui. */
  catalogRevision: number
  /** Ids já anunciados ou assumidos como linha de base; só cresce. */
  knownFeatures: readonly string[]
  resetAt: string | null
  /** Registros dos tours deste catálogo. */
  tours: Readonly<Record<string, TourRecord>>
  /** Tours de ids fora deste catálogo (build mais novo), guardados crus. */
  toursDesconhecidos: Readonly<Record<string, unknown>>
  /** Chaves de topo desconhecidas, regravadas intactas. */
  extras: Readonly<Record<string, unknown>>
}

export type MigrationTable = Readonly<Record<number, (raw: Record<string, unknown>) => unknown>>

/** Migrações de schema: `MIGRATIONS[v]` leva um valor da versão v para v+1. Vazio na v1. */
export const MIGRATIONS: MigrationTable = Object.freeze({})

export type LeituraNormalizada =
  | { tipo: 'ausente' }
  | { tipo: 'valido'; state: OnboardingState; reparado: boolean; migradoDe: number | null }
  | { tipo: 'futuro'; schemaVersion: number }
  | { tipo: 'invalido'; motivo: string }

type NormalizeOptions = {
  catalog?: OnboardingCatalog
  migrations?: MigrationTable
}

const EPOCH_ISO = '1970-01-01T00:00:00.000Z'
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/
const FEATURE_ID_PATTERN = /^feature\.[a-z][a-z0-9-]*$/
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
const TOP_LEVEL_KEYS = new Set([
  'schemaVersion',
  'createdAt',
  'updatedAt',
  'origin',
  'appVersion',
  'catalogRevision',
  'knownFeatures',
  'resetAt',
  'tours',
])
const RECORD_KEYS = new Set([
  'status',
  'tourVersion',
  'step',
  'seenAt',
  'lastShownAt',
  'timesShown',
  'dismissedAt',
  'completedAt',
  'announcedAt',
  'trigger',
  'context',
])
const STATUSES: ReadonlySet<string> = new Set<TourStatus>(['disponivel', 'ativo', 'dispensado', 'concluido'])
const TRIGGERS: ReadonlySet<string> = new Set<TourTrigger>(['primeiro-uso', 'ajuda', 'novidade', 'retomada'])
const ORIGINS: ReadonlySet<string> = new Set<OnboardingOrigin>(['primeiro-uso', 'uso-anterior', 'recuperado'])
const MAX_TEXT = 128
const MAX_STEP_ID = 64
const MAX_FALLBACKS = 16

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/** Lê uma chave própria; nunca devolve o que vem do protótipo (`constructor`, `toString`…). */
export function own<T>(record: Readonly<Record<string, T>> | null | undefined, key: string): T | undefined {
  return record && Object.hasOwn(record, key) ? record[key] : undefined
}

function safeEntries(value: Record<string, unknown>): Array<[string, unknown]> {
  return Object.keys(value)
    .filter((key) => !FORBIDDEN_KEYS.has(key))
    .map((key) => [key, value[key]])
}

function isIso(value: unknown): value is string {
  return typeof value === 'string' && ISO_PATTERN.test(value) && !Number.isNaN(Date.parse(value))
}

/** ISO do relógio injetado; a única conversão de `now` para data do módulo. */
export function toIso(now: number): string {
  if (!Number.isFinite(now)) return EPOCH_ISO
  try {
    return new Date(now).toISOString()
  } catch {
    // Fora do intervalo que o Date representa.
    return EPOCH_ISO
  }
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length
}

/** Tamanho do valor serializado em bytes UTF-8 (o mesmo critério do processo principal). */
export function serializedByteLength(value: unknown): number {
  return byteLength(JSON.stringify(value))
}

// ---------------------------------------------------------------------------
// Catálogo: consultas
// ---------------------------------------------------------------------------

function activeFeatures(catalog: OnboardingCatalog): FeatureDef[] {
  return catalog.features.filter((feature) => !feature.retired)
}

function capabilityFeatures(catalog: OnboardingCatalog): FeatureDef[] {
  return activeFeatures(catalog).filter((feature) => feature.trigger.tipo === 'capability')
}

export function findTour(catalog: OnboardingCatalog, tourId: string): TourDef | undefined {
  const tour = own(catalog.tours, tourId)
  return tour && !tour.retired ? tour : undefined
}

/** O tour do primeiro uso (`kind: 'primeiro-uso'`); no catálogo v1, `inicial`. */
export function firstUseTour(catalog: OnboardingCatalog): TourDef | undefined {
  return Object.values(catalog.tours).find((tour) => tour.kind === 'primeiro-uso' && !tour.retired)
}

/**
 * Passos visíveis de um tour. Um passo com `requires` só aparece com a capability
 * `disponivel`: com `desconhecido` ou `indisponivel` ele é omitido, para nunca
 * descrever o que pode não existir neste ambiente (aceite T2.g).
 */
export function visibleSteps(tour: TourDef, availability: (capability: string) => Availability): StepDef[] {
  return tour.steps.filter((step) => !step.requires || availability(step.requires) === 'disponivel')
}

// ---------------------------------------------------------------------------
// Normalização (nunca lança)
// ---------------------------------------------------------------------------

type Repairs = { count: number }

function readIsoOrNull(value: unknown, repairs: Repairs): string | null {
  if (value === null || value === undefined) return null
  if (isIso(value)) return value
  repairs.count++
  return null
}

function readCount(value: unknown, repairs: Repairs): number {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value
  repairs.count++
  return 0
}

function readShortText(value: unknown, max: number, repairs: Repairs): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' && value.length <= max) return value
  repairs.count++
  return null
}

function readStringList(value: unknown, accept: (item: string) => boolean, max: number, repairs: Repairs) {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    repairs.count++
    return []
  }
  const items: string[] = []
  for (const item of value) {
    if (typeof item === 'string' && accept(item) && !items.includes(item) && items.length < max) items.push(item)
  }
  if (items.length !== value.length) repairs.count++
  return items
}

function readContext(value: unknown, repairs: Repairs): TourContext {
  if (!isPlainObject(value)) {
    if (value !== undefined) repairs.count++
    return { appVersion: null, nodeCount: null, locale: 'pt-BR', anchorFallbacks: [] }
  }
  let nodeCount: number | null = null
  if (typeof value.nodeCount === 'number' && Number.isInteger(value.nodeCount)) {
    nodeCount = value.nodeCount >= 0 ? value.nodeCount : 0
    if (value.nodeCount < 0) repairs.count++
  } else if (value.nodeCount !== null && value.nodeCount !== undefined) {
    repairs.count++
  }
  const locale = typeof value.locale === 'string' && value.locale && value.locale.length <= 35 ? value.locale : null
  if (locale === null && value.locale !== undefined) repairs.count++
  return {
    appVersion: readShortText(value.appVersion, MAX_TEXT, repairs),
    nodeCount,
    locale: locale ?? 'pt-BR',
    anchorFallbacks: readStringList(
      value.anchorFallbacks,
      (item) => item.length > 0 && item.length <= MAX_STEP_ID,
      MAX_FALLBACKS,
      repairs,
    ),
  }
}

function readTourRecord(value: Record<string, unknown>, repairs: Repairs): TourRecord {
  const statusValid = typeof value.status === 'string' && STATUSES.has(value.status)
  if (!statusValid) repairs.count++
  const trigger = typeof value.trigger === 'string' && TRIGGERS.has(value.trigger) ? (value.trigger as TourTrigger) : null
  if (trigger === null && value.trigger !== null && value.trigger !== undefined) repairs.count++
  const extras: Record<string, unknown> = {}
  for (const [key, item] of safeEntries(value)) {
    if (!RECORD_KEYS.has(key)) extras[key] = item
  }
  return {
    // Um `concluido` válido nunca é rebaixado, mesmo com os outros campos quebrados.
    status: statusValid ? (value.status as TourStatus) : 'disponivel',
    tourVersion: readCount(value.tourVersion ?? 0, repairs),
    step: readShortText(value.step, MAX_STEP_ID, repairs),
    seenAt: readIsoOrNull(value.seenAt, repairs),
    lastShownAt: readIsoOrNull(value.lastShownAt, repairs),
    timesShown: readCount(value.timesShown ?? 0, repairs),
    dismissedAt: readIsoOrNull(value.dismissedAt, repairs),
    completedAt: readIsoOrNull(value.completedAt, repairs),
    announcedAt: readIsoOrNull(value.announcedAt, repairs),
    trigger,
    context: readContext(value.context, repairs),
    extras,
  }
}

function readStateV1(value: Record<string, unknown>, catalog: OnboardingCatalog, repairs: Repairs): OnboardingState {
  const createdAt = isIso(value.createdAt) ? value.createdAt : isIso(value.updatedAt) ? value.updatedAt : EPOCH_ISO
  if (createdAt !== value.createdAt) repairs.count++
  const updatedAt = isIso(value.updatedAt) ? value.updatedAt : createdAt
  if (updatedAt !== value.updatedAt) repairs.count++
  const origin = typeof value.origin === 'string' && ORIGINS.has(value.origin) ? (value.origin as OnboardingOrigin) : 'recuperado'
  if (origin !== value.origin) repairs.count++

  const version: Record<string, unknown> = isPlainObject(value.appVersion) ? value.appVersion : {}
  if (!isPlainObject(value.appVersion)) repairs.count++

  const tours: Record<string, TourRecord> = {}
  const toursDesconhecidos: Record<string, unknown> = {}
  if (isPlainObject(value.tours)) {
    for (const [tourId, record] of safeEntries(value.tours)) {
      if (!own(catalog.tours, tourId)) {
        toursDesconhecidos[tourId] = record
      } else if (isPlainObject(record)) {
        tours[tourId] = readTourRecord(record, repairs)
      } else {
        repairs.count++
      }
    }
  } else if (value.tours !== undefined) {
    repairs.count++
  }

  const extras: Record<string, unknown> = {}
  for (const [key, item] of safeEntries(value)) {
    if (!TOP_LEVEL_KEYS.has(key)) extras[key] = item
  }

  return {
    schemaVersion: ONBOARDING_SCHEMA_VERSION,
    createdAt,
    updatedAt,
    origin,
    appVersion: {
      first: readShortText(version.first, MAX_TEXT, repairs),
      last: readShortText(version.last, MAX_TEXT, repairs),
    },
    catalogRevision: readCount(value.catalogRevision ?? 0, repairs),
    knownFeatures: readStringList(value.knownFeatures, (item) => FEATURE_ID_PATTERN.test(item), 512, repairs),
    resetAt: readIsoOrNull(value.resetAt, repairs),
    tours,
    toursDesconhecidos,
    extras,
  }
}

/** Aplica as migrações da versão `from` até `to`; `null` se falta um degrau ou o resultado não é objeto. */
export function migrateRaw(
  raw: Record<string, unknown>,
  from: number,
  to: number,
  migrations: MigrationTable = MIGRATIONS,
): Record<string, unknown> | null {
  let current: Record<string, unknown> = raw
  for (let version = from; version < to; version++) {
    const step = Object.hasOwn(migrations, version) ? migrations[version] : undefined
    if (!step) return null
    const next = step(current)
    if (!isPlainObject(next)) return null
    current = next
  }
  return current
}

/**
 * Normaliza o valor lido do disco. Nunca lança: qualquer forma inesperada vira
 * `invalido` (que a decisão automática trata como `recuperar`), campo quebrado
 * dentro de um v1 é reparado com o padrão, e `schemaVersion` maior que o deste
 * build é `futuro` (somente leitura, para nunca sobrescrever estado mais novo).
 */
export function normalizeOnboardingState(raw: unknown, options: NormalizeOptions = {}): LeituraNormalizada {
  try {
    if (raw === null || raw === undefined) return { tipo: 'ausente' }
    if (!isPlainObject(raw)) return { tipo: 'invalido', motivo: 'nao-objeto' }
    const schemaVersion = raw.schemaVersion
    if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion) || schemaVersion < 1) {
      return { tipo: 'invalido', motivo: 'schema-version' }
    }
    if (schemaVersion > ONBOARDING_SCHEMA_VERSION) return { tipo: 'futuro', schemaVersion }

    const migrated =
      schemaVersion < ONBOARDING_SCHEMA_VERSION
        ? migrateRaw(raw, schemaVersion, ONBOARDING_SCHEMA_VERSION, options.migrations ?? MIGRATIONS)
        : raw
    if (!migrated) return { tipo: 'invalido', motivo: 'migracao' }

    const repairs: Repairs = { count: 0 }
    const state = readStateV1(migrated, options.catalog ?? defaultOnboardingCatalog, repairs)
    return {
      tipo: 'valido',
      state,
      reparado: repairs.count > 0,
      migradoDe: schemaVersion < ONBOARDING_SCHEMA_VERSION ? schemaVersion : null,
    }
  } catch {
    return { tipo: 'invalido', motivo: 'excecao' }
  }
}

function serializeTourRecord(record: TourRecord): Record<string, unknown> {
  return {
    ...record.extras,
    status: record.status,
    tourVersion: record.tourVersion,
    step: record.step,
    seenAt: record.seenAt,
    lastShownAt: record.lastShownAt,
    timesShown: record.timesShown,
    dismissedAt: record.dismissedAt,
    completedAt: record.completedAt,
    announcedAt: record.announcedAt,
    trigger: record.trigger,
    context: {
      appVersion: record.context.appVersion,
      nodeCount: record.context.nodeCount,
      locale: record.context.locale,
      anchorFallbacks: [...record.context.anchorFallbacks],
    },
  }
}

/** Forma gravada no disco. Preserva extras e tours de ids desconhecidos. */
export function serializeOnboardingState(state: OnboardingState): Record<string, unknown> {
  const tours: Record<string, unknown> = {}
  for (const [tourId, record] of Object.entries(state.toursDesconhecidos)) tours[tourId] = record
  for (const [tourId, record] of Object.entries(state.tours)) tours[tourId] = serializeTourRecord(record)
  return {
    ...state.extras,
    schemaVersion: state.schemaVersion,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    origin: state.origin,
    appVersion: { first: state.appVersion.first, last: state.appVersion.last },
    catalogRevision: state.catalogRevision,
    knownFeatures: [...state.knownFeatures],
    resetAt: state.resetAt,
    tours,
  }
}

// ---------------------------------------------------------------------------
// Criação e eventos
// ---------------------------------------------------------------------------

export type EventContext = {
  /** Relógio injetado, em ms; convertido para ISO só aqui. */
  now: number
  catalog?: OnboardingCatalog
  /** Versão do app: só contexto gravado. */
  appVersion: string | null
  locale: string
  nodeCount: number | null
  /** Origem de um estado criado por ação da pessoa quando ainda não existe nenhum. */
  origemPadrao?: 'primeiro-uso' | 'uso-anterior'
}

export type OnboardingEvent =
  | { tipo: 'RECUPERAR' }
  | { tipo: 'REIVINDICAR_INICIAL' }
  | { tipo: 'LINHA_DE_BASE' }
  | { tipo: 'ANUNCIAR'; featureId: string }
  | { tipo: 'ABRIR'; tourId: string; origem: Exclude<TourTrigger, 'retomada'>; stepId?: string | null }
  | { tipo: 'PULAR'; tourId: string; via: 'botao' | 'esc'; stepId: string | null; anchorFallbacks?: readonly string[] }
  | { tipo: 'CONCLUIR'; tourId: string; stepId: string | null; anchorFallbacks?: readonly string[] }
  | { tipo: 'REDEFINIR' }

/**
 * Contexto saneado com as mesmas regras da normalização, para que todo estado
 * produzido aqui sobreviva a `normalize` sem reparo (a store grava o que sai daqui).
 */
function sanitizeContext(ctx: EventContext): EventContext {
  const appVersion = typeof ctx.appVersion === 'string' && ctx.appVersion.length <= MAX_TEXT ? ctx.appVersion : null
  const locale = typeof ctx.locale === 'string' && ctx.locale && ctx.locale.length <= 35 ? ctx.locale : 'pt-BR'
  const nodeCount =
    typeof ctx.nodeCount === 'number' && Number.isInteger(ctx.nodeCount) ? Math.max(0, ctx.nodeCount) : null
  return { ...ctx, appVersion, locale, nodeCount }
}

function cleanStepId(stepId: string | null | undefined): string | null {
  return typeof stepId === 'string' && stepId.length <= MAX_STEP_ID ? stepId : null
}

function emptyTourRecord(ctx: EventContext): TourRecord {
  return {
    status: 'disponivel',
    tourVersion: 0,
    step: null,
    seenAt: null,
    lastShownAt: null,
    timesShown: 0,
    dismissedAt: null,
    completedAt: null,
    announcedAt: null,
    trigger: null,
    context: { appVersion: ctx.appVersion, nodeCount: ctx.nodeCount, locale: ctx.locale, anchorFallbacks: [] },
    extras: {},
  }
}

/** Features assumidas como já conhecidas na criação do estado, por origem. */
function baselineFeatures(origin: OnboardingOrigin, catalog: OnboardingCatalog): string[] {
  if (origin === 'recuperado') return catalog.features.map((feature) => feature.id)
  const capability = capabilityFeatures(catalog)
  if (origin === 'primeiro-uso') return capability.map((feature) => feature.id)
  return capability.filter((feature) => !feature.anunciarParaQuemJaUsa).map((feature) => feature.id)
}

/**
 * Estado novo, sem nenhum tour registrado. Features `{ tipo: 'canvas' }` nunca
 * entram na linha de base (disparam só ao vivo), salvo na recuperação, que é
 * conservadora e assume o catálogo inteiro como conhecido.
 */
export function createBaselineState(origin: OnboardingOrigin, rawCtx: EventContext): OnboardingState {
  const ctx = sanitizeContext(rawCtx)
  const catalog = ctx.catalog ?? defaultOnboardingCatalog
  const iso = toIso(ctx.now)
  return {
    schemaVersion: ONBOARDING_SCHEMA_VERSION,
    createdAt: iso,
    updatedAt: iso,
    origin,
    appVersion: { first: ctx.appVersion, last: ctx.appVersion },
    catalogRevision: catalog.revision,
    knownFeatures: baselineFeatures(origin, catalog),
    resetAt: null,
    tours: {},
    toursDesconhecidos: {},
    extras: {},
  }
}

/** Carimba uma mudança: data, versão do app vista por último e revisão do catálogo (que nunca desce). */
function stamp(state: OnboardingState, patch: Partial<OnboardingState>, ctx: EventContext): OnboardingState {
  const catalog = ctx.catalog ?? defaultOnboardingCatalog
  return {
    ...state,
    ...patch,
    updatedAt: toIso(ctx.now),
    appVersion: { first: state.appVersion.first ?? ctx.appVersion, last: ctx.appVersion ?? state.appVersion.last },
    catalogRevision: Math.max(state.catalogRevision, catalog.revision),
  }
}

function withTour(state: OnboardingState, tourId: string, record: TourRecord): Readonly<Record<string, TourRecord>> {
  return { ...state.tours, [tourId]: record }
}

function mergeFallbacks(current: readonly string[], extra: readonly string[] | undefined): string[] {
  const merged = [...current]
  for (const item of extra ?? []) {
    if (
      typeof item === 'string' &&
      item.length > 0 &&
      item.length <= MAX_STEP_ID &&
      !merged.includes(item) &&
      merged.length < MAX_FALLBACKS
    ) {
      merged.push(item)
    }
  }
  return merged
}

/**
 * Aplica um evento ao estado persistido. Puro: devolve o MESMO objeto quando o
 * evento não muda nada (a store usa isso para não escrever). As reivindicações
 * (`REIVINDICAR_INICIAL`, `LINHA_DE_BASE`, `RECUPERAR`) só valem sobre estado
 * ausente, então reaplicar uma reivindicação depois de perder a corrida é no-op.
 */
export function applyOnboardingEvent(
  state: OnboardingState | null,
  event: OnboardingEvent,
  rawCtx: EventContext,
): OnboardingState | null {
  const ctx = sanitizeContext(rawCtx)
  const catalog = ctx.catalog ?? defaultOnboardingCatalog
  const iso = toIso(ctx.now)

  switch (event.tipo) {
    case 'RECUPERAR':
      return state ?? createBaselineState('recuperado', ctx)

    case 'LINHA_DE_BASE':
      return state ?? createBaselineState('uso-anterior', ctx)

    case 'REIVINDICAR_INICIAL': {
      if (state) return state
      const base = createBaselineState('primeiro-uso', ctx)
      const tour = firstUseTour(catalog)
      if (!tour) return base
      const record: TourRecord = {
        ...emptyTourRecord(ctx),
        status: 'ativo',
        tourVersion: tour.version,
        step: tour.steps[0]?.id ?? null,
        seenAt: iso,
        lastShownAt: iso,
        timesShown: 1,
        trigger: 'primeiro-uso',
      }
      return { ...base, tours: { [tour.id]: record } }
    }

    case 'ANUNCIAR': {
      if (!state || state.knownFeatures.includes(event.featureId)) return state
      const feature = activeFeatures(catalog).find((item) => item.id === event.featureId)
      if (!feature) return state
      const knownFeatures = [...state.knownFeatures, feature.id]
      if (!findTour(catalog, feature.tourId)) return stamp(state, { knownFeatures }, ctx)
      const record = own(state.tours, feature.tourId) ?? emptyTourRecord(ctx)
      return stamp(
        state,
        { knownFeatures, tours: withTour(state, feature.tourId, { ...record, announcedAt: record.announcedAt ?? iso }) },
        ctx,
      )
    }

    case 'ABRIR': {
      const tour = findTour(catalog, event.tourId)
      if (!tour) return state
      const base = state ?? createBaselineState(ctx.origemPadrao ?? 'uso-anterior', ctx)
      const record = own(base.tours, tour.id) ?? emptyTourRecord(ctx)
      const next: TourRecord = {
        ...record,
        status: record.status === 'concluido' ? 'concluido' : 'ativo',
        tourVersion: tour.version,
        step: cleanStepId(event.stepId) ?? tour.steps[0]?.id ?? null,
        seenAt: record.seenAt ?? iso,
        lastShownAt: iso,
        timesShown: record.timesShown + 1,
        trigger: event.origem,
        context: {
          ...record.context,
          appVersion: ctx.appVersion,
          nodeCount: ctx.nodeCount ?? record.context.nodeCount,
          locale: ctx.locale,
        },
      }
      return stamp(base, { tours: withTour(base, tour.id, next) }, ctx)
    }

    case 'PULAR': {
      const record = state ? own(state.tours, event.tourId) : undefined
      if (!state || !record || !findTour(catalog, event.tourId)) return state
      const next: TourRecord = {
        ...record,
        // Pular um tour revisto depois de concluído não desfaz a conclusão.
        status: record.status === 'concluido' ? 'concluido' : 'dispensado',
        dismissedAt: iso,
        step: cleanStepId(event.stepId),
        context: { ...record.context, anchorFallbacks: mergeFallbacks(record.context.anchorFallbacks, event.anchorFallbacks) },
      }
      return stamp(state, { tours: withTour(state, event.tourId, next) }, ctx)
    }

    case 'CONCLUIR': {
      const tour = findTour(catalog, event.tourId)
      if (!state || !tour) return state
      const record = own(state.tours, tour.id) ?? emptyTourRecord(ctx)
      const next: TourRecord = {
        ...record,
        status: 'concluido',
        completedAt: iso,
        tourVersion: tour.version,
        step: cleanStepId(event.stepId),
        seenAt: record.seenAt ?? iso,
        context: { ...record.context, anchorFallbacks: mergeFallbacks(record.context.anchorFallbacks, event.anchorFallbacks) },
      }
      return stamp(state, { tours: withTour(state, tour.id, next) }, ctx)
    }

    case 'REDEFINIR': {
      // Apaga os registros dos tours deste catálogo; `knownFeatures` e ids
      // desconhecidos ficam, para o reset não disparar uma rajada de novidades.
      const base = state ?? createBaselineState(ctx.origemPadrao ?? 'uso-anterior', ctx)
      return stamp(base, { tours: {}, resetAt: iso }, ctx)
    }
  }
}

// ---------------------------------------------------------------------------
// Decisão automática
// ---------------------------------------------------------------------------

export type OnboardingBootSignals = {
  /** Havia chaves `felixo*` no localStorage antes do primeiro render. */
  chavesFelixo: boolean
  /** O marcador de primeiro boot estava (ou foi) gravado. */
  marcadorPrimeiroBoot: boolean
}

export type AutomaticAction =
  | { tipo: 'recuperar' }
  | { tipo: 'reivindicar-inicial' }
  | { tipo: 'linha-de-base' }
  | { tipo: 'anunciar'; featureId: string }

export type AutomaticDecision =
  | AutomaticAction
  | { tipo: 'nada'; motivo: 'suprimido'; teria: AutomaticAction }
  | { tipo: 'nada'; motivo: 'somente-leitura' | 'esperando-capability' | 'sem-novidade' }

export type AutomaticInput = {
  leitura: LeituraNormalizada
  /** A linha do disco não era JSON válido (o main devolve `corrupted: true`). */
  corrupted: boolean
  nodeCount: number
  sinais: OnboardingBootSignals
  autoOpen: boolean
  availability: (capability: string) => Availability
  catalog?: OnboardingCatalog
}

/**
 * Uso anterior: blocos no canvas depois da hidratação, ou chaves `felixo*` sem o
 * marcador de primeiro boot. O marcador cobre um primeiro boot interrompido antes
 * da reivindicação: o tema grava a chave dele, mas o boot seguinte continua sendo
 * primeiro uso. Canvas vazio sozinho nunca prova primeiro uso.
 */
export function hadPreviousUse(nodeCount: number, sinais: OnboardingBootSignals): boolean {
  return nodeCount > 0 || (sinais.chavesFelixo && !sinais.marcadorPrimeiroBoot)
}

/**
 * Próxima novidade de capability: a primeira feature (ordem do catálogo) fora de
 * `knownFeatures` e disponível. `desconhecido` segura o disparo (preserva a ordem);
 * `indisponivel` pula sem marcar, para anunciar quando a capability aparecer.
 */
export function nextCapabilityFeature(
  state: OnboardingState,
  availability: (capability: string) => Availability,
  catalog: OnboardingCatalog = defaultOnboardingCatalog,
): AutomaticDecision {
  for (const feature of capabilityFeatures(catalog)) {
    if (state.knownFeatures.includes(feature.id)) continue
    const requires = feature.trigger.tipo === 'capability' ? feature.trigger.requires : undefined
    const available = requires ? availability(requires) : 'disponivel'
    if (available === 'desconhecido') return { tipo: 'nada', motivo: 'esperando-capability' }
    if (available === 'indisponivel') continue
    return { tipo: 'anunciar', featureId: feature.id }
  }
  return { tipo: 'nada', motivo: 'sem-novidade' }
}

function decideIgnoringPolicy(input: AutomaticInput): AutomaticDecision {
  const catalog = input.catalog ?? defaultOnboardingCatalog
  const { leitura } = input
  if (leitura.tipo === 'futuro') return { tipo: 'nada', motivo: 'somente-leitura' }
  if (input.corrupted || leitura.tipo === 'invalido') return { tipo: 'recuperar' }
  if (leitura.tipo === 'ausente') {
    return hadPreviousUse(input.nodeCount, input.sinais) ? { tipo: 'linha-de-base' } : { tipo: 'reivindicar-inicial' }
  }
  return nextCapabilityFeature(leitura.state, input.availability, catalog)
}

/**
 * Decide o que a sessão faz sozinha depois de ler o estado e hidratar o canvas.
 * Com `autoOpen` falso (instância de automação ou sem ponte) nada acontece, e a
 * decisão guarda o que TERIA acontecido, para o smoke provar a regra sem nada na
 * tela. A `linha-de-base` aplicada volta a esta função, que segue para as novidades.
 */
export function decideAutomaticOpening(input: AutomaticInput): AutomaticDecision {
  const decision = decideIgnoringPolicy(input)
  if (!input.autoOpen && decision.tipo !== 'nada') return { tipo: 'nada', motivo: 'suprimido', teria: decision }
  return decision
}

const SUPPRESSED_LABELS: Readonly<Record<AutomaticAction['tipo'], string>> = {
  recuperar: 'recuperaria',
  'reivindicar-inicial': 'abriria-inicial',
  'linha-de-base': 'linha-de-base',
  anunciar: 'anunciaria',
}

/** Rótulo exposto em `data-felixo-onboarding-decisao` para uma decisão que não agiu. */
export function describeIdleDecision(decision: AutomaticDecision): string {
  if (decision.tipo !== 'nada') return decision.tipo
  if (decision.motivo === 'suprimido') return `suprimido:${SUPPRESSED_LABELS[decision.teria.tipo]}`
  if (decision.motivo === 'somente-leitura') return 'somente-leitura'
  return 'nada'
}

// ---------------------------------------------------------------------------
// Gatilho do canvas (transição ao vivo de um tipo de bloco)
// ---------------------------------------------------------------------------

export type CanvasObservation = {
  /** Tipos presentes na última observação; `null` antes da primeira. */
  base: readonly string[] | null
  /** Features de canvas disparadas e ainda não anunciadas (uma de cada vez). */
  pendentes: readonly string[]
}

export const EMPTY_CANVAS_OBSERVATION: CanvasObservation = Object.freeze({ base: null, pendentes: [] })

/** Lista ordenada e sem repetição a partir da chave `"file,terminal"` que o canvas envia. */
export function parseNodeTypesKey(key: string): string[] {
  return [...new Set(key.split(',').map((item) => item.trim()).filter(Boolean))].sort()
}

export function hasCanvasTriggers(catalog: OnboardingCatalog = defaultOnboardingCatalog): boolean {
  return activeFeatures(catalog).some((feature) => feature.trigger.tipo === 'canvas')
}

/**
 * Registra os tipos de bloco presentes. A primeira observação, e toda observação
 * antes de o canvas estar pronto, só fixa a linha de base: a hidratação nunca
 * dispara. Depois disso, um tipo que passa de ausente a presente dispara as
 * features de canvas daquele tipo ainda não conhecidas, uma vez por id.
 */
export function observeCanvasTypes(
  observation: CanvasObservation,
  types: readonly string[],
  options: { pronto: boolean; state: OnboardingState | null; catalog?: OnboardingCatalog },
): CanvasObservation {
  if (!options.pronto || observation.base === null) return { base: [...types], pendentes: observation.pendentes }
  const previous = observation.base
  const added = types.filter((type) => !previous.includes(type))
  if (added.length === 0) return { base: [...types], pendentes: observation.pendentes }
  const known = options.state?.knownFeatures ?? []
  const fired = activeFeatures(options.catalog ?? defaultOnboardingCatalog)
    .filter(
      (feature) =>
        feature.trigger.tipo === 'canvas' &&
        added.includes(feature.trigger.nodeType) &&
        !known.includes(feature.id) &&
        !observation.pendentes.includes(feature.id),
    )
    .map((feature) => feature.id)
  return { base: [...types], pendentes: [...observation.pendentes, ...fired] }
}

export type NoveltyChoice = { tipo: 'anunciar'; featureId: string } | { tipo: 'esperar' } | { tipo: 'nada' }

/**
 * Escolhe a próxima novidade a anunciar. Com tour ou aviso na tela, espera: a
 * novidade fica pendente e é reavaliada depois de concluir, pular ou dispensar.
 * Gatilhos de canvas observados vêm antes das capabilities.
 */
export function chooseNovelty(input: {
  fase: 'ocioso' | 'tour' | 'aviso' | 'carregando' | 'desativado'
  state: OnboardingState | null
  pendentesCanvas: readonly string[]
  availability: (capability: string) => Availability
  catalog?: OnboardingCatalog
}): NoveltyChoice {
  if (input.fase !== 'ocioso') return { tipo: 'esperar' }
  if (!input.state) return { tipo: 'nada' }
  const known = input.state.knownFeatures
  const canvasFeature = input.pendentesCanvas.find((featureId) => !known.includes(featureId))
  if (canvasFeature) return { tipo: 'anunciar', featureId: canvasFeature }
  const next = nextCapabilityFeature(input.state, input.availability, input.catalog)
  return next.tipo === 'anunciar' ? next : { tipo: 'nada' }
}

// ---------------------------------------------------------------------------
// Ajuda
// ---------------------------------------------------------------------------

export type HelpStatus =
  | 'nao-visto'
  | 'em-andamento'
  | 'interrompido'
  | 'pulado'
  | 'concluido'
  | 'atualizado'
  | 'novo'
  | 'indisponivel'

export type HelpEntry = {
  tourId: string
  tipo: 'tutorial' | 'novidade'
  titulo: MessageKey
  featureId: string | null
  status: HelpStatus
  /** Passo (1-based) para "Em andamento" e "Interrompido no passo n". */
  passo: number | null
  totalPassos: number
  /** ISO de conclusão, formatado pela interface com `Intl.DateTimeFormat`. */
  concluidoEm: string | null
}

export type LiveSession = { tourId: string; stepIndex: number } | null

function helpStatus(
  tour: TourDef,
  record: TourRecord | undefined,
  live: LiveSession,
  available: boolean,
): HelpStatus {
  if (!available) return 'indisponivel'
  if (live?.tourId === tour.id) return 'em-andamento'
  if (!record) return 'nao-visto'
  switch (record.status) {
    case 'concluido':
      return record.tourVersion < tour.version ? 'atualizado' : 'concluido'
    case 'ativo':
      return 'interrompido'
    case 'dispensado':
      return 'pulado'
    case 'disponivel':
      return record.announcedAt && !record.seenAt ? 'novo' : 'nao-visto'
  }
}

function stepNumber(tour: TourDef, steps: StepDef[], record: TourRecord | undefined, live: LiveSession): number | null {
  if (live?.tourId === tour.id) return live.stepIndex + 1
  if (!record?.step) return null
  const index = steps.findIndex((step) => step.id === record.step)
  return index >= 0 ? index + 1 : null
}

/**
 * Cruza o que a pessoa viu (estado) com o que este build oferece (catálogo e
 * disponibilidade) e devolve as entradas da Ajuda: o tutorial de primeiro uso
 * sempre, e as novidades já anunciadas ou vistas.
 */
export function describeHelpEntries(
  state: OnboardingState | null,
  options: {
    catalog?: OnboardingCatalog
    live: LiveSession
    availability: (capability: string) => Availability
  },
): HelpEntry[] {
  const catalog = options.catalog ?? defaultOnboardingCatalog
  const entries: HelpEntry[] = []

  for (const tour of Object.values(catalog.tours)) {
    if (tour.retired || tour.kind !== 'primeiro-uso') continue
    const record = own(state?.tours, tour.id)
    const steps = visibleSteps(tour, options.availability)
    entries.push({
      tourId: tour.id,
      tipo: 'tutorial',
      titulo: tour.title,
      featureId: null,
      status: helpStatus(tour, record, options.live, steps.length > 0),
      passo: stepNumber(tour, steps, record, options.live),
      totalPassos: steps.length,
      concluidoEm: record?.status === 'concluido' ? record.completedAt : null,
    })
  }

  for (const feature of activeFeatures(catalog)) {
    const tour = findTour(catalog, feature.tourId)
    if (!tour) continue
    const record = own(state?.tours, tour.id)
    if (!record?.announcedAt && !record?.seenAt) continue
    const requires = feature.trigger.tipo === 'capability' ? feature.trigger.requires : undefined
    const steps = visibleSteps(tour, options.availability)
    const available = (!requires || options.availability(requires) !== 'indisponivel') && steps.length > 0
    entries.push({
      tourId: tour.id,
      tipo: 'novidade',
      titulo: feature.title,
      featureId: feature.id,
      status: helpStatus(tour, record, options.live, available),
      passo: stepNumber(tour, steps, record, options.live),
      totalPassos: steps.length,
      concluidoEm: record?.status === 'concluido' ? record.completedAt : null,
    })
  }

  return entries
}

export function countNovelties(entries: readonly HelpEntry[]): number {
  return entries.filter((entry) => entry.status === 'novo').length
}

// ---------------------------------------------------------------------------
// Retomada por sessão (sessionStorage, por janela)
// ---------------------------------------------------------------------------

export const SESSION_STORAGE_KEY = 'felixo:onboarding:sessao'

export type SessionRecord = { v: 1; tourId: string; stepIndex: number; trigger: TourTrigger }

/** Lê a sessão salva; qualquer forma inválida é ignorada (`null`). */
export function parseSessionRecord(
  raw: string | null,
  catalog: OnboardingCatalog = defaultOnboardingCatalog,
): SessionRecord | null {
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (!isPlainObject(value) || value.v !== 1) return null
    const { tourId, stepIndex, trigger } = value
    if (typeof tourId !== 'string' || !findTour(catalog, tourId)) return null
    if (typeof stepIndex !== 'number' || !Number.isInteger(stepIndex) || stepIndex < 0) return null
    if (typeof trigger !== 'string' || !TRIGGERS.has(trigger)) return null
    return { v: 1, tourId, stepIndex, trigger: trigger as TourTrigger }
  } catch {
    return null
  }
}

export function serializeSessionRecord(record: Omit<SessionRecord, 'v'>): string {
  return JSON.stringify({ v: 1, tourId: record.tourId, stepIndex: record.stepIndex, trigger: record.trigger })
}

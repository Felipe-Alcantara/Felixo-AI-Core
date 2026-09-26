import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultOnboardingCatalog, type AnchorId, type OnboardingCatalog } from './onboarding-catalog'
import {
  ONBOARDING_MAX_BYTES,
  applyOnboardingEvent,
  normalizeOnboardingState,
  serializeOnboardingState,
  serializedByteLength,
  type OnboardingEvent,
  type OnboardingState,
} from './onboarding-state'
import { createOnboardingStore, type OnboardingStoreDeps } from './onboarding-store'
import {
  BASE_CTX,
  CATALOG_WITH_CANVAS_TRIGGER,
  CATALOG_WITH_NEW_FEATURE,
  CATALOG_WITH_REQUIRES,
  FIRST_BOOT,
  INTERRUPTED_FIRST_BOOT,
  PREVIOUS_USE,
  createDisk,
  diskValue,
  externalWrite,
  fakeBackend,
  memoryStorage,
  seededRandom,
  type FakeDisk,
} from './onboarding-test-fixtures'

/**
 * U-prop: 500 sequências de 40 eventos aleatórios (PRNG semeado) sobre a store,
 * com dependências espiãs. As invariantes valem para qualquer ordem de eventos,
 * leituras que falham, escritas de outra instância e reloads.
 */

const SEQUENCES = 500
const EVENTS_PER_SEQUENCE = 40
const ANCHORS: AnchorId[] = ['rail-menu', 'secao-criar', 'criar-agente', 'inspector-puck', 'canvas']
/** O que a store pode chamar: I/O pelas dependências e leituras puras (relógio, locale, sinais). */
const ALLOWED_DEPS = new Set([
  'backend.read',
  'backend.write',
  'session.getItem',
  'session.setItem',
  'session.removeItem',
  'clearFirstBootMarker',
  'getActiveElement',
  'now',
  'getLocale',
  'bootSignals',
  'readFault',
  'schedule',
  'log',
])

function build(events: OnboardingEvent[]): OnboardingState {
  let state: OnboardingState | null = null
  for (const event of events) state = applyOnboardingEvent(state, event, BASE_CTX)
  if (!state) throw new Error('estado não criado')
  return state
}

const INITIAL_DISKS: Array<() => FakeDisk> = [
  () => createDisk(),
  () => createDisk(),
  () => createDisk({ value: serializeOnboardingState(build([{ tipo: 'REIVINDICAR_INICIAL' }])) }),
  () =>
    createDisk({
      value: serializeOnboardingState(
        build([{ tipo: 'REIVINDICAR_INICIAL' }, { tipo: 'CONCLUIR', tourId: 'inicial', stepId: 'ajuda' }]),
      ),
    }),
  () => createDisk({ value: serializeOnboardingState(build([{ tipo: 'LINHA_DE_BASE' }])) }),
  () => createDisk({ corrupted: true }),
  () => createDisk({ value: { schemaVersion: 2, tours: {} } }),
  () => createDisk({ value: { schemaVersion: 0 } }),
]
const CATALOGS: OnboardingCatalog[] = [
  defaultOnboardingCatalog,
  CATALOG_WITH_NEW_FEATURE,
  CATALOG_WITH_CANVAS_TRIGGER,
  CATALOG_WITH_REQUIRES,
]
const SIGNALS = [FIRST_BOOT, PREVIOUS_USE, INTERRUPTED_FIRST_BOOT]

type Violation = string

async function runSequence(seed: number): Promise<Violation[]> {
  const random = seededRandom(seed)
  const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)]
  const violations: Violation[] = []
  const calls = new Set<string>()
  const spy = <A extends unknown[], R>(name: string, fn: (...args: A) => R) => (...args: A): R => {
    calls.add(name)
    return fn(...args)
  }

  const disk = pick(INITIAL_DISKS)()
  const catalog = pick(CATALOGS)
  const autoOpen = random() < 0.7
  const noBridge = random() < 0.1
  const readMode = pick(['ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'falha', 'excecao', 'pendurada'] as const)
  const session = memoryStorage(
    random() < 0.2
      ? {
          'felixo:onboarding:sessao': JSON.stringify({
            v: 1,
            tourId: 'inicial',
            stepIndex: Math.floor(random() * 8),
            trigger: 'ajuda',
          }),
        }
      : {},
  )
  const backend = fakeBackend(disk, {
    automation: autoOpen ? { autoOpen: true, reason: 'produto' } : { autoOpen: false, reason: 'devtools' },
    read: readMode,
  })
  const timers: Array<() => void> = []
  let explicitActions = 0
  let clock = BASE_CTX.now
  let canvasReadyCalled = false

  // Toda escrita que chega ao "disco" passa pelas invariantes de conteúdo.
  const checkedWrite = async (request: { expectedRevision: number; value: unknown }) => {
    if (!autoOpen && explicitActions === 0) violations.push('escrita automática com autoOpen falso')
    if (serializedByteLength(request.value) > ONBOARDING_MAX_BYTES) violations.push('valor acima de 64 KiB')
    const normalized = normalizeOnboardingState(request.value, { catalog })
    if (normalized.tipo !== 'valido' || normalized.reparado) violations.push(`valor gravado não normaliza limpo: ${normalized.tipo}`)
    const before = diskValue(disk)
    const result = await backend.write(request)
    if (result.ok && result.applied) {
      const beforeTours = (before?.tours ?? {}) as Record<string, { status?: string }>
      const afterTours = ((request.value as Record<string, unknown>).tours ?? {}) as Record<string, { status?: string }>
      for (const [tourId, record] of Object.entries(beforeTours)) {
        const resetNow = (request.value as { resetAt?: unknown }).resetAt !== before?.resetAt
        if (record?.status === 'concluido' && afterTours[tourId]?.status !== 'concluido' && !resetNow) {
          violations.push(`concluido de ${tourId} desfeito sem REDEFINIR`)
        }
      }
    }
    return result
  }

  const deps: OnboardingStoreDeps = {
    backend: noBridge ? null : { read: spy('backend.read', backend.read), write: spy('backend.write', checkedWrite) },
    session: () => ({
      getItem: spy('session.getItem', session.getItem),
      setItem: spy('session.setItem', session.setItem),
      removeItem: spy('session.removeItem', session.removeItem),
    }),
    // Relógio que anda a cada leitura: cada REDEFINIR grava um resetAt diferente.
    now: spy('now', () => (clock += 1)),
    bootSignals: spy('bootSignals', () => pick(SIGNALS)),
    clearFirstBootMarker: spy('clearFirstBootMarker', () => {}),
    getLocale: spy('getLocale', () => 'pt-BR'),
    getActiveElement: spy('getActiveElement', () => null),
    catalog,
    schedule: spy('schedule', (callback: () => void) => {
      timers.push(callback)
    }),
    readFault: spy('readFault', () => null),
    log: spy('log', () => {}),
  }
  const store = createOnboardingStore(deps)

  const check = (moment: string) => {
    const snapshot = store.getSnapshot()
    if (snapshot.tour && snapshot.aviso) violations.push(`${moment}: tour e aviso ao mesmo tempo`)
    if ((snapshot.fase === 'tour') !== (snapshot.tour !== null)) violations.push(`${moment}: fase tour sem tour`)
    if ((snapshot.fase === 'aviso') !== (snapshot.aviso !== null)) violations.push(`${moment}: fase aviso sem aviso`)
    if (snapshot.tour?.trigger === 'retomada' && snapshot.tour.foco !== 'manter') {
      violations.push(`${moment}: retomada movendo o foco`)
    }
    const automatic = snapshot.aviso !== null || snapshot.tour?.trigger === 'primeiro-uso' || snapshot.tour?.trigger === 'retomada'
    if (automatic && !canvasReadyCalled) violations.push(`${moment}: abertura automática antes de CANVAS_READY`)
    if (!autoOpen && (snapshot.aviso !== null || snapshot.tour?.trigger === 'primeiro-uso')) {
      violations.push(`${moment}: abertura automática com autoOpen falso`)
    }
    if (snapshot.tour && (snapshot.tour.stepIndex < 0 || snapshot.tour.stepIndex >= snapshot.tour.passos.length)) {
      violations.push(`${moment}: passo fora do intervalo`)
    }
  }

  const actions: Array<[number, () => void | Promise<void>]> = [
    [4, () => {
      canvasReadyCalled = true
      store.canvasReady(pick([0, 0, 3]))
    }],
    [1, () => store.canvasUnmounted()],
    [2, () => store.canvasNodeTypes(pick(['', 'terminal', 'image,terminal', 'image', 'file,terminal']))],
    [1, () => store.setCapability('integracao', pick(['desconhecido', 'indisponivel', 'disponivel'] as const))],
    [2, () => {
      explicitActions++
      store.open(pick(['inicial', 'novidade-ajuda', 'inexistente']), 'ajuda', random() < 0.3 ? { stepId: 'terminal' } : {})
    }],
    [4, () => store.next()],
    [2, () => store.back()],
    [1, () => store.retarget(pick(ANCHORS))],
    [2, () => {
      if (store.getSnapshot().tour) explicitActions++
      store.skip(pick(['botao', 'esc'] as const))
    }],
    [2, () => {
      if (store.getSnapshot().tour) explicitActions++
      store.complete()
    }],
    [1, () => {
      if (store.getSnapshot().aviso) explicitActions++
      store.viewNotice()
    }],
    [1, () => store.dismissNotice()],
    [1, () => {
      explicitActions++
      store.reset()
    }],
    [1, () => store.reportFailure(new Error('falha de render simulada'))],
    [1, () => store.announce('texto')],
    [1, () => timers.splice(0).forEach((callback) => callback())],
    [1, () => {
      // Outra instância acrescenta um id (nunca desfaz concluido nem corrompe).
      if (disk.json !== null && !disk.corrupted && (diskValue(disk)?.schemaVersion ?? 0) === 1) {
        externalWrite(disk, (value) => ({
          ...value,
          knownFeatures: [...new Set([...((value?.knownFeatures as string[]) ?? []), 'feature.externa'])],
        }))
      }
    }],
    [4, () => {
      // Espera tudo assentar; o prazo da leitura (4 s no app) "passa" antes, como passaria no relógio real.
      timers.splice(0).forEach((callback) => callback())
      return store.settled()
    }],
  ]
  const totalWeight = actions.reduce((sum, [weight]) => sum + weight, 0)
  const chooseAction = () => {
    let roll = random() * totalWeight
    for (const [weight, action] of actions) {
      roll -= weight
      if (roll < 0) return action
    }
    return actions[actions.length - 1][1]
  }

  for (let index = 0; index < EVENTS_PER_SEQUENCE; index++) {
    await chooseAction()()
    check(`evento ${index}`)
  }
  timers.splice(0).forEach((callback) => callback())
  await store.settled()
  check('fim')

  for (const name of calls) if (!ALLOWED_DEPS.has(name)) violations.push(`dependência inesperada: ${name}`)
  return violations
}

describe('store do tutorial: propriedades (U-prop)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it(`${SEQUENCES} sequências de ${EVENTS_PER_SEQUENCE} eventos aleatórios mantêm as invariantes`, async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const failures: string[] = []
    for (let seed = 1; seed <= SEQUENCES; seed++) {
      const violations = await runSequence(seed)
      if (violations.length > 0) failures.push(`semente ${seed}: ${[...new Set(violations)].join('; ')}`)
    }
    expect(failures.slice(0, 5)).toEqual([])
    // Nenhum caminho da store chega à rede.
    expect(fetchSpy).not.toHaveBeenCalled()
  }, 60_000)
})

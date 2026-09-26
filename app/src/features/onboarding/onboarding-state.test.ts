import { describe, expect, it } from 'vitest'
import { defaultOnboardingCatalog, type OnboardingCatalog } from './onboarding-catalog'
import {
  EMPTY_CANVAS_OBSERVATION,
  ONBOARDING_MAX_BYTES,
  SESSION_STORAGE_KEY,
  applyOnboardingEvent,
  chooseNovelty,
  countNovelties,
  createBaselineState,
  decideAutomaticOpening,
  describeHelpEntries,
  describeIdleDecision,
  migrateRaw,
  normalizeOnboardingState,
  observeCanvasTypes,
  parseNodeTypesKey,
  parseSessionRecord,
  serializeOnboardingState,
  serializeSessionRecord,
  serializedByteLength,
  toIso,
  visibleSteps,
  type Availability,
  type AutomaticInput,
  type EventContext,
  type LeituraNormalizada,
  type OnboardingEvent,
  type OnboardingState,
} from './onboarding-state'
import {
  BASE_CTX,
  CATALOG_WITH_CANVAS_TRIGGER,
  CATALOG_WITH_NEW_FEATURE,
  CATALOG_WITH_OPTIONAL_STEP,
  CATALOG_WITH_REQUIRES,
  CATALOG_WITH_TOUR_V2,
  FIRST_BOOT,
  FIXED_NOW,
  INTERRUPTED_FIRST_BOOT,
  PREVIOUS_USE,
  available,
  mutateValue,
  randomValue,
  seededRandom,
} from './onboarding-test-fixtures'

const ISO = toIso(FIXED_NOW)

function ctx(extra: Partial<EventContext> = {}): EventContext {
  return { ...BASE_CTX, ...extra }
}

function valid(leitura: LeituraNormalizada): OnboardingState {
  if (leitura.tipo !== 'valido') throw new Error(`esperava válido, veio ${leitura.tipo}`)
  return leitura.state
}

function apply(state: OnboardingState | null, events: OnboardingEvent[], extra: Partial<EventContext> = {}) {
  let current = state
  for (const event of events) current = applyOnboardingEvent(current, event, ctx(extra))
  return current
}

function decide(overrides: Partial<AutomaticInput>) {
  return decideAutomaticOpening({
    leitura: { tipo: 'ausente' },
    corrupted: false,
    nodeCount: 0,
    sinais: FIRST_BOOT,
    autoOpen: true,
    availability: available,
    ...overrides,
  })
}

/** Estado de quem concluiu o tutorial inicial no catálogo atual. */
function completedInitial(extra: Partial<EventContext> = {}): OnboardingState {
  const state = apply(
    null,
    [{ tipo: 'REIVINDICAR_INICIAL' }, { tipo: 'CONCLUIR', tourId: 'inicial', stepId: 'ajuda' }],
    extra,
  )
  if (!state) throw new Error('estado não criado')
  return state
}

/** Lê o estado como o próximo boot leria: pelo disco (serializa, normaliza). */
function reread(state: OnboardingState, catalog: OnboardingCatalog = defaultOnboardingCatalog) {
  return normalizeOnboardingState(JSON.parse(JSON.stringify(serializeOnboardingState(state))), { catalog })
}

describe('normalizeOnboardingState', () => {
  it('null e undefined são estado ausente', () => {
    expect(normalizeOnboardingState(null)).toEqual({ tipo: 'ausente' })
    expect(normalizeOnboardingState(undefined)).toEqual({ tipo: 'ausente' })
  })

  it('array, string, número e objeto sem schemaVersion são inválidos', () => {
    for (const raw of [[], 'x', 42, {}, true]) expect(normalizeOnboardingState(raw).tipo).toBe('invalido')
  })

  it('schemaVersion 0, -1, "1" e 1.5 são inválidos; 2 é futuro (somente leitura)', () => {
    for (const schemaVersion of [0, -1, '1', 1.5, Number.NaN]) {
      expect(normalizeOnboardingState({ schemaVersion }).tipo, String(schemaVersion)).toBe('invalido')
    }
    expect(normalizeOnboardingState({ schemaVersion: 2, tours: {} })).toEqual({ tipo: 'futuro', schemaVersion: 2 })
  })

  it('repara campos quebrados de um v1 sem rebaixar um concluido válido', () => {
    const leitura = normalizeOnboardingState({
      schemaVersion: 1,
      createdAt: 'ontem',
      updatedAt: '2026-09-20T10:00:00.000Z',
      origin: 'marte',
      appVersion: 'nao-objeto',
      catalogRevision: -3,
      knownFeatures: ['feature.ajuda', 7, 'feature.ajuda', 'invalido'],
      resetAt: 12,
      tours: {
        inicial: {
          status: 'concluido',
          tourVersion: -1,
          step: 42,
          seenAt: 'nunca',
          timesShown: -5,
          completedAt: '2026-02-30T99:99:99Z',
          trigger: 'desconhecido',
          context: { nodeCount: -2, locale: 9, anchorFallbacks: 'x' },
        },
        'novidade-ajuda': { status: 'pausado', timesShown: 2 },
      },
    })
    expect(leitura.tipo).toBe('valido')
    if (leitura.tipo !== 'valido') return
    expect(leitura.reparado).toBe(true)
    const { state } = leitura
    expect(state.createdAt).toBe('2026-09-20T10:00:00.000Z')
    expect(state.origin).toBe('recuperado')
    expect(state.appVersion).toEqual({ first: null, last: null })
    expect(state.catalogRevision).toBe(0)
    expect(state.knownFeatures).toEqual(['feature.ajuda'])
    expect(state.resetAt).toBeNull()
    expect(state.tours.inicial).toMatchObject({
      status: 'concluido',
      tourVersion: 0,
      step: null,
      seenAt: null,
      timesShown: 0,
      completedAt: null,
      trigger: null,
      context: { nodeCount: 0, locale: 'pt-BR', anchorFallbacks: [] },
    })
    expect(state.tours['novidade-ajuda']).toMatchObject({ status: 'disponivel', timesShown: 2 })
  })

  it('ignora __proto__, constructor e prototype, sem poluir protótipos', () => {
    const raw: unknown = JSON.parse(
      '{"schemaVersion":1,"__proto__":{"poluido":true},"constructor":{"x":1},' +
        '"tours":{"__proto__":{"status":"concluido"},"constructor":{"status":"ativo"},' +
        '"inicial":{"status":"ativo","__proto__":{"poluido":true}}}}',
    )
    const state = valid(normalizeOnboardingState(raw))
    expect(({} as Record<string, unknown>).poluido).toBeUndefined()
    expect(Object.keys(state.extras)).toEqual([])
    expect(Object.keys(state.tours)).toEqual(['inicial'])
    expect(Object.keys(state.toursDesconhecidos)).toEqual([])
    expect(Object.keys(state.tours.inicial.extras)).toEqual([])
    expect(Object.getPrototypeOf(state.tours)).toBe(Object.prototype)
  })

  it('fuzz: 500 valores aleatórios nunca lançam; todo válido sobrevive à ida e volta', () => {
    const random = seededRandom(20260926)
    const template = serializeOnboardingState(
      apply(completedInitial(), [{ tipo: 'ANUNCIAR', featureId: 'feature.nova' }], { catalog: CATALOG_WITH_NEW_FEATURE }) ??
        completedInitial(),
    )
    let validos = 0
    for (let index = 0; index < 500; index++) {
      // Metade totalmente aleatória, metade mutações de um estado válido.
      const raw = index % 2 === 0 ? randomValue(random) : mutateValue(random, template)
      expect(() => normalizeOnboardingState(raw)).not.toThrow()
      // O que vem do disco é JSON: a ida e volta é conferida sobre a forma JSON do valor.
      const fromDisk: unknown = JSON.parse(JSON.stringify(raw) ?? 'null')
      let leitura: LeituraNormalizada | undefined
      expect(() => {
        leitura = normalizeOnboardingState(fromDisk)
      }).not.toThrow()
      if (leitura?.tipo === 'valido') {
        validos++
        const again = reread(leitura.state)
        expect(again.tipo).toBe('valido')
        if (again.tipo === 'valido') {
          expect(again.reparado).toBe(false)
          expect(again.state).toEqual(leitura.state)
        }
      }
    }
    expect(validos).toBeGreaterThan(150)
  })
})

describe('serializeOnboardingState', () => {
  it('preserva chaves de topo desconhecidas, tours de ids desconhecidos e campos extras de um tour', () => {
    const raw = {
      schemaVersion: 1,
      createdAt: ISO,
      updatedAt: ISO,
      origin: 'primeiro-uso',
      appVersion: { first: '0.1.0', last: '0.1.0' },
      catalogRevision: 1,
      knownFeatures: ['feature.ajuda'],
      resetAt: null,
      preferenciaFutura: { tema: 'x' },
      tours: {
        'tour-de-build-novo': { status: 'pausado', qualquer: [1, 2] },
        inicial: { status: 'concluido', campoNovo: 'y', completedAt: ISO },
      },
    }
    const serialized = serializeOnboardingState(valid(normalizeOnboardingState(raw)))
    expect(serialized.preferenciaFutura).toEqual({ tema: 'x' })
    const tours = serialized.tours as Record<string, Record<string, unknown>>
    expect(tours['tour-de-build-novo']).toEqual({ status: 'pausado', qualquer: [1, 2] })
    expect(tours.inicial.campoNovo).toBe('y')
    expect(tours.inicial.status).toBe('concluido')
  })

  it('a ida e volta pelo disco é estável e sem reparo', () => {
    const state = completedInitial()
    const again = reread(state)
    expect(again).toEqual({ tipo: 'valido', state, reparado: false, migradoDe: null })
  })
})

describe('decideAutomaticOpening', () => {
  const cases: Array<[string, Partial<AutomaticInput>, string]> = [
    ['primeiro uso', {}, 'reivindicar-inicial'],
    ['chaves sem marcador → linha de base', { sinais: PREVIOUS_USE }, 'linha-de-base'],
    ['chaves com marcador (boot interrompido) → primeiro uso', { sinais: INTERRUPTED_FIRST_BOOT }, 'reivindicar-inicial'],
    ['blocos no canvas → linha de base', { nodeCount: 3 }, 'linha-de-base'],
    ['autoOpen falso → nada (suprimido)', { autoOpen: false }, 'suprimido:abriria-inicial'],
    ['autoOpen falso com uso anterior', { autoOpen: false, sinais: PREVIOUS_USE }, 'suprimido:linha-de-base'],
    ['futuro → nada (somente leitura)', { leitura: { tipo: 'futuro', schemaVersion: 2 } }, 'somente-leitura'],
    ['inválido → recuperar', { leitura: { tipo: 'invalido', motivo: 'x' } }, 'recuperar'],
    ['linha corrompida → recuperar', { corrupted: true }, 'recuperar'],
    ['corrompido sem autoOpen → suprimido', { corrupted: true, autoOpen: false }, 'suprimido:recuperaria'],
  ]

  it.each(cases)('%s', (_name, input, expected) => {
    expect(describeIdleDecision(decide(input))).toBe(expected)
  })

  it('update sem feature (catálogo igual) → nada, sem nenhuma escrita (T1.a)', () => {
    const state = valid(reread(completedInitial()))
    expect(decide({ leitura: { tipo: 'valido', state, reparado: false, migradoDe: null } })).toEqual({
      tipo: 'nada',
      motivo: 'sem-novidade',
    })
  })

  it('update com feature → anuncia só a nova, uma vez; o concluido do inicial fica (T1.b, T3.c)', () => {
    const catalog = CATALOG_WITH_NEW_FEATURE
    const leitura = reread(completedInitial(), catalog)
    const state = valid(leitura)
    expect(decide({ leitura, catalog })).toEqual({ tipo: 'anunciar', featureId: 'feature.nova' })

    const announced = applyOnboardingEvent(state, { tipo: 'ANUNCIAR', featureId: 'feature.nova' }, ctx({ catalog }))
    if (!announced) throw new Error('anúncio não aplicado')
    expect(announced.knownFeatures).toContain('feature.nova')
    expect(announced.tours['novidade-nova'].announcedAt).toBe(ISO)
    expect(announced.tours.inicial.status).toBe('concluido')
    expect(announced.catalogRevision).toBe(2)

    const afterRestart = reread(announced, catalog)
    expect(decide({ leitura: afterRestart, catalog })).toEqual({ tipo: 'nada', motivo: 'sem-novidade' })
    expect(applyOnboardingEvent(announced, { tipo: 'ANUNCIAR', featureId: 'feature.nova' }, ctx({ catalog }))).toBe(
      announced,
    )
  })

  it('anunciarParaQuemJaUsa: o uso anterior recebe o aviso da Ajuda; o primeiro uso, nenhum', () => {
    const baseline = apply(null, [{ tipo: 'LINHA_DE_BASE' }])
    const firstUse = apply(null, [{ tipo: 'REIVINDICAR_INICIAL' }])
    if (!baseline || !firstUse) throw new Error('estado não criado')
    expect(decide({ leitura: reread(baseline) })).toEqual({ tipo: 'anunciar', featureId: 'feature.ajuda' })
    expect(decide({ leitura: reread(firstUse) })).toEqual({ tipo: 'nada', motivo: 'sem-novidade' })
  })

  it('requires: desconhecido espera, indisponível não marca, disponível anuncia', () => {
    const catalog = CATALOG_WITH_REQUIRES
    const leitura = reread(completedInitial(), catalog)
    const at = (availability: Availability) => () => availability
    expect(decide({ leitura, catalog, availability: at('desconhecido') })).toEqual({
      tipo: 'nada',
      motivo: 'esperando-capability',
    })
    expect(decide({ leitura, catalog, availability: at('indisponivel') })).toEqual({
      tipo: 'nada',
      motivo: 'sem-novidade',
    })
    expect(valid(leitura).knownFeatures).not.toContain('feature.condicional')
    expect(decide({ leitura, catalog, availability: at('disponivel') })).toEqual({
      tipo: 'anunciar',
      featureId: 'feature.condicional',
    })
  })

  it('a versão do app, em qualquer forma, não muda nenhuma decisão (T1.e)', () => {
    const versions = [null, '0.1.0', '0.1.423', '0.1.423-2-gabc1234-dev', '9.9.9']
    const traces = versions.map((appVersion) => {
      const trace: string[] = []
      for (const sinais of [FIRST_BOOT, PREVIOUS_USE, INTERRUPTED_FIRST_BOOT]) {
        let state: OnboardingState | null = null
        let leitura: LeituraNormalizada = { tipo: 'ausente' }
        for (let round = 0; round < 4; round++) {
          const decision = decide({ leitura, sinais, catalog: CATALOG_WITH_NEW_FEATURE })
          trace.push(describeIdleDecision(decision))
          const event: OnboardingEvent | null =
            decision.tipo === 'reivindicar-inicial'
              ? { tipo: 'REIVINDICAR_INICIAL' }
              : decision.tipo === 'linha-de-base'
                ? { tipo: 'LINHA_DE_BASE' }
                : decision.tipo === 'anunciar'
                  ? { tipo: 'ANUNCIAR', featureId: decision.featureId }
                  : null
          if (!event) break
          state = applyOnboardingEvent(state, event, ctx({ appVersion, catalog: CATALOG_WITH_NEW_FEATURE }))
          if (!state) break
          leitura = reread(state, CATALOG_WITH_NEW_FEATURE)
        }
        trace.push(JSON.stringify({ ...state, appVersion: null, tours: Object.keys(state?.tours ?? {}) }))
      }
      return trace
    })
    for (const trace of traces) expect(trace).toEqual(traces[0])
  })
})

describe('applyOnboardingEvent', () => {
  it('cria o estado com o relógio e a versão injetados (T1.e)', () => {
    const state = apply(null, [{ tipo: 'REIVINDICAR_INICIAL' }], { appVersion: '0.1.423-2-gabc1234-dev' })
    expect(state).toMatchObject({
      createdAt: ISO,
      updatedAt: ISO,
      origin: 'primeiro-uso',
      appVersion: { first: '0.1.423-2-gabc1234-dev', last: '0.1.423-2-gabc1234-dev' },
      catalogRevision: 1,
      knownFeatures: ['feature.ajuda'],
    })
    expect(state?.tours.inicial).toMatchObject({
      status: 'ativo',
      step: 'projeto',
      seenAt: ISO,
      lastShownAt: ISO,
      timesShown: 1,
      trigger: 'primeiro-uso',
      tourVersion: 1,
    })
  })

  it('reivindicar duas vezes: a segunda é no-op (mesmo objeto)', () => {
    const first = apply(null, [{ tipo: 'REIVINDICAR_INICIAL' }])
    expect(applyOnboardingEvent(first, { tipo: 'REIVINDICAR_INICIAL' }, ctx({ now: FIXED_NOW + 1 }))).toBe(first)
    expect(applyOnboardingEvent(first, { tipo: 'LINHA_DE_BASE' }, ctx())).toBe(first)
    expect(applyOnboardingEvent(first, { tipo: 'RECUPERAR' }, ctx())).toBe(first)
  })

  it('recuperar é conservador: todo o catálogo conhecido, nenhum tour registrado', () => {
    const state = apply(null, [{ tipo: 'RECUPERAR' }], { catalog: CATALOG_WITH_CANVAS_TRIGGER })
    expect(state?.origin).toBe('recuperado')
    expect(state?.knownFeatures).toEqual(['feature.ajuda', 'feature.imagem'])
    expect(state?.tours).toEqual({})
  })

  it('dispensar um tour concluído mantém o concluido', () => {
    const later = FIXED_NOW + 60_000
    const state = applyOnboardingEvent(
      completedInitial(),
      { tipo: 'PULAR', tourId: 'inicial', via: 'esc', stepId: 'agente' },
      ctx({ now: later }),
    )
    expect(state?.tours.inicial).toMatchObject({ status: 'concluido', dismissedAt: toIso(later), step: 'agente' })
  })

  it('pular um tour ativo marca dispensado e guarda o passo e os alvos alternativos', () => {
    const state = apply(null, [
      { tipo: 'REIVINDICAR_INICIAL' },
      { tipo: 'PULAR', tourId: 'inicial', via: 'botao', stepId: 'contexto', anchorFallbacks: ['agente:rail-menu'] },
    ])
    expect(state?.tours.inicial).toMatchObject({
      status: 'dispensado',
      dismissedAt: ISO,
      step: 'contexto',
      context: { anchorFallbacks: ['agente:rail-menu'] },
    })
  })

  it('concluir grava completedAt e a versão atual do roteiro', () => {
    const catalog = CATALOG_WITH_TOUR_V2
    const state = apply(
      null,
      [{ tipo: 'LINHA_DE_BASE' }, { tipo: 'ABRIR', tourId: 'inicial', origem: 'ajuda' }, { tipo: 'CONCLUIR', tourId: 'inicial', stepId: 'ajuda' }],
      { catalog },
    )
    expect(state?.tours.inicial).toMatchObject({ status: 'concluido', completedAt: ISO, tourVersion: 2, step: 'ajuda' })
  })

  it('abrir um tour concluído (Rever) preserva o concluido e conta a exibição', () => {
    const state = applyOnboardingEvent(
      completedInitial(),
      { tipo: 'ABRIR', tourId: 'inicial', origem: 'ajuda' },
      ctx({ now: FIXED_NOW + 1000 }),
    )
    expect(state?.tours.inicial).toMatchObject({
      status: 'concluido',
      timesShown: 2,
      seenAt: ISO,
      lastShownAt: toIso(FIXED_NOW + 1000),
      trigger: 'ajuda',
    })
  })

  it('abrir sem estado cria um com a origem padrão da sessão', () => {
    const state = applyOnboardingEvent(
      null,
      { tipo: 'ABRIR', tourId: 'inicial', origem: 'ajuda' },
      ctx({ origemPadrao: 'primeiro-uso' }),
    )
    expect(state?.origin).toBe('primeiro-uso')
    expect(state?.tours.inicial.status).toBe('ativo')
  })

  it('eventos sem efeito devolvem o mesmo objeto', () => {
    const state = completedInitial()
    expect(applyOnboardingEvent(state, { tipo: 'ANUNCIAR', featureId: 'feature.ajuda' }, ctx())).toBe(state)
    expect(applyOnboardingEvent(state, { tipo: 'ANUNCIAR', featureId: 'feature.inexistente' }, ctx())).toBe(state)
    expect(applyOnboardingEvent(state, { tipo: 'ABRIR', tourId: 'tour-inexistente', origem: 'ajuda' }, ctx())).toBe(state)
    expect(applyOnboardingEvent(state, { tipo: 'PULAR', tourId: 'novidade-ajuda', via: 'esc', stepId: null }, ctx())).toBe(
      state,
    )
    expect(applyOnboardingEvent(null, { tipo: 'CONCLUIR', tourId: 'inicial', stepId: null }, ctx())).toBeNull()
  })

  it('redefinir apaga os tours do catálogo e preserva knownFeatures e ids desconhecidos', () => {
    const raw: Record<string, unknown> = { ...serializeOnboardingState(completedInitial()), extra: 1 }
    ;(raw.tours as Record<string, unknown>)['tour-de-build-novo'] = { status: 'concluido' }
    const state = valid(normalizeOnboardingState({ ...raw, knownFeatures: ['feature.ajuda', 'feature.futura'] }))
    const reset = applyOnboardingEvent(state, { tipo: 'REDEFINIR' }, ctx({ now: FIXED_NOW + 5 }))
    expect(reset?.tours).toEqual({})
    expect(reset?.toursDesconhecidos).toEqual({ 'tour-de-build-novo': { status: 'concluido' } })
    expect(reset?.knownFeatures).toEqual(['feature.ajuda', 'feature.futura'])
    expect(reset?.resetAt).toBe(toIso(FIXED_NOW + 5))
    expect(reset?.extras).toEqual({ extra: 1 })
  })
})

describe('migração e downgrade', () => {
  it('estado do catálogo N (inicial concluído) lido pelo N+1 → só a feature nova', () => {
    const leitura = reread(completedInitial(), CATALOG_WITH_NEW_FEATURE)
    expect(valid(leitura).tours.inicial.status).toBe('concluido')
    expect(decide({ leitura, catalog: CATALOG_WITH_NEW_FEATURE })).toEqual({ tipo: 'anunciar', featureId: 'feature.nova' })
  })

  it('tabela v1→v2 de fixture preserva o concluido', () => {
    const v1 = serializeOnboardingState(completedInitial())
    const migrations = {
      1: (raw: Record<string, unknown>) => ({ ...raw, schemaVersion: 2, preferencias: {} }),
    }
    const v2 = migrateRaw(v1, 1, 2, migrations)
    expect(v2?.schemaVersion).toBe(2)
    expect((v2?.tours as Record<string, { status: string }>).inicial.status).toBe('concluido')
    expect(migrateRaw(v1, 1, 3, migrations)).toBeNull()
    expect(migrateRaw(v1, 1, 2, { 1: () => 'nao-objeto' })).toBeNull()
  })

  it('downgrade: feature.futura e catalogRevision 5 lidos pelo catálogo 1 → nada abre e tudo é preservado', () => {
    const raw: Record<string, unknown> = {
      ...serializeOnboardingState(completedInitial()),
      catalogRevision: 5,
      knownFeatures: ['feature.ajuda', 'feature.futura'],
      campoDeBuildNovo: true,
    }
    ;(raw.tours as Record<string, unknown>)['novidade-futura'] = { status: 'disponivel', announcedAt: ISO }
    const leitura = normalizeOnboardingState(raw)
    expect(decide({ leitura })).toEqual({ tipo: 'nada', motivo: 'sem-novidade' })

    const skipped = applyOnboardingEvent(
      valid(leitura),
      { tipo: 'PULAR', tourId: 'inicial', via: 'botao', stepId: 'projeto' },
      ctx(),
    )
    if (!skipped) throw new Error('evento não aplicado')
    const serialized = serializeOnboardingState(skipped)
    expect(serialized.catalogRevision).toBe(5)
    expect(serialized.knownFeatures).toEqual(['feature.ajuda', 'feature.futura'])
    expect(serialized.campoDeBuildNovo).toBe(true)
    expect((serialized.tours as Record<string, unknown>)['novidade-futura']).toEqual({ status: 'disponivel', announcedAt: ISO })
    // De volta ao build novo (que conhece feature.futura): nada redispara, e o
    // registro do tour dele, guardado cru pelo build antigo, volta intacto.
    const futureCatalog: OnboardingCatalog = {
      revision: 5,
      tours: {
        ...defaultOnboardingCatalog.tours,
        'novidade-futura': { ...defaultOnboardingCatalog.tours['novidade-ajuda'], id: 'novidade-futura' },
      },
      features: [
        ...defaultOnboardingCatalog.features,
        { id: 'feature.futura', tourId: 'novidade-futura', title: 'novidade.ajuda.titulo', trigger: { tipo: 'capability' } },
      ],
    }
    const upgraded = reread(skipped, futureCatalog)
    expect(decide({ leitura: upgraded, catalog: futureCatalog })).toEqual({ tipo: 'nada', motivo: 'sem-novidade' })
    expect(valid(upgraded).tours['novidade-futura']).toMatchObject({ status: 'disponivel', announcedAt: ISO })
  })
})

describe('gatilho de canvas (catálogo de fixture)', () => {
  const catalog = CATALOG_WITH_CANVAS_TRIGGER
  const state = valid(reread(completedInitial(), catalog))

  it('hidratar já com o tipo não dispara', () => {
    const hydrated = observeCanvasTypes(EMPTY_CANVAS_OBSERVATION, ['image', 'terminal'], { pronto: true, state, catalog })
    expect(hydrated.pendentes).toEqual([])
    const beforeReady = observeCanvasTypes(EMPTY_CANVAS_OBSERVATION, [], { pronto: false, state, catalog })
    const stillHydrating = observeCanvasTypes(beforeReady, ['image'], { pronto: false, state, catalog })
    expect(stillHydrating.pendentes).toEqual([])
  })

  it('a transição ao vivo de 0 para 1 bloco do tipo dispara uma vez', () => {
    let observation = observeCanvasTypes(EMPTY_CANVAS_OBSERVATION, ['terminal'], { pronto: true, state, catalog })
    observation = observeCanvasTypes(observation, ['image', 'terminal'], { pronto: true, state, catalog })
    expect(observation.pendentes).toEqual(['feature.imagem'])
    observation = observeCanvasTypes(observation, ['terminal'], { pronto: true, state, catalog })
    observation = observeCanvasTypes(observation, ['image', 'terminal'], { pronto: true, state, catalog })
    expect(observation.pendentes).toEqual(['feature.imagem'])

    const announced = applyOnboardingEvent(state, { tipo: 'ANUNCIAR', featureId: 'feature.imagem' }, ctx({ catalog }))
    let later = observeCanvasTypes(EMPTY_CANVAS_OBSERVATION, [], { pronto: true, state: announced, catalog })
    later = observeCanvasTypes(later, ['image'], { pronto: true, state: announced, catalog })
    expect(later.pendentes).toEqual([])
  })

  it('durante o tour fica pendente e é anunciada depois, em ocioso', () => {
    const pendentesCanvas = ['feature.imagem']
    expect(chooseNovelty({ fase: 'tour', state, pendentesCanvas, availability: available, catalog })).toEqual({
      tipo: 'esperar',
    })
    expect(chooseNovelty({ fase: 'aviso', state, pendentesCanvas, availability: available, catalog })).toEqual({
      tipo: 'esperar',
    })
    expect(chooseNovelty({ fase: 'ocioso', state, pendentesCanvas, availability: available, catalog })).toEqual({
      tipo: 'anunciar',
      featureId: 'feature.imagem',
    })
  })

  it('features de canvas nunca entram na linha de base', () => {
    const baseline = apply(null, [{ tipo: 'LINHA_DE_BASE' }], { catalog })
    const firstUse = apply(null, [{ tipo: 'REIVINDICAR_INICIAL' }], { catalog })
    expect(baseline?.knownFeatures).not.toContain('feature.imagem')
    expect(firstUse?.knownFeatures).not.toContain('feature.imagem')
  })

  it('a chave de tipos do canvas é ordenada e sem repetição', () => {
    expect(parseNodeTypesKey('terminal, file,terminal,,image')).toEqual(['file', 'image', 'terminal'])
    expect(parseNodeTypesKey('')).toEqual([])
  })
})

describe('describeHelpEntries (visto × disponível)', () => {
  const live = null

  it('sem estado: tutorial "Não visto" e nenhuma novidade', () => {
    const entries = describeHelpEntries(null, { live, availability: available })
    expect(entries).toEqual([
      expect.objectContaining({ tourId: 'inicial', tipo: 'tutorial', status: 'nao-visto', totalPassos: 6 }),
    ])
    expect(countNovelties(entries)).toBe(0)
  })

  it('em andamento, interrompido, pulado e concluído', () => {
    const claimed = apply(null, [{ tipo: 'REIVINDICAR_INICIAL' }])
    expect(describeHelpEntries(claimed, { live: { tourId: 'inicial', stepIndex: 2 }, availability: available })[0]).toMatchObject({
      status: 'em-andamento',
      passo: 3,
    })
    const interrupted = apply(claimed, [{ tipo: 'ABRIR', tourId: 'inicial', origem: 'ajuda', stepId: 'terminal' }])
    expect(describeHelpEntries(interrupted, { live, availability: available })[0]).toMatchObject({
      status: 'interrompido',
      passo: 4,
    })
    const skipped = apply(claimed, [{ tipo: 'PULAR', tourId: 'inicial', via: 'botao', stepId: 'agente' }])
    expect(describeHelpEntries(skipped, { live, availability: available })[0].status).toBe('pulado')
    expect(describeHelpEntries(completedInitial(), { live, availability: available })[0]).toMatchObject({
      status: 'concluido',
      concluidoEm: ISO,
    })
  })

  it('roteiro com versão nova: quem concluiu vê "Atualizado", e nada reabre', () => {
    const catalog = CATALOG_WITH_TOUR_V2
    const state = valid(reread(completedInitial(), catalog))
    expect(describeHelpEntries(state, { catalog, live, availability: available })[0].status).toBe('atualizado')
    expect(decide({ leitura: reread(state, catalog), catalog })).toEqual({ tipo: 'nada', motivo: 'sem-novidade' })
  })

  it('novidade anunciada e não vista é "Novo" e conta no badge; vista deixa de ser', () => {
    const baseline = apply(null, [{ tipo: 'LINHA_DE_BASE' }, { tipo: 'ANUNCIAR', featureId: 'feature.ajuda' }])
    const entries = describeHelpEntries(baseline, { live, availability: available })
    expect(entries[1]).toMatchObject({ tipo: 'novidade', featureId: 'feature.ajuda', status: 'novo' })
    expect(countNovelties(entries)).toBe(1)
    const seen = apply(baseline, [{ tipo: 'ABRIR', tourId: 'novidade-ajuda', origem: 'novidade' }])
    expect(countNovelties(describeHelpEntries(seen, { live, availability: available }))).toBe(0)
  })

  it('novidade cuja capability sumiu aparece como "Indisponível nesta versão"', () => {
    const catalog = CATALOG_WITH_REQUIRES
    const announced = applyOnboardingEvent(
      valid(reread(completedInitial(), catalog)),
      { tipo: 'ANUNCIAR', featureId: 'feature.condicional' },
      ctx({ catalog }),
    )
    const entries = describeHelpEntries(announced, { catalog, live, availability: () => 'indisponivel' })
    expect(entries.find((entry) => entry.featureId === 'feature.condicional')?.status).toBe('indisponivel')
  })

  it('passo com capability indisponível é omitido (T2.g)', () => {
    const tour = CATALOG_WITH_OPTIONAL_STEP.tours.inicial
    expect(visibleSteps(tour, () => 'indisponivel').map((step) => step.id)).not.toContain('ferramentas')
    expect(visibleSteps(tour, () => 'desconhecido')).toHaveLength(5)
    expect(visibleSteps(tour, () => 'disponivel')).toHaveLength(6)
  })
})

describe('sessão de retomada', () => {
  it('lê só o formato válido e ignora o resto', () => {
    const raw = serializeSessionRecord({ tourId: 'inicial', stepIndex: 2, trigger: 'ajuda' })
    expect(parseSessionRecord(raw)).toEqual({ v: 1, tourId: 'inicial', stepIndex: 2, trigger: 'ajuda' })
    for (const invalid of [
      null,
      '',
      '{',
      '[]',
      JSON.stringify({ v: 2, tourId: 'inicial', stepIndex: 0, trigger: 'ajuda' }),
      JSON.stringify({ v: 1, tourId: 'tour-inexistente', stepIndex: 0, trigger: 'ajuda' }),
      JSON.stringify({ v: 1, tourId: 'inicial', stepIndex: -1, trigger: 'ajuda' }),
      JSON.stringify({ v: 1, tourId: 'inicial', stepIndex: 1.5, trigger: 'ajuda' }),
      JSON.stringify({ v: 1, tourId: 'inicial', stepIndex: 0, trigger: 'robo' }),
    ]) {
      expect(parseSessionRecord(invalid)).toBeNull()
    }
    expect(SESSION_STORAGE_KEY).toBe('felixo:onboarding:sessao')
  })
})

describe('limites', () => {
  it('um estado típico fica muito abaixo do teto de 64 KiB', () => {
    expect(serializedByteLength(serializeOnboardingState(completedInitial()))).toBeLessThan(ONBOARDING_MAX_BYTES / 16)
  })

  it('o relógio fora do intervalo do Date não derruba a conversão', () => {
    expect(toIso(Number.NaN)).toBe('1970-01-01T00:00:00.000Z')
    expect(toIso(1e20)).toBe('1970-01-01T00:00:00.000Z')
    expect(createBaselineState('primeiro-uso', ctx({ now: Number.POSITIVE_INFINITY })).createdAt).toBe(
      '1970-01-01T00:00:00.000Z',
    )
  })
})

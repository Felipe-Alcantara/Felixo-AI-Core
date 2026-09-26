/**
 * Fixtures compartilhadas pelos testes do tutorial (só os `*.test.ts` importam
 * este módulo; nada do app depende dele). Catálogos de fixture exercitam regras
 * que o catálogo v1 ainda não usa: feature nova numa revisão seguinte, gatilho de
 * canvas, capability condicional e roteiro com versão nova.
 */
import {
  defaultOnboardingCatalog,
  type FeatureDef,
  type OnboardingCatalog,
  type TourDef,
} from './onboarding-catalog'
import type { EventContext, OnboardingBootSignals } from './onboarding-state'

export const FIXED_NOW = Date.parse('2026-09-26T12:00:00.000Z')

export const BASE_CTX: EventContext = Object.freeze({
  now: FIXED_NOW,
  appVersion: '0.1.0',
  locale: 'pt-BR',
  nodeCount: 0,
})

export const FIRST_BOOT: OnboardingBootSignals = Object.freeze({ chavesFelixo: false, marcadorPrimeiroBoot: true })
export const PREVIOUS_USE: OnboardingBootSignals = Object.freeze({ chavesFelixo: true, marcadorPrimeiroBoot: false })
/** Primeiro boot interrompido: o tema já gravou a chave dele, e o marcador continua lá. */
export const INTERRUPTED_FIRST_BOOT: OnboardingBootSignals = Object.freeze({
  chavesFelixo: true,
  marcadorPrimeiroBoot: true,
})

export const available = () => 'disponivel' as const

function noveltyTour(id: string): TourDef {
  return {
    id,
    version: 1,
    kind: 'novidade',
    title: 'tour.novidade-ajuda.titulo',
    steps: [
      {
        id: `${id}-passo`,
        title: 'passo.ajuda-novidade.titulo',
        targets: [{ anchor: 'rail-ajuda', body: 'passo.ajuda-novidade.corpo', label: 'Ajuda' }],
      },
    ],
  }
}

function extend(revision: number, tours: TourDef[], features: FeatureDef[]): OnboardingCatalog {
  return {
    revision,
    tours: { ...defaultOnboardingCatalog.tours, ...Object.fromEntries(tours.map((tour) => [tour.id, tour])) },
    features: [...defaultOnboardingCatalog.features, ...features],
  }
}

/** Revisão N+1: uma capability nova sem condição. */
export const CATALOG_WITH_NEW_FEATURE = extend(
  2,
  [noveltyTour('novidade-nova')],
  [{ id: 'feature.nova', tourId: 'novidade-nova', title: 'novidade.ajuda.titulo', trigger: { tipo: 'capability' } }],
)

/** Capability condicional (ex.: uma integração que pode não estar configurada). */
export const CATALOG_WITH_REQUIRES = extend(
  2,
  [noveltyTour('novidade-condicional')],
  [
    {
      id: 'feature.condicional',
      tourId: 'novidade-condicional',
      title: 'novidade.ajuda.titulo',
      trigger: { tipo: 'capability', requires: 'integracao' },
    },
  ],
)

/** Gatilho de canvas: o primeiro bloco de imagem ao vivo anuncia a novidade. */
export const CATALOG_WITH_CANVAS_TRIGGER = extend(
  2,
  [noveltyTour('novidade-imagem')],
  [{ id: 'feature.imagem', tourId: 'novidade-imagem', title: 'novidade.ajuda.titulo', trigger: { tipo: 'canvas', nodeType: 'image' } }],
)

/** O roteiro inicial mudou (versão 2): quem concluiu vê "Atualizado", nada reabre. */
export const CATALOG_WITH_TOUR_V2: OnboardingCatalog = {
  ...defaultOnboardingCatalog,
  tours: {
    ...defaultOnboardingCatalog.tours,
    inicial: { ...defaultOnboardingCatalog.tours.inicial, version: 2 },
  },
}

/** Um passo do inicial que depende de uma capability. */
export const CATALOG_WITH_OPTIONAL_STEP: OnboardingCatalog = {
  ...defaultOnboardingCatalog,
  tours: {
    ...defaultOnboardingCatalog.tours,
    inicial: {
      ...defaultOnboardingCatalog.tours.inicial,
      steps: defaultOnboardingCatalog.tours.inicial.steps.map((step) =>
        step.id === 'ferramentas' ? { ...step, requires: 'ferramentas-extra' } : step,
      ),
    },
  },
}

/** PRNG determinístico (mulberry32): o fuzz e as sequências aleatórias são reproduzíveis. */
export function seededRandom(seed: number): () => number {
  let state = seed | 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const FUZZ_KEYS = [
  'schemaVersion',
  'createdAt',
  'updatedAt',
  'origin',
  'appVersion',
  'catalogRevision',
  'knownFeatures',
  'resetAt',
  'tours',
  'inicial',
  'novidade-ajuda',
  'status',
  'timesShown',
  'context',
  'anchorFallbacks',
  '__proto__',
  'constructor',
  'prototype',
  'extra',
]
const FUZZ_STRINGS = [
  '',
  'concluido',
  'ativo',
  'x',
  '2026-09-26T12:00:00.000Z',
  '2026-13-45T99:00:00Z',
  'feature.ajuda',
  'feature.futura',
  'inicial',
  '1',
  'á'.repeat(200),
]
const FUZZ_NUMBERS = [0, 1, 2, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 1e20, -0]

/** Valor aleatório no formato do que pode chegar do disco ou do IPC. */
export function randomValue(random: () => number, depth = 0): unknown {
  const pick = Math.floor(random() * (depth > 3 ? 5 : 8))
  const choose = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)]
  switch (pick) {
    case 0:
      return null
    case 1:
      return choose(FUZZ_NUMBERS)
    case 2:
      return choose(FUZZ_STRINGS)
    case 3:
      return random() < 0.5
    case 4:
      return undefined
    case 5:
      return Array.from({ length: Math.floor(random() * 4) }, () => randomValue(random, depth + 1))
    default: {
      const value: Record<string, unknown> = {}
      const size = Math.floor(random() * 6)
      for (let index = 0; index < size; index++) {
        Object.defineProperty(value, choose(FUZZ_KEYS), {
          value: randomValue(random, depth + 1),
          enumerable: true,
          configurable: true,
          writable: true,
        })
      }
      if (random() < 0.6) value.schemaVersion = choose([1, 1, 1, 2, 0, '1'])
      return value
    }
  }
}

/**
 * Mutação aleatória de um valor válido: troca, remove ou acrescenta campos em
 * qualquer profundidade. Exercita os reparos de um v1 "quase certo", que é o
 * estrago mais provável no disco.
 */
export function mutateValue(random: () => number, base: unknown, depth = 0): unknown {
  if (depth > 0 && random() < 0.12) return randomValue(random, depth + 1)
  if (Array.isArray(base)) return base.map((item) => mutateValue(random, item, depth + 1))
  if (base !== null && typeof base === 'object') {
    const value: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(base)) {
      if (random() < 0.05) continue
      value[key] = mutateValue(random, item, depth + 1)
    }
    if (random() < 0.15) {
      Object.defineProperty(value, FUZZ_KEYS[Math.floor(random() * FUZZ_KEYS.length)], {
        value: randomValue(random, depth + 1),
        enumerable: true,
        configurable: true,
        writable: true,
      })
    }
    return value
  }
  return base
}

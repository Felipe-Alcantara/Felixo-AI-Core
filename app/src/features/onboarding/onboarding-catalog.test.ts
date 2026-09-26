import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { TOOL_LABELS } from '../canvas/components/tools/canvas-tool-labels'
import type { CanvasTool } from '../canvas/components/tools/CanvasToolsMenu'
import {
  ALWAYS_VISIBLE_ANCHORS,
  CANVAS_TOOL_FEATURES,
  CATALOG_HISTORY,
  ONBOARDING_ANCHORS,
  ONBOARDING_CATALOG_REVISION,
  ONBOARDING_FEATURES,
  ONBOARDING_TOURS,
  defaultOnboardingCatalog,
  type AnchorId,
  type StepDef,
  type TourDef,
} from './onboarding-catalog'
import { PT_BR, formatOnboardingMessage, type MessageKey } from './onboarding-messages'

const canvasDirectory = fileURLToPath(new URL('../canvas/components/', import.meta.url))

function readCanvasSource(file: string): string {
  return readFileSync(join(canvasDirectory, file), 'utf8')
}

function canvasSources(): string[] {
  return readdirSync(canvasDirectory, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.tsx'))
    .map((file) => readFileSync(join(canvasDirectory, file), 'utf8'))
}

const ID_PATTERN = /^[a-z][a-z0-9-]*$/
const FEATURE_PATTERN = /^feature\.[a-z][a-z0-9-]*$/
const tours: TourDef[] = Object.values(defaultOnboardingCatalog.tours)
const steps: StepDef[] = tours.flatMap((tour) => [...tour.steps])
const text = (key: MessageKey) => formatOnboardingMessage('pt-BR', key)
const contains = (haystack: string, needle: string) =>
  haystack.toLocaleLowerCase('pt-BR').includes(needle.toLocaleLowerCase('pt-BR'))

describe('catálogo do tutorial: ids e âncoras', () => {
  it('tem ids únicos e no padrão (tours, passos, features e âncoras)', () => {
    const tourIds = tours.map((tour) => tour.id)
    expect(new Set(tourIds).size).toBe(tourIds.length)
    for (const [key, tour] of Object.entries(defaultOnboardingCatalog.tours)) {
      expect(tour.id).toBe(key)
      expect(tour.id).toMatch(ID_PATTERN)
      const stepIds = tour.steps.map((step) => step.id)
      expect(new Set(stepIds).size).toBe(stepIds.length)
      for (const id of stepIds) expect(id).toMatch(ID_PATTERN)
    }
    const featureIds = ONBOARDING_FEATURES.map((feature) => feature.id)
    expect(new Set(featureIds).size).toBe(featureIds.length)
    for (const id of featureIds) expect(id).toMatch(FEATURE_PATTERN)
    for (const id of Object.keys(ONBOARDING_ANCHORS)) expect(id).toMatch(ID_PATTERN)
  })

  it('toda âncora usada existe, e toda cadeia termina numa âncora sempre visível', () => {
    for (const step of steps) {
      expect(step.targets.length).toBeGreaterThan(0)
      for (const target of step.targets) expect(Object.hasOwn(ONBOARDING_ANCHORS, target.anchor)).toBe(true)
      const last = step.targets[step.targets.length - 1]
      expect(ALWAYS_VISIBLE_ANCHORS).toContain(last.anchor)
    }
  })

  it('cada seletor aponta o atributo estável da âncora (o canvas usa a própria região)', () => {
    for (const [id, selector] of Object.entries(ONBOARDING_ANCHORS) as Array<[AnchorId, string]>) {
      if (id === 'canvas') expect(selector).toBe('[data-felixo-region="canvas"]')
      else expect(selector).toBe(`[data-felixo-tour-anchor="${id}"]`)
    }
  })
})

describe('catálogo do tutorial: textos', () => {
  it('toda chave de mensagem usada existe em pt-BR', () => {
    const keys: MessageKey[] = [
      ...tours.map((tour) => tour.title),
      ...ONBOARDING_FEATURES.map((feature) => feature.title),
      ...steps.flatMap((step) => [step.title, ...step.targets.map((target) => target.body)]),
    ]
    for (const key of keys) expect(Object.hasOwn(PT_BR, key)).toBe(true)
  })

  it('o corpo de cada alvo cita o rótulo acessível real desse alvo', () => {
    for (const step of steps) {
      for (const target of step.targets) {
        expect(target.label.trim()).not.toBe('')
        expect(contains(text(target.body), target.label), `${step.id} → ${target.anchor}`).toBe(true)
      }
    }
  })

  it('as ferramentas citadas existem em TOOL_LABELS e aparecem pelo nome em todo corpo do passo', () => {
    const citing = steps.filter((step) => step.citaFerramentas?.length)
    expect(citing.length).toBeGreaterThan(0)
    for (const step of citing) {
      for (const tool of step.citaFerramentas ?? []) {
        expect(Object.hasOwn(TOOL_LABELS, tool)).toBe(true)
        for (const target of step.targets) expect(text(target.body)).toContain(TOOL_LABELS[tool])
      }
    }
  })

  it('nenhuma âncora, chave ou texto do tutorial leva ao chat (T2.d)', () => {
    const everything = [
      ...Object.keys(ONBOARDING_ANCHORS),
      ...Object.values(ONBOARDING_ANCHORS),
      ...tours.flatMap((tour) => [tour.id, tour.title, text(tour.title)]),
      ...ONBOARDING_FEATURES.flatMap((feature) => [feature.id, feature.title, text(feature.title)]),
      ...steps.flatMap((step) => [
        step.id,
        step.title,
        text(step.title),
        ...step.targets.flatMap((target) => [target.anchor, target.body, target.label, text(target.body)]),
      ]),
    ]
    for (const item of everything) expect(item).not.toMatch(/chat/i)
  })

  it('nenhum passo tem campo de ação: o tour só destaca, nunca clica nem cria nada', () => {
    const allowedStep = new Set(['id', 'title', 'targets', 'requires', 'citaFerramentas'])
    const allowedTarget = new Set(['anchor', 'body', 'label', 'side'])
    for (const step of steps) {
      for (const key of Object.keys(step)) expect(allowedStep.has(key), `${step.id}.${key}`).toBe(true)
      for (const target of step.targets) {
        for (const key of Object.keys(target)) expect(allowedTarget.has(key), `${step.id}.${key}`).toBe(true)
      }
    }
  })

  it('o passo do agente aponta a moldura, nunca a metade que lança a CLI', () => {
    const agente = ONBOARDING_TOURS.inicial.steps.find((step) => step.id === 'agente')
    expect(agente?.targets[0].anchor).toBe('criar-agente')
    expect(ONBOARDING_ANCHORS['criar-agente']).toBe('[data-felixo-tour-anchor="criar-agente"]')
    // No código, o atributo está na moldura (div) do controle dividido, não num botão.
    expect(readCanvasSource('TerminalMenu.tsx')).toMatch(
      /<div\s+className="[^"]*felixo-sidebar-agent-trigger[^"]*"\s+data-felixo-tour-anchor="criar-agente"/,
    )
  })

  it('toda âncora do catálogo está marcada no código da interface do canvas', () => {
    const sources = canvasSources().join('\n')
    const missing = (Object.keys(ONBOARDING_ANCHORS) as AnchorId[])
      .filter((anchor) => anchor !== 'canvas')
      .filter((anchor) => !new RegExp(`(tourAnchor|anchorId|data-felixo-tour-anchor)="${anchor}"`).test(sources))
    expect(missing).toEqual([])
    expect(sources).toContain('data-felixo-region="canvas"')
  })

  it('o roteiro inicial tem os 6 passos na ordem do plano', () => {
    expect(ONBOARDING_TOURS.inicial.steps.map((step) => step.id)).toEqual([
      'projeto',
      'agente',
      'contexto',
      'terminal',
      'ferramentas',
      'ajuda',
    ])
  })
})

describe('catálogo do tutorial: features e livro de versões', () => {
  it('toda feature tem um tour existente com pelo menos um passo', () => {
    for (const feature of ONBOARDING_FEATURES) {
      const tour = Object.hasOwn(defaultOnboardingCatalog.tours, feature.tourId)
        ? defaultOnboardingCatalog.tours[feature.tourId]
        : undefined
      expect(tour, feature.id).toBeDefined()
      expect(tour?.steps.length).toBeGreaterThan(0)
    }
  })

  it('os ids atuais são a união do histórico, e a última revisão é a atual', () => {
    const revisions = CATALOG_HISTORY.map((entry) => entry.revision)
    expect(revisions).toEqual([...revisions].sort((a, b) => a - b))
    expect(new Set(revisions).size).toBe(revisions.length)
    expect(revisions[revisions.length - 1]).toBe(ONBOARDING_CATALOG_REVISION)
    expect(defaultOnboardingCatalog.revision).toBe(ONBOARDING_CATALOG_REVISION)

    const historyTours = new Set(CATALOG_HISTORY.flatMap((entry) => [...entry.tours]))
    const historyFeatures = new Set(CATALOG_HISTORY.flatMap((entry) => [...entry.features]))
    expect([...historyTours].sort()).toEqual(Object.keys(defaultOnboardingCatalog.tours).sort())
    expect([...historyFeatures].sort()).toEqual(ONBOARDING_FEATURES.map((feature) => feature.id).sort())
  })

  it('nenhum id sai de uma revisão para a seguinte (aposentar é retired: true)', () => {
    for (let index = 1; index < CATALOG_HISTORY.length; index++) {
      const previous: readonly string[] = [...CATALOG_HISTORY[index - 1].tours, ...CATALOG_HISTORY[index - 1].features]
      const current: readonly string[] = [...CATALOG_HISTORY[index].tours, ...CATALOG_HISTORY[index].features]
      for (const id of previous) expect(current).toContain(id)
    }
  })

  it('CANVAS_TOOL_FEATURES cobre toda ferramenta do canvas, e toda feature citada existe', () => {
    const tools = Object.keys(TOOL_LABELS) as CanvasTool[]
    expect(Object.keys(CANVAS_TOOL_FEATURES).sort()).toEqual([...tools].sort())
    const featureIds: readonly string[] = ONBOARDING_FEATURES.map((feature) => feature.id)
    for (const value of Object.values(CANVAS_TOOL_FEATURES) as string[]) {
      if (value !== 'base') expect(featureIds).toContain(value)
    }
  })
})

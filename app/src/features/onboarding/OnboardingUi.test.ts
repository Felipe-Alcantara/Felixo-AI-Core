import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ONBOARDING_TOURS, type StepDef } from './onboarding-catalog'
import type { MessageKey } from './onboarding-messages'
import type { NoticeSession, TourSession } from './onboarding-store'
import {
  describeNotice,
  describeNoticeAnnouncement,
  describeTourAnnouncement,
  describeTourCard,
  stepTargetFor,
} from './onboarding-ui-model'
import { OnboardingNotice } from './OnboardingNotice'
import { OnboardingTourCard } from './OnboardingTourCard'

/**
 * U-ui: marcação estática dos componentes apresentacionais (sem portal e sem
 * DOM), por passo e por locale. Nenhum assert depende de coordenada.
 */

const INITIAL_STEPS = ONBOARDING_TOURS.inicial.steps as readonly StepDef[]

function tourAt(stepIndex: number, lang = 'pt-BR', overrides: Partial<TourSession> = {}): TourSession {
  return {
    tourId: 'inicial',
    titulo: ONBOARDING_TOURS.inicial.title,
    lang,
    stepIndex,
    passos: INITIAL_STEPS,
    trigger: 'ajuda',
    foco: 'mover',
    ancora: null,
    instancia: 7,
    falhaForcada: false,
    ...overrides,
  }
}

function renderCard(tour: TourSession): string {
  const model = describeTourCard(tour)
  if (!model) throw new Error('passo inexistente')
  return renderToStaticMarkup(createElement(OnboardingTourCard, { model }))
}

function attribute(html: string, name: string): string | null {
  return new RegExp(`${name}="([^"]*)"`).exec(html)?.[1] ?? null
}

function ids(html: string): Set<string> {
  return new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]))
}

describe('card do tutorial (por passo × locale)', () => {
  for (const lang of ['pt-BR', 'en-XA']) {
    INITIAL_STEPS.forEach((step, index) => {
      it(`${lang} · passo ${index + 1} (${step.id})`, () => {
        const html = renderCard(tourAt(index, lang))
        expect(attribute(html, 'role')).toBe('dialog')
        expect(attribute(html, 'aria-modal')).toBe('false')
        expect(attribute(html, 'lang')).toBe(lang)
        expect(attribute(html, 'tabindex')).toBe('-1')
        expect(attribute(html, 'class')).toContain('nokey')
        expect(attribute(html, 'data-felixo-popover-surface')).toBe('true')
        expect(attribute(html, 'data-felixo-onboarding')).toBe('card')
        expect(attribute(html, 'data-passo')).toBe(step.id)
        expect(attribute(html, 'data-instancia')).toBe('7')

        // labelledby e describedby apontam para ids que existem no próprio card.
        const present = ids(html)
        for (const reference of [
          ...(attribute(html, 'aria-labelledby') ?? '').split(' '),
          ...(attribute(html, 'aria-describedby') ?? '').split(' '),
        ]) {
          expect(present.has(reference)).toBe(true)
        }

        // Snapshot sem coordenadas: nenhuma posição inline; sem corte de texto.
        expect(html).not.toMatch(/style="[^"]*(top|left|transform)/)
        expect(html).not.toMatch(/truncate|line-clamp/)

        // Três botões, na ordem de foco: Pular, Voltar, Próximo/Concluir.
        const actions = [...html.matchAll(/data-felixo-onboarding-action="([^"]+)"/g)].map((match) => match[1])
        expect(actions).toEqual(['pular', 'voltar', index === INITIAL_STEPS.length - 1 ? 'concluir' : 'proximo'])
      })
    })
  }

  it('passo 1 de 6: contador, Voltar com aria-disabled e nunca fora do DOM', () => {
    const html = renderCard(tourAt(0))
    expect(html).toContain('Passo 1 de 6')
    expect(html).toMatch(/aria-disabled="true"[^>]*data-felixo-onboarding-action="voltar"|data-felixo-onboarding-action="voltar"[^>]*aria-disabled="true"/)
    expect(html).toContain('Voltar')
  })

  it('passos do meio: Voltar habilitado e Próximo', () => {
    const html = renderCard(tourAt(2))
    expect(html).toContain('Passo 3 de 6')
    expect(html).not.toContain('aria-disabled')
    expect(html).toContain('Próximo')
  })

  it('último passo: Concluir no mesmo botão', () => {
    const html = renderCard(tourAt(INITIAL_STEPS.length - 1))
    expect(html).toContain('Passo 6 de 6')
    expect(html).toContain('Concluir')
    expect(html).not.toContain('Próximo')
  })

  it('o título do tour e o do passo rotulam o diálogo', () => {
    const html = renderCard(tourAt(1))
    expect(html).toContain('Tutorial do canvas')
    expect(html).toMatch(/<h2[^>]*>Agente<\/h2>/)
  })

  it('o texto acompanha o alvo resolvido e cita o rótulo dele', () => {
    const step = INITIAL_STEPS[1]
    for (const target of step.targets) {
      const html = renderCard(tourAt(1, 'pt-BR', { ancora: target.anchor }))
      expect(attribute(html, 'data-ancora')).toBe(target.anchor)
      expect(html).toContain(target.label)
      expect(stepTargetFor(step, target.anchor)).toBe(target)
    }
    expect(stepTargetFor(step, null)).toBe(step.targets[0])
  })

  it('idioma sem catálogo cai inteiro em pt-BR, e o lang não mente', () => {
    const html = renderCard(tourAt(0, 'en-US'))
    expect(attribute(html, 'lang')).toBe('pt-BR')
    expect(html).toContain('Passo 1 de 6')
  })

  it('en-XA expande o texto e mantém o card inteiro no mesmo idioma', () => {
    const model = describeTourCard(tourAt(0, 'en-XA'))
    expect(model?.lang).toBe('en-XA')
    for (const text of [model?.tourTitle, model?.stepTitle, model?.body, model?.counter, model?.skipLabel]) {
      expect(text?.startsWith('[')).toBe(true)
    }
  })

  it('mini-tour da novidade: um passo, Concluir direto', () => {
    const tour = tourAt(0, 'pt-BR', {
      tourId: 'novidade-ajuda',
      titulo: ONBOARDING_TOURS['novidade-ajuda'].title,
      passos: ONBOARDING_TOURS['novidade-ajuda'].steps as readonly StepDef[],
      trigger: 'novidade',
    })
    const html = renderCard(tour)
    expect(html).toContain('Novidade: Ajuda')
    expect(html).toContain('Passo 1 de 1')
    expect(html).toContain('Concluir')
  })
})

describe('aviso de novidade', () => {
  const aviso: NoticeSession = {
    featureId: 'feature.ajuda',
    tourId: 'novidade-ajuda',
    titulo: 'novidade.ajuda.titulo' as MessageKey,
    lang: 'pt-BR',
  }

  it('region rotulada, com lang, sem foco automático e sem timer', () => {
    const html = renderToStaticMarkup(createElement(OnboardingNotice, { model: describeNotice(aviso) }))
    expect(attribute(html, 'role')).toBe('region')
    expect(attribute(html, 'aria-label')).toBe('Novidade')
    expect(attribute(html, 'lang')).toBe('pt-BR')
    expect(attribute(html, 'data-felixo-onboarding')).toBe('aviso')
    expect(html.toLowerCase()).not.toContain('autofocus')
    expect(html).toContain('Novidade: Ajuda')
    const actions = [...html.matchAll(/data-felixo-onboarding-action="([^"]+)"/g)].map((match) => match[1])
    expect(actions).toEqual(['ver', 'agora-nao'])
    expect(html).not.toMatch(/style="/)
  })

  it('em en-XA o aviso inteiro troca de idioma', () => {
    const model = describeNotice({ ...aviso, lang: 'en-XA' })
    expect(model.lang).toBe('en-XA')
    expect(model.titulo.startsWith('[')).toBe(true)
  })
})

describe('anúncios da região live', () => {
  it('troca de passo, abertura sem foco, retomada, conclusão e fechamento', () => {
    expect(describeTourAnnouncement('passo', tourAt(1))).toEqual({ texto: 'Passo 2 de 6: Agente', lang: 'pt-BR' })
    expect(describeTourAnnouncement('aberto-sem-foco', tourAt(0)).texto).toBe(
      'Tutorial do canvas aberto ao lado da barra lateral. Passo 1 de 6: Projeto.',
    )
    expect(describeTourAnnouncement('retomado', tourAt(2)).texto).toBe('Tutorial retomado no passo 3 de 6: Contexto.')
    expect(describeTourAnnouncement('concluido', tourAt(5)).texto).toBe('Tutorial concluído. Reabra em Ajuda.')
    expect(describeTourAnnouncement('fechado', tourAt(3)).texto).toBe('Tutorial fechado. Reabra em Ajuda.')
  })

  it('novidade anunciada com o título da feature', () => {
    const aviso: NoticeSession = {
      featureId: 'feature.ajuda',
      tourId: 'novidade-ajuda',
      titulo: 'novidade.ajuda.titulo' as MessageKey,
      lang: 'pt-BR',
    }
    expect(describeNoticeAnnouncement(aviso)).toEqual({ texto: 'Novidade em Ajuda: Ajuda.', lang: 'pt-BR' })
  })

  it('o anúncio em en-XA leva o lang do pseudo-locale', () => {
    expect(describeTourAnnouncement('passo', tourAt(1, 'en-XA')).lang).toBe('en-XA')
  })
})

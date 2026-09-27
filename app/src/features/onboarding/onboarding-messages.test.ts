import { describe, expect, it } from 'vitest'
import { defaultOnboardingCatalog } from './onboarding-catalog'
import {
  DEFAULT_LOCALE_CATALOGS,
  PT_BR,
  formatOnboardingMessage,
  pseudoLocalize,
  resolveCardLocale,
  resolveOnboardingLocale,
  type LocaleCatalogs,
  type MessageKey,
} from './onboarding-messages'

const TITLE_BUDGET = 32
const BODY_BUDGET = 240

/** Um locale parcial de fixture: só duas chaves traduzidas. */
const PARTIAL: LocaleCatalogs = {
  ...DEFAULT_LOCALE_CATALOGS,
  'es-ES': { 'card.voltar': 'Atrás', 'card.proximo': 'Siguiente' },
}

describe('mensagens do tutorial: formatação', () => {
  it('troca os placeholders e deixa intacto o que não tem parâmetro', () => {
    expect(formatOnboardingMessage('pt-BR', 'card.contador', { n: 2, m: 6 })).toBe('Passo 2 de 6')
    expect(formatOnboardingMessage('pt-BR', 'anuncio.passo', { n: 2, m: 6, titulo: 'Agente' })).toBe(
      'Passo 2 de 6: Agente',
    )
    expect(formatOnboardingMessage('pt-BR', 'card.contador', { n: 1 })).toBe('Passo 1 de {m}')
  })

  it('escolhe o plural pt-BR pelo Intl.PluralRules com 0, 1 e 2', () => {
    // No pt (CLDR), 0 e 1 são "one"; 2 é "other".
    expect(formatOnboardingMessage('pt-BR', 'ajuda.botao-novidades', { n: 0 })).toBe('Ajuda (0 novidade)')
    expect(formatOnboardingMessage('pt-BR', 'ajuda.botao-novidades', { n: 1 })).toBe('Ajuda (1 novidade)')
    expect(formatOnboardingMessage('pt-BR', 'ajuda.botao-novidades', { n: 2 })).toBe('Ajuda (2 novidades)')
  })
})

describe('mensagens do tutorial: locale', () => {
  it('en-US, fr e lang vazio caem em pt-BR; pt vira pt-BR; en-XA é reconhecido', () => {
    expect(resolveOnboardingLocale('en-US')).toBe('pt-BR')
    expect(resolveOnboardingLocale('fr')).toBe('pt-BR')
    expect(resolveOnboardingLocale('')).toBe('pt-BR')
    expect(resolveOnboardingLocale(null)).toBe('pt-BR')
    expect(resolveOnboardingLocale('pt')).toBe('pt-BR')
    expect(resolveOnboardingLocale('PT-br')).toBe('pt-BR')
    expect(resolveOnboardingLocale('en-XA')).toBe('en-XA')
  })

  it('resolveCardLocale é tudo ou nada: basta faltar uma chave para o card inteiro usar pt-BR', () => {
    expect(resolveCardLocale('es-ES', ['card.voltar', 'card.proximo'], PARTIAL)).toBe('es-ES')
    expect(resolveCardLocale('es-ES', ['card.voltar', 'card.proximo', 'card.pular'], PARTIAL)).toBe('pt-BR')
    expect(resolveCardLocale('fr', ['card.voltar'], PARTIAL)).toBe('pt-BR')
    expect(resolveCardLocale('en-XA', Object.keys(PT_BR) as MessageKey[])).toBe('en-XA')
  })

  it('uma chave ausente num locale parcial usa o texto pt-BR', () => {
    expect(formatOnboardingMessage('es-ES', 'card.voltar', {}, PARTIAL)).toBe('Atrás')
    expect(formatOnboardingMessage('es-ES', 'card.pular', {}, PARTIAL)).toBe('Pular tutorial')
    expect(formatOnboardingMessage('fr', 'card.pular', {}, PARTIAL)).toBe('Pular tutorial')
  })
})

describe('mensagens do tutorial: pseudo-locale en-XA', () => {
  it('expande pelo menos 30% e preserva os placeholders', () => {
    for (const key of Object.keys(PT_BR) as MessageKey[]) {
      const original = PT_BR[key]
      const forms = typeof original === 'string' ? [original] : [original.one, original.other]
      for (const form of forms) {
        const pseudo = pseudoLocalize(form)
        expect(pseudo.length, key).toBeGreaterThanOrEqual(Math.ceil(form.length * 1.3))
        const placeholders = form.match(/\{[A-Za-z][A-Za-z0-9]*\}/g) ?? []
        for (const placeholder of placeholders) expect(pseudo).toContain(placeholder)
      }
    }
  })

  it('formata en-XA com parâmetros e plural', () => {
    const counter = formatOnboardingMessage('en-XA', 'card.contador', { n: 2, m: 6 })
    expect(counter).toContain('2')
    expect(counter).toContain('6')
    expect(counter).not.toContain('{n}')
    expect(counter).not.toBe('Passo 2 de 6')
    expect(formatOnboardingMessage('en-XA', 'ajuda.botao-novidades', { n: 2 })).not.toContain('{n}')
  })

  it('é determinístico', () => {
    expect(pseudoLocalize('Passo {n} de {m}')).toBe(pseudoLocalize('Passo {n} de {m}'))
  })
})

describe('mensagens do tutorial: o que os passos afirmam', () => {
  it('o passo final só afirma o que o tutorial garante, não o estado do app', () => {
    // A pessoa pode criar um agente com o tour aberto (T1.d): "nada foi criado" ficaria falso.
    const corpo = formatOnboardingMessage('pt-BR', 'passo.ajuda.corpo')
    expect(corpo).toContain('O tutorial não criou nada nem abriu agentes.')
    expect(corpo).toContain('Ajuda')
    for (const key of Object.keys(PT_BR).filter((item) => item.startsWith('passo.')) as MessageKey[]) {
      expect(formatOnboardingMessage('pt-BR', key), key).not.toMatch(/nada foi criado|nenhum agente foi aberto/i)
    }
  })
})

describe('mensagens do tutorial: orçamento de texto (T3.b)', () => {
  const tours = Object.values(defaultOnboardingCatalog.tours)

  it(`títulos de tour, feature e passo têm até ${TITLE_BUDGET} caracteres`, () => {
    const titles: MessageKey[] = [
      ...tours.map((tour) => tour.title),
      ...defaultOnboardingCatalog.features.map((feature) => feature.title),
      ...tours.flatMap((tour) => tour.steps.map((step) => step.title)),
    ]
    for (const key of titles) {
      expect(formatOnboardingMessage('pt-BR', key).length, key).toBeLessThanOrEqual(TITLE_BUDGET)
    }
  })

  it(`o corpo de cada alvo tem até ${BODY_BUDGET} caracteres`, () => {
    for (const tour of tours) {
      for (const step of tour.steps) {
        for (const target of step.targets) {
          expect(formatOnboardingMessage('pt-BR', target.body).length, target.body).toBeLessThanOrEqual(BODY_BUDGET)
        }
      }
    }
  })
})

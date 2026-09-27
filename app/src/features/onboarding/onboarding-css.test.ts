import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * U-css: as regras do tutorial no index.css. O tour não anima (reduced motion e
 * HD 520), usa rem (cresce com a fonte), tem foco visível na própria classe
 * (no Tailwind 4 o CSS próprio fica fora de camada) e override de alto contraste
 * e de forced-colors.
 */

type CssRule = { selector: string; declarations: Map<string, string>; context: string[] }

/** Leitor mínimo de CSS: regras com seletor, declarações e os at-rules que as envolvem. */
function parseCss(source: string): CssRule[] {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, '')
  const rules: CssRule[] = []
  const stack: string[] = []
  let buffer = ''
  for (const char of text) {
    if (char === '{') {
      stack.push(buffer.split(';').pop()?.trim() ?? '')
      buffer = ''
    } else if (char === '}') {
      const header = stack.pop() ?? ''
      if (!header.startsWith('@')) {
        const declarations = new Map<string, string>()
        for (const part of buffer.split(';')) {
          const colon = part.indexOf(':')
          if (colon > 0) declarations.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim())
        }
        rules.push({ selector: header.replace(/\s+/g, ' '), declarations, context: [...stack] })
      }
      buffer = ''
    } else {
      buffer += char
    }
  }
  return rules
}

const css = readFileSync(new URL('../../index.css', import.meta.url), 'utf8')
const rules = parseCss(css)
const onboardingRules = rules.filter((rule) => rule.selector.includes('.felixo-onboarding'))

function find(selector: string, context?: RegExp): CssRule[] {
  return onboardingRules.filter(
    (rule) =>
      rule.selector.split(',').some((part) => part.trim() === selector) &&
      (context ? rule.context.some((item) => context.test(item)) : rule.context.every((item) => item.startsWith('@layer'))),
  )
}

describe('CSS do tutorial', () => {
  it('o leitor enxerga as regras do tutorial', () => {
    expect(onboardingRules.length).toBeGreaterThan(10)
  })

  it('nenhuma regra .felixo-onboarding-* anima nem transiciona (só `none`)', () => {
    const offenders = onboardingRules.flatMap((rule) =>
      [...rule.declarations]
        .filter(([property]) => /^(animation|transition)(-|$)/.test(property))
        .filter(([, value]) => value !== 'none')
        .map(([property, value]) => `${rule.selector} { ${property}: ${value} }`),
    )
    expect(offenders).toEqual([])
  })

  it('sem blur, filtro ou escurecimento da tela', () => {
    const offenders = onboardingRules.flatMap((rule) =>
      [...rule.declarations.keys()]
        .filter((property) => /^(backdrop-filter|filter|will-change)$/.test(property))
        .map((property) => `${rule.selector}: ${property}`),
    )
    expect(offenders).toEqual([])
  })

  it('tamanhos de fonte em rem (crescem com a fonte do sistema e o zoom)', () => {
    const sizes = onboardingRules.flatMap((rule) => (rule.declarations.has('font-size') ? [rule.declarations.get('font-size')] : []))
    expect(sizes.length).toBeGreaterThan(3)
    for (const size of sizes) expect(size).toMatch(/^\d*\.?\d+rem$/)
  })

  it('foco visível no CSS da própria classe (card, corpo rolável e botões)', () => {
    for (const selector of [
      '.felixo-onboarding-card:focus-visible',
      '.felixo-onboarding-card__body:focus-visible',
      '.felixo-onboarding-button:focus-visible',
    ]) {
      const [rule] = find(selector)
      expect(rule, selector).toBeDefined()
      expect(rule.declarations.get('outline')).toMatch(/^2px solid /)
    }
  })

  it('botões com altura mínima de 2rem e texto que quebra em vez de cortar', () => {
    const [button] = find('.felixo-onboarding-button')
    expect(button.declarations.get('min-height')).toBe('2rem')
    expect(button.declarations.get('white-space')).toBe('normal')
    const [card] = find('.felixo-onboarding-card')
    expect(card.declarations.get('overflow-wrap')).toBe('anywhere')
    const [body] = find('.felixo-onboarding-card__body')
    expect(body.declarations.get('overflow')).toBe('auto')
    expect(body.declarations.get('min-height')).toBe('0')
  })

  it('o card fica invisível até ser posicionado (sem piscar)', () => {
    const [rule] = find('.felixo-onboarding-card:not([data-modo])')
    expect(rule.declarations.get('visibility')).toBe('hidden')
  })

  it('camadas pelos tokens de z, entre os toasts (50) e os diálogos (60)', () => {
    expect(css).toMatch(/--felixo-z-onboarding-ring:\s*54;/)
    expect(css).toMatch(/--felixo-z-onboarding:\s*55;/)
    expect(find('.felixo-onboarding-card')[0].declarations.get('z-index')).toBe('var(--felixo-z-onboarding)')
    expect(find('.felixo-onboarding-ring')[0].declarations.get('z-index')).toBe('var(--felixo-z-onboarding-ring)')
  })

  it('alto contraste: fundo preto, texto e borda brancos', () => {
    const [rule] = find(":root[data-theme='high_contrast'] .felixo-onboarding-card")
    expect(rule.declarations.get('background')).toBe('#000')
    expect(rule.declarations.get('color')).toBe('#fff')
    expect(rule.declarations.get('border-color')).toBe('#fff')
  })

  it('forced-colors: borda CanvasText e anel Highlight', () => {
    const [card] = find('.felixo-onboarding-card', /forced-colors:\s*active/)
    expect(card.declarations.get('border')).toContain('CanvasText')
    const [ring] = find('.felixo-onboarding-ring', /forced-colors:\s*active/)
    expect(ring.declarations.get('outline-color')).toBe('Highlight')
  })

  it('a classe do tour está nos dois cortes de movimento: reduced motion e Modo Performance', () => {
    for (const selector of ['.felixo-onboarding-card', '.felixo-onboarding-ring', '.felixo-onboarding-notice']) {
      const [reduced] = find(selector, /prefers-reduced-motion:\s*reduce/)
      expect(reduced, `reduced motion: ${selector}`).toBeDefined()
      expect(reduced.declarations.get('animation')).toBe('none')
      expect(reduced.declarations.get('transition')).toBe('none')
      const [performance] = find(`:root[data-performance-mode='on'] ${selector}`)
      expect(performance, `Modo Performance: ${selector}`).toBeDefined()
      expect(performance.declarations.get('animation')).toBe('none')
      expect(performance.declarations.get('transition')).toBe('none')
    }
  })
})

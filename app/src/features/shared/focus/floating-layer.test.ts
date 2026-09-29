import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  FLOATING_LAYER_ATTRIBUTE,
  FLOATING_LAYER_SELECTOR,
  TRANSIENT_FOCUS_ATTRIBUTE,
  TRANSIENT_FOCUS_SELECTOR,
} from './floating-layer'

function source(relativeToSrc: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../${relativeToSrc}`, import.meta.url)), 'utf8')
}

/**
 * A marca vai no JSX, e a suíte roda sem DOM: sem esta trava, tirar a marca
 * de um overlay deixaria os testes verdes, e só o smoke veria a gaveta do
 * terminal fechando no clique (a revisão provou a mutação viva).
 */
describe('camada flutuante', () => {
  it('seletor e atributo são o mesmo nome', () => {
    expect(FLOATING_LAYER_SELECTOR).toBe(`[${FLOATING_LAYER_ATTRIBUTE}]`)
    expect(TRANSIENT_FOCUS_SELECTOR).toBe(`[${TRANSIENT_FOCUS_ATTRIBUTE}]`)
  })

  it('o menu de link é foco passageiro; o cartão de pedido não (ele fica na tela)', () => {
    expect(source('features/shared/links/LinkChooserHost.tsx')).toContain(TRANSIENT_FOCUS_ATTRIBUTE)
    expect(source('features/canvas/components/AgentBrowserRequestCard.tsx')).not.toContain(TRANSIENT_FOCUS_ATTRIBUTE)
  })

  it.each([
    'features/shared/links/LinkChooserHost.tsx',
    'features/canvas/components/AgentBrowserRequestCard.tsx',
  ])('%s marca o elemento em que a pessoa clica', (file) => {
    expect(source(file)).toContain(FLOATING_LAYER_ATTRIBUTE)
  })
})

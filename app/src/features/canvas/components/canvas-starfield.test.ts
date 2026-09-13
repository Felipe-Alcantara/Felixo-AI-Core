import { describe, expect, it } from 'vitest'
import {
  STARFIELD_SPREAD,
  STARFIELD_TILE,
  STAR_LAYERS,
  createStarField,
  createStarFieldStyleSheet,
} from './canvas-starfield'

const [farLayer] = STAR_LAYERS

describe('createStarField', () => {
  it('is stable across calls, so the sky never reshuffles between launches', () => {
    expect(createStarField(farLayer)).toBe(createStarField(farLayer))
  })

  it('emits exactly one shadow per star', () => {
    expect(createStarField(farLayer).split('px rgba').length - 1).toBe(farLayer.count)
  })

  it('keeps every star inside the tile it loops over', () => {
    const coordinates = [...createStarField(farLayer).matchAll(/(\d+)px (\d+)px/g)]
    expect(coordinates).toHaveLength(farLayer.count)
    for (const [, x, y] of coordinates) {
      expect(Number(x)).toBeLessThanOrEqual(STARFIELD_SPREAD)
      expect(Number(y)).toBeLessThanOrEqual(STARFIELD_TILE)
    }
  })

  it('gives each layer a different field', () => {
    const fields = STAR_LAYERS.map((layer) => createStarField(layer))
    expect(new Set(fields).size).toBe(STAR_LAYERS.length)
  })
})

describe('createStarFieldStyleSheet', () => {
  it('styles the element and its looping clone from the same shadow list', () => {
    const sheet = createStarFieldStyleSheet([farLayer])
    expect(sheet).toContain(`.felixo-ambient-stars.layer-${farLayer.id}::after`)
    expect(sheet).toContain(`animation-duration: ${farLayer.duration}`)
    expect(sheet).toContain(`width: ${farLayer.size}px`)
  })
})

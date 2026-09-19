import { describe, expect, it } from 'vitest'
import {
  FRAME_COLORS,
  FRAME_COLOR_LABELS,
  FRAME_COLOR_SWATCHES,
  frameClassName,
  readFrameColor,
} from './frame-colors'

describe('frame-colors', () => {
  it('toda cor da paleta tem rótulo e amostra', () => {
    for (const color of FRAME_COLORS) {
      expect(FRAME_COLOR_LABELS[color]).toBeTruthy()
      expect(FRAME_COLOR_SWATCHES[color]).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('readFrameColor aceita só tokens da paleta', () => {
    expect(readFrameColor('sky')).toBe('sky')
    expect(readFrameColor('#ff0000')).toBeUndefined()
    expect(readFrameColor('purple')).toBeUndefined()
    expect(readFrameColor(undefined)).toBeUndefined()
    expect(readFrameColor(3)).toBeUndefined()
  })

  it('frameClassName devolve a classe do token e nada para valor desconhecido', () => {
    expect(frameClassName('rose')).toBe('felixo-frame felixo-frame-rose')
    expect(frameClassName('desconhecida')).toBeUndefined()
    expect(frameClassName(undefined)).toBeUndefined()
  })
})

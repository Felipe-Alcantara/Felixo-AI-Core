import { describe, expect, it } from 'vitest'
import { isCanvasProfilerEnabled } from './canvas-performance-profiler.ts'

describe('ativação do Profiler do canvas', () => {
  it('fica desligado por padrão e aceita somente o opt-in explícito', () => {
    expect(isCanvasProfilerEnabled('')).toBe(false)
    expect(isCanvasProfilerEnabled('?canvas-profiler=0')).toBe(false)
    expect(isCanvasProfilerEnabled('?canvas-profiler=1')).toBe(true)
    expect(isCanvasProfilerEnabled('?other=1&canvas-profiler=1')).toBe(true)
  })
})

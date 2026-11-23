import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const lerFonte = (arquivo: string) => readFileSync(join(__dirname, arquivo), 'utf8')

describe('aviso de pouco espaço', () => {
  it('fica acima do painel de ferramenta, que nasce no mesmo canto', () => {
    const aviso = lerFonte('CanvasView.tsx').match(/data-canvas-layout-warning\s+className="[^"]*\babsolute top-16 z-(\d+)\b/)
    const painel = [...lerFonte('tools/CanvasPanel.tsx').matchAll(/\bz-(\d+)\b/g)].map((m) => Number(m[1]))
    expect(aviso).not.toBeNull()
    expect(Number(aviso?.[1])).toBeGreaterThan(Math.max(...painel))
  })
})

describe('pílula de zoom', () => {
  it('Enquadrar usa a área útil (callback do canvas), não o fitView direto', () => {
    const pilula = lerFonte('CanvasZoomPill.tsx')
    expect(pilula).not.toMatch(/fitView/)
    expect(lerFonte('CanvasView.tsx')).toMatch(/onFit=\{\(\) => fitCanvasViewSafely\(240\)\}/)
  })
})

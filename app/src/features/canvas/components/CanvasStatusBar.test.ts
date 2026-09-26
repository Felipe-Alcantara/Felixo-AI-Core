import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CanvasStatusBar } from './CanvasStatusBar'

function render(overrides: Partial<Parameters<typeof CanvasStatusBar>[0]> = {}): string {
  return renderToStaticMarkup(
    createElement(CanvasStatusBar, {
      nodeCount: 4,
      edgeCount: 3,
      hydrated: true,
      selectionLabel: null,
      onRemoveSelection: () => {},
      removeDisabled: false,
      ...overrides,
    }),
  )
}

describe('CanvasStatusBar', () => {
  it('sem seleção só conta blocos e conexões, sem botão de remover', () => {
    const html = render()
    expect(html).toContain('4 blocos')
    expect(html).toContain('3 conexões')
    expect(html).not.toContain('<button')
  })

  it('com seleção mostra a frase e o botão Remover com a tecla equivalente', () => {
    const html = render({ selectionLabel: '1 conexão selecionada' })
    expect(html).toContain('1 conexão selecionada')
    expect(html).toContain('aria-label="Remover 1 conexão selecionada"')
    expect(html).toContain('aria-keyshortcuts="Delete Backspace"')
    expect(html).toContain('title="Remover a seleção (Delete ou Backspace)"')
    expect(html).toContain('<kbd class="felixo-statusbar-kbd">Delete</kbd>')
    expect(html).not.toContain('disabled')
  })

  it('canvas travado: botão desativado explica como liberar', () => {
    const html = render({ selectionLabel: '2 blocos selecionados', removeDisabled: true })
    expect(html).toContain('disabled=""')
    expect(html).toContain('title="Destrave o canvas para remover"')
  })
})

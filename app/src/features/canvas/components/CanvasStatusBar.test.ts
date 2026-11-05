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
    expect(html).toContain('4 <span data-corte="2">blocos</span>')
    expect(html).toContain('3 <span data-corte="2">conexões</span>')
    expect(html).not.toContain('<button')
  })

  it('com seleção mostra a frase e o botão Remover com a tecla equivalente', () => {
    const html = render({ selectionLabel: '1 conexão selecionada' })
    expect(html).toContain('1 conexão selecionada')
    expect(html).toContain('aria-label="Remover 1 conexão selecionada"')
    expect(html).toContain('aria-keyshortcuts="Delete Backspace"')
    expect(html).toContain('title="Remover a seleção (Delete ou Backspace)"')
    expect(html).toContain('<kbd class="felixo-statusbar-kbd" data-corte="1">Delete</kbd>')
    expect(html).not.toContain('disabled')
  })

  it('canvas travado: botão desativado explica como liberar', () => {
    const html = render({ selectionLabel: '2 blocos selecionados', removeDisabled: true })
    expect(html).toContain('disabled=""')
    expect(html).toContain('title="Destrave o canvas para remover"')
  })

  // A barra encolhe com a gaveta do terminal aberta (index.css, cortes por
  // largura). O que sai é marcado `data-corte`; o botão nunca: só o rótulo dele
  // (corte 4) e a tecla (corte 1).
  it('só o rótulo e a tecla do Remover são cortáveis: o botão inteiro não tem corte', () => {
    const html = render({ selectionLabel: '1 bloco selecionado' })
    expect(html.match(/<button[^>]*>/)?.[0]).not.toContain('data-corte')
    expect(html).toContain('<span data-corte="4">Remover</span>')
    expect(html).toContain('<kbd class="felixo-statusbar-kbd" data-corte="1">Delete</kbd>')
  })

  it('a frase da seleção sai no corte 2, antes do botão e do estado', () => {
    const html = render({ selectionLabel: '1 bloco selecionado' })
    expect(html).toMatch(/<span class="felixo-statusbar-item" data-corte="2">.*1 bloco selecionado<\/span>/)
    expect(html).toContain('<span data-corte="1">Canvas pronto</span>')
  })

  it('enquanto carrega, o texto do estado muda e continua cortável', () => {
    expect(render({ hydrated: false })).toContain('<span data-corte="1">Carregando canvas…</span>')
  })
})

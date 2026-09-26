import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import {
  SystemDesignDocumentContent,
  SystemDesignDocumentIndex,
  SystemDesignDocumentItem,
} from './SystemDesignDocumentIndex'
import type { SystemDesignDocumentReadState } from './system-design-document'
import type { SystemDesignDocumentSummary } from './types'

function summary(overrides: Partial<SystemDesignDocumentSummary> = {}): SystemDesignDocumentSummary {
  return {
    path: 'core/GUIA_MINIMO_QUALIDADE.md',
    title: 'Guia mínimo de qualidade',
    summary: '',
    byteSize: 1200,
    updatedAt: '2026-09-21T10:00:00.000Z',
    ...overrides,
  }
}

const neverRead = vi.fn(() => new Promise<SystemDesignDocumentReadState>(() => {}))

function renderContent(state: SystemDesignDocumentReadState) {
  return renderToStaticMarkup(
    createElement(SystemDesignDocumentContent, {
      id: 'guia',
      documentPath: 'core/GUIA_MINIMO_QUALIDADE.md',
      state,
      onRetry: () => {},
    }),
  )
}

describe('SystemDesignDocumentIndex', () => {
  it('cada guia do índice é um botão recolhido, sem conteúdo aberto', () => {
    const html = renderToStaticMarkup(
      createElement(SystemDesignDocumentIndex, {
        documents: [
          summary(),
          summary({ path: 'README.md', title: 'README.md' }),
        ],
        readDocument: neverRead,
      }),
    )

    expect(html).toContain('Ver índice (2 documentos)')
    expect(html.match(/<button[^>]*aria-expanded="false"/g)).toHaveLength(2)
    expect(html).toContain('core/GUIA_MINIMO_QUALIDADE.md')
    expect(html).toContain(' — Guia mínimo de qualidade')
    // Título igual ao caminho não é repetido.
    expect(html).not.toContain(' — README.md')
    expect(html).not.toContain('role="region"')
    expect(neverRead).not.toHaveBeenCalled()
  })

  it('item aberto aponta para a região do conteúdo, que começa carregando', () => {
    const html = renderToStaticMarkup(
      createElement(SystemDesignDocumentItem, {
        doc: summary(),
        expanded: true,
        onToggle: () => {},
        readDocument: neverRead,
      }),
    )

    const controls = /aria-controls="([^"]+)"/.exec(html)?.[1]
    expect(html).toMatch(/<button[^>]*aria-expanded="true"/)
    expect(controls).toBeTruthy()
    expect(html).toContain(`id="${controls}"`)
    expect(html).toContain('aria-label="Conteúdo de core/GUIA_MINIMO_QUALIDADE.md"')
    expect(html).toContain('Carregando documento…')
  })
})

describe('SystemDesignDocumentContent', () => {
  it('conteúdo pronto vai para a prévia Markdown, numa região rolável e focável', () => {
    const html = renderContent({ status: 'ready', content: '# Guia' })

    expect(html).toContain('role="region"')
    expect(html).toContain('tabindex="0"')
    expect(html).toContain('overflow-auto')
    // A prévia é carregada sob demanda; o fallback é o do DeferredMarkdownContent.
    expect(html).toContain('Carregando prévia…')
    expect(html).not.toContain('Carregando documento…')
  })

  it('erro mostra o motivo e oferece tentar de novo', () => {
    const html = renderContent({ status: 'error', message: 'Documento nao encontrado.' })

    expect(html).toContain('role="alert"')
    expect(html).toContain('Documento nao encontrado.')
    expect(html).toMatch(/<button[^>]*>Tentar novamente<\/button>/)
  })

  it('documento vazio diz que está vazio em vez de uma moldura em branco', () => {
    expect(renderContent({ status: 'empty' })).toContain('Este documento está vazio no cache local.')
  })
})

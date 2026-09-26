import { describe, expect, it, vi } from 'vitest'

import {
  resolveSystemDesignDocumentLink,
  systemDesignDocumentLinkResolver,
} from './system-design-links'

const DOCUMENT_PATHS: ReadonlySet<string> = new Set([
  'README.md',
  'core/GUIA_MINIMO_QUALIDADE.md',
  'core/DESIGN_SYSTEM_BACKEND.md',
  'core/GUIA COM ESPAÇO.md',
  'docs/GIT-POLITICA-DE-VERSIONAMENTO.md',
])

const FROM = 'core/GUIA_MINIMO_QUALIDADE.md'

describe('resolveSystemDesignDocumentLink', () => {
  it('resolve o link contra a pasta do guia aberto, como no GitHub', () => {
    expect(resolveSystemDesignDocumentLink('DESIGN_SYSTEM_BACKEND.md', FROM, DOCUMENT_PATHS)).toBe(
      'core/DESIGN_SYSTEM_BACKEND.md',
    )
    expect(
      resolveSystemDesignDocumentLink('./DESIGN_SYSTEM_BACKEND.md', FROM, DOCUMENT_PATHS),
    ).toBe('core/DESIGN_SYSTEM_BACKEND.md')
    expect(
      resolveSystemDesignDocumentLink('../docs/GIT-POLITICA-DE-VERSIONAMENTO.md', FROM, DOCUMENT_PATHS),
    ).toBe('docs/GIT-POLITICA-DE-VERSIONAMENTO.md')
    expect(resolveSystemDesignDocumentLink('../README.md', FROM, DOCUMENT_PATHS)).toBe('README.md')
  })

  it('guia na raiz resolve para as pastas de baixo; / inicial parte da raiz', () => {
    expect(
      resolveSystemDesignDocumentLink('docs/GIT-POLITICA-DE-VERSIONAMENTO.md', 'README.md', DOCUMENT_PATHS),
    ).toBe('docs/GIT-POLITICA-DE-VERSIONAMENTO.md')
    expect(resolveSystemDesignDocumentLink('/core/DESIGN_SYSTEM_BACKEND.md', FROM, DOCUMENT_PATHS)).toBe(
      'core/DESIGN_SYSTEM_BACKEND.md',
    )
  })

  it('ignora fragmento e query e decodifica o caminho', () => {
    expect(
      resolveSystemDesignDocumentLink(
        '../docs/GIT-POLITICA-DE-VERSIONAMENTO.md#3-commits--pequenos',
        FROM,
        DOCUMENT_PATHS,
      ),
    ).toBe('docs/GIT-POLITICA-DE-VERSIONAMENTO.md')
    expect(
      resolveSystemDesignDocumentLink('DESIGN_SYSTEM_BACKEND.md?plain=1', FROM, DOCUMENT_PATHS),
    ).toBe('core/DESIGN_SYSTEM_BACKEND.md')
    expect(
      resolveSystemDesignDocumentLink('GUIA%20COM%20ESPA%C3%87O.md', FROM, DOCUMENT_PATHS),
    ).toBe('core/GUIA COM ESPAÇO.md')
  })

  it('sem guia no índice não há destino: pasta, arquivo de fora, caminho que sai do repositório', () => {
    for (const href of [
      '../scripts/',
      '.',
      '../scripts/cmd/install-felixo-cmd.cmd',
      'NAO_EXISTE.md',
      '../../README.md',
      '../../core/DESIGN_SYSTEM_BACKEND.md',
      '#secao',
      '',
    ]) {
      expect(resolveSystemDesignDocumentLink(href, FROM, DOCUMENT_PATHS)).toBeNull()
    }
  })
})

describe('systemDesignDocumentLinkResolver', () => {
  it('link para guia do índice vira a ação de abri-lo; o resto não tem destino', () => {
    const openDocument = vi.fn()
    const resolve = systemDesignDocumentLinkResolver(FROM, DOCUMENT_PATHS, openDocument)

    const link = resolve('DESIGN_SYSTEM_BACKEND.md')
    expect(link?.description).toBe('Abrir o guia core/DESIGN_SYSTEM_BACKEND.md neste índice')
    expect(openDocument).not.toHaveBeenCalled()
    link?.open()
    expect(openDocument).toHaveBeenCalledWith('core/DESIGN_SYSTEM_BACKEND.md')

    expect(resolve('../scripts/')).toBeNull()
  })
})

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FetchAllScanRoots } from './FetchAllScanRoots'

function render(props: Partial<Parameters<typeof FetchAllScanRoots>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(FetchAllScanRoots, {
      roots: [],
      disabled: false,
      saving: false,
      onAdd: () => {},
      onRemove: () => {},
      ...props,
    }),
  )
}

describe('FetchAllScanRoots', () => {
  it('sem raízes, explica o que fazer e oferece adicionar uma pasta', () => {
    const html = render()

    expect(html).toContain('Raízes configuradas (0)')
    expect(html).toContain('Nenhuma pasta escolhida.')
    expect(html).toContain('Adicionar pasta')
    expect(html).not.toContain('<ul')
  })

  it('cada raiz tem um botão de remover com nome acessível próprio', () => {
    const html = render({ roots: ['/home/pessoa/repos', '/dados/git'] })

    expect(html).toContain('Raízes configuradas (2)')
    expect(html).toContain('aria-label="Deixar de varrer /home/pessoa/repos"')
    expect(html).toContain('aria-label="Deixar de varrer /dados/git"')
    expect(html).not.toContain('Nenhuma pasta escolhida.')
    // O nome da pasta vem antes do caminho, que o corte encurta pelo fim.
    expect(html).toContain('<span class="shrink-0 text-zinc-300">repos</span>')
    expect(html).toContain('<span class="shrink-0 text-zinc-300">git</span>')
    // A lista é nomeada pelo título visível, não por um texto escondido.
    const titleId = /<p id="([^"]+)"[^>]*>Raízes configuradas/.exec(html)?.[1]
    expect(titleId).toBeTruthy()
    expect(html).toContain(`<ul aria-labelledby="${titleId}"`)
  })

  it('desabilitado, nenhum controle aceita clique, e salvando o botão avisa', () => {
    const html = render({ roots: ['/dados/git'], disabled: true, saving: true })

    expect(html.match(/<button[^>]*disabled=""/g)).toHaveLength(2)
    expect(html).toContain('Salvando…')
    expect(html).not.toContain('Adicionar pasta')
  })
})

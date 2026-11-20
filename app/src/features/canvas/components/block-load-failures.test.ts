import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { BlockErrorBoundary } from './BlockErrorBoundary'
import { lazyRecarregavel } from './lazy-recarregavel'
import { safeStorage } from '../../shared/dialog/useResizableDialog'

const source = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')

describe('falha de carregamento de bloco', () => {
  it('o boundary vira o aviso do bloco com "Tentar de novo", sem derrubar o resto', () => {
    expect(BlockErrorBoundary.getDerivedStateFromError()).toEqual({ erro: true })

    // O render do servidor não captura erro de filho: monta o estado de falha direto e olha o que o bloco mostra.
    const boundary = new BlockErrorBoundary({ rotulo: 'o Excalidraw', children: () => null })
    boundary.state = { erro: true }
    const html = renderToStaticMarkup(boundary.render() as never)

    expect(html).toContain('role="alert"')
    expect(html).toContain('Não foi possível carregar o Excalidraw.')
    expect(html).toContain('O resto do canvas segue funcionando.')
    expect(html).toContain('Tentar de novo')
  })

  it('sem falha, o boundary entrega o filho (lido a cada render, para pegar o lazy renovado)', () => {
    const filho = vi.fn(() => createElement('p', null, 'painel'))
    const boundary = new BlockErrorBoundary({ rotulo: 'x', children: filho })
    expect(renderToStaticMarkup(boundary.render() as never)).toBe('<p>painel</p>')
    expect(filho).toHaveBeenCalledTimes(1)
  })

  it('Tentar de novo renova o lazy: a rejeição guardada pelo React.lazy não se repete', async () => {
    const painel = () => null
    const load = vi
      .fn<() => Promise<{ default: () => null }>>()
      .mockRejectedValueOnce(new Error('chunk falhou'))
      .mockResolvedValue({ default: painel })
    const lazy = lazyRecarregavel(load)
    const primeiro = lazy.atual()
    expect(lazy.atual()).toBe(primeiro)

    lazy.renovar()
    expect(lazy.atual()).not.toBe(primeiro)

    // O boundary chama aoTentarDeNovo antes de limpar o erro.
    const renovar = vi.fn()
    const boundary = new BlockErrorBoundary({ rotulo: 'x', aoTentarDeNovo: renovar, children: () => null })
    const setState = vi.spyOn(boundary, 'setState').mockImplementation(() => {})
    boundary.state = { erro: true }
    const html = renderToStaticMarkup(boundary.render() as never)
    expect(html).toContain('Tentar de novo')
    ;(boundary as unknown as { tentarDeNovo: () => void }).tentarDeNovo()
    expect(renovar).toHaveBeenCalledTimes(1)
    expect(setState).toHaveBeenCalledWith({ erro: false })
  })

  it('os dois blocos preguiçosos (Tarefas Notion e Excalidraw) estão dentro do boundary, sem lazy solto', () => {
    for (const file of ['NotionTasksNode.tsx', 'ExcalidrawDrawingNode.tsx']) {
      const code = source(file)
      expect(code, file).toContain('<BlockErrorBoundary')
      expect(code, file).toContain('lazyRecarregavel(')
      expect(code, file).not.toMatch(/=\s*lazy\(/)
    }
  })
})

describe('Página Web: guest antes do dom-ready', () => {
  const code = source('WebpageNode.tsx')

  it('Voltar, Avançar e Recarregar passam por guestAction (try), nunca direto no guest', () => {
    expect(code).toContain('guestAction((guest) => guest.goBack())')
    expect(code).toContain('guestAction((guest) => guest.goForward())')
    expect(code).toContain('guestAction((guest) => guest.reload())')
    expect(code).not.toMatch(/webviewRef\.current\?\.(goBack|goForward|reload)\(\)/)
  })

  it('canGoBack/canGoForward são lidos dentro de try e zerados quando o guest é recriado', () => {
    expect(code).toMatch(/try \{\s*setCanGoBack\(webview\.canGoBack\(\)\)/)
    expect(code).toMatch(/setWebview\(element\)[\s\S]{0,260}setCanGoBack\(false\)[\s\S]{0,40}setCanGoForward\(false\)/)
  })

  it('Recarregar fica desabilitado até haver guest', () => {
    expect(code).toMatch(/guest\.reload\(\)\)\}\s*disabled=\{guestId === null\}/)
  })
})

describe('modais: localStorage que lança', () => {
  it('um getter que lança vira um storage vazio, sem derrubar o useState inicial', () => {
    const anterior = (globalThis as { window?: unknown }).window
    ;(globalThis as { window?: unknown }).window = {
      get localStorage(): never {
        throw new DOMException('bloqueado', 'SecurityError')
      },
    }
    try {
      const storage = safeStorage()
      expect(storage.getItem('qualquer')).toBeNull()
      expect(() => storage.setItem('k', 'v')).not.toThrow()
      expect(() => storage.removeItem('k')).not.toThrow()
    } finally {
      ;(globalThis as { window?: unknown }).window = anterior
    }
  })

  it('o hook não lê window.localStorage direto', () => {
    const code = readFileSync(new URL('../../shared/dialog/useResizableDialog.ts', import.meta.url), 'utf8')
    const semComentarios = code.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(semComentarios.match(/window\.localStorage/g)).toHaveLength(1) // só dentro de safeStorage
  })
})

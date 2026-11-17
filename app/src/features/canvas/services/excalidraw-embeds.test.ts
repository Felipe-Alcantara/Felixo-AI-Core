import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { IsolatedEmbedFrame } from '../components/IsolatedEmbedFrame'
import {
  EXCALIDRAW_EMBED_LINK_HOSTS,
  ISOLATED_EMBED_SANDBOX,
  isExcalidrawEmbedLink,
  isolatedEmbedSrc,
} from './excalidraw-embeds'

const require = createRequire(import.meta.url)
const csp = require('../../../../scripts/renderer-csp.cjs') as {
  EXCALIDRAW_EMBED_LINK_HOSTS: string[]
  ISOLATED_EMBED_SANDBOX: string
}

describe('embeds do Excalidraw: a lista inteira (14 domínios)', () => {
  it('a lista daqui é a mesma da CSP, com 14 domínios', () => {
    expect([...EXCALIDRAW_EMBED_LINK_HOSTS]).toEqual(csp.EXCALIDRAW_EMBED_LINK_HOSTS)
    expect(EXCALIDRAW_EMBED_LINK_HOSTS).toHaveLength(14)
    expect(ISOLATED_EMBED_SANDBOX).toBe(csp.ISOLATED_EMBED_SANDBOX)
  })

  it('aceita um link https de cada domínio', () => {
    for (const link of [
      'https://www.youtube.com/watch?v=abc',
      'https://youtu.be/abc',
      'https://vimeo.com/123',
      'https://player.vimeo.com/video/123',
      'https://www.figma.com/proto/x',
      'https://link.excalidraw.com/l/a/b',
      'https://gist.github.com/u/abc',
      'https://twitter.com/u/status/1',
      'https://x.com/u/status/1',
      'https://form.simplepdf.eu/x',
      'https://stackblitz.com/edit/x',
      'https://val.town/v/a.b',
      'https://giphy.com/gifs/x-abc',
      'https://www.reddit.com/r/a/comments/b/c',
    ]) {
      expect(isExcalidrawEmbedLink(link), link).toBe(true)
    }
  })

  it('recusa o resto, sempre com boolean (undefined cairia na lista embutida)', () => {
    for (const link of [
      'https://example.com/',
      'https://youtube.com.evil.test/',
      'https://evil.test/?u=youtube.com',
      'http://www.youtube.com/watch?v=abc',
      'javascript:alert(1)',
      'file:///C:/x',
      'sem-url',
      '',
      null,
      undefined,
    ]) {
      expect(isExcalidrawEmbedLink(link), String(link)).toBe(false)
    }
  })
})

describe('embeds com script de terceiro rodam isolados da origem do app', () => {
  it('X, Reddit e Gist viram a página de embed do próprio site, nunca srcdoc', () => {
    expect(isolatedEmbedSrc('https://x.com/u/status/123', 'dark')).toBe(
      'https://platform.twitter.com/embed/Tweet.html?dnt=true&theme=dark&id=123',
    )
    expect(isolatedEmbedSrc('https://twitter.com/u/status/123', 'light')).toContain('platform.twitter.com')
    expect(isolatedEmbedSrc('https://www.reddit.com/r/sub/comments/abc/slug', 'light')).toBe(
      'https://embed.reddit.com/r/sub/comments/abc/slug/?embed=true&theme=light',
    )
    expect(isolatedEmbedSrc('https://gist.github.com/u/abc123', 'light')).toBe('https://gist.github.com/u/abc123.pibb')
  })

  it('o Excalidraw monta srcdoc quando a expressão dele casa em qualquer ponto do link: aqui também isola', () => {
    expect(isolatedEmbedSrc('https://stackblitz.com/edit/x?u=twitter.com/a/status/9', 'light')).toContain(
      'platform.twitter.com',
    )
  })

  it('os embeds de iframe simples seguem no frame padrão do Excalidraw (null)', () => {
    for (const link of [
      'https://www.youtube.com/watch?v=abc',
      'https://vimeo.com/123',
      'https://www.figma.com/proto/x',
      'https://giphy.com/gifs/x-abc',
      'https://stackblitz.com/edit/x',
    ]) {
      expect(isolatedEmbedSrc(link, 'light'), link).toBeNull()
    }
  })

  it('o frame isolado é https, tem sandbox com scripts e não tem allow-same-origin nem allow-top-navigation', () => {
    const html = renderToStaticMarkup(
      createElement(IsolatedEmbedFrame, { src: 'https://platform.twitter.com/embed/Tweet.html?id=1' }),
    )
    const sandbox = /sandbox="([^"]*)"/.exec(html)?.[1] ?? ''
    expect(sandbox.split(' ')).toContain('allow-scripts')
    expect(sandbox).not.toContain('allow-same-origin')
    expect(sandbox).not.toContain('allow-top-navigation')
    expect(html).toContain('src="https://platform.twitter.com/')
    expect(html).not.toContain('srcDoc')
    expect(html).not.toContain('srcdoc')
  })
})

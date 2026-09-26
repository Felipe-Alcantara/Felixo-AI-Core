import { describe, expect, it } from 'vitest'
import {
  MAX_INLINE_MARKDOWN_IMAGE_BYTES,
  dirnameOf,
  isRelativeMarkdownLink,
  resolveMarkdownImageSrc,
  sanitizeMarkdownUrl,
} from './markdown-image-src'

describe('resolveMarkdownImageSrc', () => {
  it('bloqueia URL remota para impedir request automático', () => {
    expect(resolveMarkdownImageSrc('https://exemplo.com/foto.png', '/x')).toBeUndefined()
    expect(resolveMarkdownImageSrc('data:image/png;base64,AAAA', '/x')).toBe(
      'data:image/png;base64,AAAA',
    )
  })

  it('resolve caminho relativo contra o baseDir, como o post e a pasta de imagem do blog', () => {
    expect(
      resolveMarkdownImageSrc(
        './foto.png',
        '/home/user/blog/src/content/posts/ola-mundo',
      ),
    ).toBe('file:///home/user/blog/src/content/posts/ola-mundo/foto.png')

    // Sem o `./` também — é o mesmo caminho relativo.
    expect(
      resolveMarkdownImageSrc('foto.png', '/home/user/blog/src/content/posts/ola-mundo'),
    ).toBe('file:///home/user/blog/src/content/posts/ola-mundo/foto.png')
  })

  it('resolve subida de diretório (..) corretamente', () => {
    expect(
      resolveMarkdownImageSrc('../capa/foto.png', '/home/user/posts/ola-mundo'),
    ).toBe('file:///home/user/posts/capa/foto.png')
  })

  it('recusa caminho relativo quando não há baseDir autorizado', () => {
    expect(resolveMarkdownImageSrc('./foto.png', undefined)).toBeUndefined()
  })

  it('recusa caminhos locais absolutos para exigir a política de baseDir autorizado', () => {
    expect(resolveMarkdownImageSrc('/tmp/foto.png', '/qualquer/coisa')).toBeUndefined()
    expect(resolveMarkdownImageSrc('C:\\imagens\\foto.png', '/x')).toBeUndefined()
  })

  it('escapa espaço e acento no nome do arquivo', () => {
    expect(resolveMarkdownImageSrc('foto com espaço.png', '/home/user/posts')).toBe(
      'file:///home/user/posts/foto%20com%20espa%C3%A7o.png',
    )
    expect(
      resolveMarkdownImageSrc('foto%20com%20espa%C3%A7o.png', '/home/user/posts'),
    ).toBe('file:///home/user/posts/foto%20com%20espa%C3%A7o.png')
  })

  it('devolve undefined/vazio como veio, sem quebrar', () => {
    expect(resolveMarkdownImageSrc(undefined, '/x')).toBeUndefined()
    expect(resolveMarkdownImageSrc('', '/x')).toBe('')
  })

  it('aceita apenas data images rasterizadas pequenas', () => {
    expect(resolveMarkdownImageSrc('data:image/svg+xml;base64,PHN2Zy8+', '/x')).toBeUndefined()
    expect(resolveMarkdownImageSrc('data:text/html;base64,PGh0bWw+', '/x')).toBeUndefined()
    expect(resolveMarkdownImageSrc('data:image/png;base64,A', '/x')).toBeUndefined()

    const oversizedPayload = 'A'.repeat(
      Math.ceil((MAX_INLINE_MARKDOWN_IMAGE_BYTES + 1) * 4 / 3),
    )
    expect(
      resolveMarkdownImageSrc(`data:image/png;base64,${oversizedPayload}`, '/x'),
    ).toBeUndefined()
  })
})

describe('sanitizeMarkdownUrl', () => {
  it('preserva links externos seguros, âncoras e mailto', () => {
    expect(sanitizeMarkdownUrl(' https://exemplo.com/docs ', 'href')).toBe(
      'https://exemplo.com/docs',
    )
    expect(sanitizeMarkdownUrl('#secao', 'href')).toBe('#secao')
    expect(sanitizeMarkdownUrl('mailto:time@exemplo.com', 'href')).toBe(
      'mailto:time@exemplo.com',
    )
  })

  it('remove protocolos perigosos e destinos não aprovados de links', () => {
    expect(sanitizeMarkdownUrl('javascript:alert(1)', 'href')).toBe('')
    expect(sanitizeMarkdownUrl('file:///etc/passwd', 'href')).toBe('')
    expect(sanitizeMarkdownUrl('gopher://exemplo.com', 'href')).toBe('')
    expect(sanitizeMarkdownUrl('data:text/html;base64,PGh0bWw+', 'href')).toBe('')
    expect(sanitizeMarkdownUrl('//exemplo.com/sem-esquema', 'href')).toBe('')
    expect(sanitizeMarkdownUrl('https://', 'href')).toBe('')
    expect(sanitizeMarkdownUrl('https://exemplo.com\njavascript:alert(1)', 'href')).toBe('')
  })

  it('preserva somente referências de imagem aprovadas', () => {
    expect(sanitizeMarkdownUrl('https://exemplo.com/foto.png', 'src')).toBe('')
    expect(sanitizeMarkdownUrl('./foto.png', 'src')).toBe('./foto.png')
    expect(sanitizeMarkdownUrl('data:image/png;base64,AAAA', 'src')).toBe(
      'data:image/png;base64,AAAA',
    )
    expect(sanitizeMarkdownUrl('javascript:alert(1)', 'src')).toBe('')
    expect(sanitizeMarkdownUrl('file:///tmp/foto.png', 'src')).toBe('')
    expect(sanitizeMarkdownUrl('data:image/svg+xml;base64,PHN2Zy8+', 'src')).toBe('')
  })
})

describe('isRelativeMarkdownLink', () => {
  it('reconhece caminho relativo a outro documento, com ou sem fragmento', () => {
    for (const href of [
      'OUTRO.md',
      ' ./OUTRO.md ',
      '../docs/GUIA.md#secao',
      'pasta/',
      '/core/GUIA.md',
    ]) {
      expect(isRelativeMarkdownLink(href)).toBe(true)
    }
  })

  it('recusa o que já é destino por si ou não é caminho', () => {
    for (const href of [
      '',
      '   ',
      '#secao',
      '?query=1',
      '//exemplo.com/guia.md',
      '\\\\servidor\\guia.md',
      'C:\\guias\\guia.md',
      'https://exemplo.com/guia.md',
      'mailto:time@exemplo.com',
      'javascript:alert(1)',
      'file:///etc/passwd',
      'guia.md\njavascript:alert(1)',
    ]) {
      expect(isRelativeMarkdownLink(href)).toBe(false)
    }
  })
})

describe('dirnameOf', () => {
  it('devolve a pasta de um caminho de arquivo', () => {
    expect(dirnameOf('/home/user/posts/ola-mundo/ola-mundo.md')).toBe(
      '/home/user/posts/ola-mundo',
    )
  })

  it('devolve undefined sem caminho, em vez de fingir saber a pasta', () => {
    expect(dirnameOf(undefined)).toBeUndefined()
    expect(dirnameOf('')).toBeUndefined()
  })
})

import { describe, expect, it } from 'vitest'
import { dirnameOf, resolveMarkdownImageSrc } from './markdown-image-src'

describe('resolveMarkdownImageSrc', () => {
  it('deixa URL com esquema passar intocada', () => {
    expect(resolveMarkdownImageSrc('https://exemplo.com/foto.png', '/x')).toBe(
      'https://exemplo.com/foto.png',
    )
    expect(resolveMarkdownImageSrc('data:image/png;base64,AAA', '/x')).toBe(
      'data:image/png;base64,AAA',
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

  it('devolve caminho relativo sem mudança quando não há baseDir', () => {
    // Uso fora de um arquivo em disco (ex.: mensagem de chat) — comportamento
    // igual ao de antes desta função existir.
    expect(resolveMarkdownImageSrc('./foto.png', undefined)).toBe('./foto.png')
  })

  it('vira file:// mesmo um caminho já absoluto, sem depender do baseDir', () => {
    expect(resolveMarkdownImageSrc('/tmp/foto.png', '/qualquer/coisa')).toBe(
      'file:///tmp/foto.png',
    )
  })

  it('resolve caminho absoluto do Windows preservando a letra da unidade', () => {
    expect(resolveMarkdownImageSrc('C:\\imagens\\foto.png', '/x')).toBe(
      'file:///C:/imagens/foto.png',
    )
  })

  it('escapa espaço e acento no nome do arquivo', () => {
    expect(resolveMarkdownImageSrc('foto com espaço.png', '/home/user/posts')).toBe(
      'file:///home/user/posts/foto%20com%20espa%C3%A7o.png',
    )
  })

  it('devolve undefined/vazio como veio, sem quebrar', () => {
    expect(resolveMarkdownImageSrc(undefined, '/x')).toBeUndefined()
    expect(resolveMarkdownImageSrc('', '/x')).toBe('')
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

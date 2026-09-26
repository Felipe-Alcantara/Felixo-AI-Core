import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { MarkdownContent } from './MarkdownContent'
import { MAX_MARKDOWN_CONTENT_CHARS } from './markdown-content-safety'

function renderMarkdown(content: string, baseDir?: string) {
  return renderToStaticMarkup(
    createElement(MarkdownContent, {
      baseDir,
      content,
    }),
  )
}

describe('MarkdownContent', () => {
  it('sanitiza corpus malicioso misturado com ANSI antes do renderer', () => {
    const html = renderMarkdown(`
\u001b[31m# Saída do terminal\u001b[0m

\u001b]8;;javascript:alert(1)\u0007[link perigoso]\u001b]8;;\u0007

<svg><script>alert(1)</script></svg>
<img src="https://tracker.example/pixel.gif" onerror="alert(2)">
<style>@import url(https://tracker.example/style.css)</style>
<link rel="stylesheet" href="https://tracker.example/style.css">
<div onclick="alert(3)"><strong>seguro</strong></div>
`)

    expect(html).toMatch(/<h1[^>]*>Saída do terminal<\/h1>/)
    expect(html).toMatch(/<strong[^>]*>seguro<\/strong>/)
    expect(html.includes(String.fromCharCode(0x1b))).toBe(false)
    expect(html.includes(String.fromCharCode(0x7f))).toBe(false)
    expect(html).not.toMatch(/<svg|<script|<style|<link|onerror=|onclick=/i)
    expect(html).not.toContain('tracker.example')
    expect(html).not.toMatch(/href="(?:javascript|data):/i)
  })

  it('remove HTML ativo e atributos de evento, preservando elementos visuais seguros', () => {
    const html = renderMarkdown(`
<div onmouseover="alert(1)" style="color: red">
  <strong>Conteúdo seguro</strong>
  <script>window.__xss = true</script>
  <iframe src="javascript:alert(2)">conteúdo ativo</iframe>
</div>
`)

    expect(html).toContain('Conteúdo seguro')
    expect(html).not.toMatch(/<script\b/i)
    expect(html).not.toMatch(/<iframe\b/i)
    expect(html).not.toMatch(/onmouseover|javascript:/i)
    expect(html).not.toMatch(/style="color: red"/i)
  })

  it('mantém apenas destinos de link aprovados', () => {
    const html = renderMarkdown(`
[seguro](https://example.com/docs)
[âncora](#secao)
[email](mailto:time@example.com)
[javascript](javascript:alert(1))
[arquivo](file:///etc/passwd)
[desconhecido](gopher://example.com/)
[html](data:text/html;base64,PGh0bWw+)
<a href="javascript:alert(3)">HTML inseguro</a>
`)

    expect(html).toContain('href="https://example.com/docs"')
    expect(html).toContain('href="#secao"')
    expect(html).toContain('href="mailto:time@example.com"')
    expect(html).toContain('target="_blank"')
    expect(html).not.toMatch(/href="(?:javascript|file|gopher|data):/i)
  })

  it('link sem destino seguro vira texto, sem href vazio abrindo janela nova', () => {
    const html = renderMarkdown(`
[outro guia](OUTRO.md)
[subindo](../docs/GUIA.md)
[javascript](javascript:alert(1))
<a href="notas.md">HTML relativo</a>
`)

    // Antes: <a href="" target="_blank">, e o clique abria o navegador do
    // sistema na raiz do próprio renderer.
    expect(html).not.toContain('href=""')
    expect(html).not.toContain('target="_blank"')
    expect(html).not.toMatch(/<(?:a|button)\b/)
    for (const text of ['outro guia', 'subindo', 'javascript', 'HTML relativo']) {
      expect(html).toContain(`<span>${text}</span>`)
    }
  })

  it('âncora fica no próprio conteúdo: sem janela nova e com o título marcado como destino', () => {
    const html = renderMarkdown(`
## 🚀 Como Contribuir

[ir para Como Contribuir](#-como-contribuir)
`)

    expect(html).toMatch(/<h2[^>]*data-markdown-anchor="-como-contribuir"[^>]*>🚀 Como Contribuir<\/h2>/)
    expect(html).toMatch(/<a [^>]*href="#-como-contribuir"[^>]*>ir para Como Contribuir<\/a>/)
    expect(html).not.toContain('target="_blank"')
  })

  it('com resolvedor, link relativo que o documento conhece vira botão; o resto vira texto', () => {
    const open = vi.fn()
    const resolveRelativeLink = vi.fn((href: string) =>
      href === 'OUTRO.md' ? { description: 'Abrir OUTRO.md', open } : null,
    )
    const html = renderToStaticMarkup(
      createElement(MarkdownContent, {
        content: '[outro](OUTRO.md) e [sumido](SUMIU.md) e [site](https://example.com/)',
        resolveRelativeLink,
      }),
    )

    expect(resolveRelativeLink).toHaveBeenCalledWith('OUTRO.md')
    expect(resolveRelativeLink).toHaveBeenCalledWith('SUMIU.md')
    expect(html).toMatch(/<button type="button"[^>]*title="Abrir OUTRO.md"[^>]*>outro<\/button>/)
    expect(html).toContain('<span>sumido</span>')
    expect(html).toMatch(/<a [^>]*href="https:\/\/example.com\/"[^>]*target="_blank"[^>]*>site<\/a>/)
    expect(html).not.toContain('href=""')
    expect(open).not.toHaveBeenCalled()
  })

  it('converte imagem remota em texto e mantém data raster e arquivos autorizados', () => {
    const html = renderMarkdown(
      `
![remota](https://example.com/foto.png)
![inline](data:image/png;base64,AAAA)
![local](<./foto com espaço.png>)
`,
      '/home/user/posts/ola-mundo',
    )

    expect(html).toContain('remota')
    expect(html).not.toContain('src="https://example.com/foto.png"')
    expect(html).toContain('src="data:image/png;base64,AAAA"')
    expect(html).toContain('src="file:///home/user/posts/ola-mundo/foto%20com%20espa%C3%A7o.png"')
  })

  it('avisa quando o conteúdo excede o limite de segurança', () => {
    const html = renderMarkdown(`início\n\n${'x'.repeat(MAX_MARKDOWN_CONTENT_CHARS + 1)}`)

    expect(html).toContain('Conteúdo truncado após 200.000 caracteres')
    expect(html).toContain('início')
  })

  it('recusa imagens locais implícitas e esquemas de imagem perigosos', () => {
    const html = renderMarkdown(`
![sem baseDir](./foto.png)
![javascript](javascript:alert(1))
![arquivo](file:///tmp/foto.png)
![svg](data:image/svg+xml;base64,PHN2Zy8+)
<img alt="HTML inseguro" src="javascript:alert(2)" onerror="alert(3)">
`)

    expect(html).toContain('sem baseDir')
    expect(html).toContain('javascript')
    expect(html).not.toMatch(/src="(?:javascript|file|data:image\/svg\+xml):/i)
    expect(html).not.toMatch(/onerror=/i)
  })

  it('preserva os elementos essenciais do GFM', () => {
    const html = renderMarkdown(`
- [x] tarefa concluída

| Coluna | Valor |
| --- | --- |
| A | B |

~~riscado~~
`)

    expect(html).toMatch(/<input[^>]+type="checkbox"/i)
    expect(html).toContain('<table')
    expect(html).toMatch(/<del[^>]*>riscado<\/del>/)
  })
})

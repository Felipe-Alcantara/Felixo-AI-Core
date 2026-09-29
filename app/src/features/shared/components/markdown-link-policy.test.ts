import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Copy } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { classifyExternalUrl } from '../external-url-policy'
import { MarkdownContent } from './MarkdownContent'

/**
 * O Markdown decodifica entidades, junta HTML cru e resolve referências antes
 * de qualquer `href` existir; a política só vê o resultado. Estes testes
 * passam pelo renderer inteiro para provar que nenhum desses caminhos entrega
 * ao DOM um link que a política central recusaria.
 */

const NEWLINE = String.fromCharCode(10)
const CARRIAGE_RETURN = String.fromCharCode(13)
const TAB = String.fromCharCode(9)
const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b)
const RIGHT_TO_LEFT_OVERRIDE = String.fromCharCode(0x202e)

function renderMarkdown(content: string) {
  return renderToStaticMarkup(createElement(MarkdownContent, { content }))
}

function decodeAttribute(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function hrefsOf(html: string): string[] {
  return [...html.matchAll(/\shref="([^"]*)"/g)].map((match) => decodeAttribute(match[1]))
}

// O ícone do botão de copiar é o único `<svg>` legítimo na saída: tira-se a
// marcação exata dele, e qualquer outro `<svg>` ainda reprova.
const COPY_ICON_MARKUP = renderToStaticMarkup(createElement(Copy, { size: 11 }))

function withoutCopyIcons(html: string) {
  return html.split(COPY_ICON_MARKUP).join('')
}

// A ordem dos atributos é a do JSX do `MarkdownLink`.
const REFUSED_LINK =
  /<span title="Link recusado por segurança: ([^"]*)">([\s\S]*?)<\/span><button type="button" aria-label="Copiar endereço recusado"/g

function refusedLinksOf(html: string) {
  return [...html.matchAll(REFUSED_LINK)].map((match) => ({
    destination: decodeAttribute(match[1]),
    text: match[2],
  }))
}

function expectOnlyApprovedHrefs(html: string, source: string) {
  for (const href of hrefsOf(html)) {
    if (href.startsWith('#')) continue
    const decision = classifyExternalUrl(href)
    expect(decision.ok, `${JSON.stringify(source)} gerou href=${JSON.stringify(href)}`).toBe(true)
    // O DOM recebe exatamente a forma que o processo principal vai revalidar.
    if (decision.ok) expect(href).toBe(decision.url)
  }
}

const EVASIONS = [
  '[entidade decimal](&#106;avascript:alert(1))',
  '[entidade hex](&#x6A;avascript:alert(1))',
  '[entidade nomeada](javascript&colon;alert(1))',
  '[tab por entidade](java&Tab;script:alert(1))',
  '[nova linha por entidade](java&#10;script:alert(1))',
  '[maiúsculas](JaVaScRiPt:alert(1))',
  '[espaço antes](< javascript:alert(1)>)',
  '[vbscript](vbscript:msgbox(1))',
  '[data](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)',
  '[blob](blob:https://example.com/1b4e28ba)',
  '[arquivo](file:///C:/Users/pessoa/.ssh/id_ed25519)',
  '[vscode](vscode://file/C:/projeto/arquivo.ts)',
  '[ms-msdt](ms-msdt:/id)',
  '[search-ms](search-ms:query=x)',
  '[unc](\\\\servidor\\compartilhamento)',
  '[protocolo relativo](//evil.example/)',
  '<file:///C:/Windows/win.ini>',
  '<vscode://file/C:/x>',
  '[ref]: javascript:alert(1)' + NEWLINE + NEWLINE + '[referência][ref]',
  '<a href="java' + TAB + 'script:alert(1)">tab cru</a>',
  '<a href="java' + NEWLINE + 'script:alert(1)">LF cru</a>',
  '<a href="java' + CARRIAGE_RETURN + 'script:alert(1)">CR cru</a>',
  '<a href="&#x20;javascript:alert(1)">espaço por entidade</a>',
  '<a href="vscode://file/C:/x">HTML vscode</a>',
  '<a href="data:text/html,x">HTML data</a>',
  '<area href="javascript:alert(1)" alt="área">',
  '<svg><a xlink:href="javascript:alert(1)">svg</a></svg>',
  '<form action="javascript:alert(1)"><button formaction="javascript:alert(2)">enviar</button></form>',
  '<a href="https://exa' + ZERO_WIDTH_SPACE + 'mple.com/">invisível no host</a>',
  '[invisível](https://example.com/' + RIGHT_TO_LEFT_OVERRIDE + 'gpj.exe)',
  '<base href="https://evil.example/">[relativo](notas.md)',
  '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
]

describe('Markdown e a política central de URL', () => {
  it.each(EVASIONS)('não gera link recusado pela política: %j', (source) => {
    const html = renderMarkdown(source)

    expectOnlyApprovedHrefs(html, source)
    expect(html).not.toMatch(/(?:action|formaction|xlink:href|http-equiv)=/i)
    expect(withoutCopyIcons(html)).not.toMatch(/<(?:base|meta|form|area|svg)\b/i)
  })

  it.each([
    ['autolink com U+202E', `<https://example.com/${RIGHT_TO_LEFT_OVERRIDE}gpj.exe>`, 'https://example.com/'],
    ['texto GFM com U+202E', `veja https://example.com/${RIGHT_TO_LEFT_OVERRIDE}gpj.exe`, 'https://example.com/'],
    ['link com U+200B no host', `[site](https://exa${ZERO_WIDTH_SPACE}mple.com/)`, 'site'],
    ['autolink com U+200B no host', `<https://exa${ZERO_WIDTH_SPACE}mple.com/>`, 'https://exa'],
    ['referência com U+202E', `[ref]: https://example.com/${RIGHT_TO_LEFT_OVERRIDE}x${NEWLINE}${NEWLINE}[texto][ref]`, 'texto'],
  ])('%s vira texto: o parser codificaria o invisível antes da política ver', (_label, source, visibleText) => {
    const html = renderMarkdown(source)

    expect(hrefsOf(html)).toEqual([])
    // O que a pessoa leu continua na tela: o rótulo, ou o próprio endereço no autolink.
    expect(html).toContain(visibleText)
  })

  it('link recusado continua legível e copiável como texto, sem virar âncora', () => {
    const html = renderMarkdown(
      '[abrir o arquivo](file:///C:/Users/pessoa/notas.txt) e <vscode://file/C:/x>',
    )

    expect(hrefsOf(html)).toEqual([])
    expect(html).toContain('abrir o arquivo')
    // O autolink recusado mantém o próprio endereço visível para quem quiser copiá-lo.
    expect(html).toContain('vscode://file/C:/x')
    // E os dois guardam o destino escrito, na dica e no botão de copiar.
    expect(refusedLinksOf(html)).toEqual([
      { destination: 'file:///C:/Users/pessoa/notas.txt', text: 'abrir o arquivo' },
      { destination: 'vscode://file/C:/x', text: 'vscode://file/C:/x' },
    ])
  })

  it('link aprovado sai na forma serializada, a mesma que o opener do main recebe', () => {
    const cyrillicE = String.fromCharCode(0x435)
    const html = renderMarkdown(
      `[site](https://Example.com) [ip](http://2130706433/) [idn](https://${cyrillicE}xample.com/) [email](mailto:time@example.com)`,
    )

    expect(hrefsOf(html)).toEqual([
      'https://example.com/',
      'http://127.0.0.1/',
      'https://xn--xample-2of.com/',
      'mailto:time@example.com',
    ])
    // O Electron não tem barra de status: a dica é o único lugar onde o
    // destino aparece antes do clique.
    expect(html).toMatch(/<a [^>]*href="https:\/\/example\.com\/"[^>]*title="https:\/\/example\.com\/"/)
  })

  it('esquema em mai\u00fasculas vira texto no Markdown: o rehype-sanitize compara esquema com caixa', () => {
    // Diferen\u00e7a conhecida e no sentido seguro: o terminal e o main aceitam
    // `HTTPS://` (a pol\u00edtica normaliza), o sanitizer do Markdown recusa antes.
    // Nenhum dos dois caminhos gera um link que a pol\u00edtica recusaria.
    const html = renderMarkdown('[site](HTTPS://Example.com) <a href="HTTPS://Example.com">html</a>')

    expect(hrefsOf(html)).toEqual([])
    expect(html).toContain('site')
    expect(html).toContain('html')
  })
})

describe('Markdown: link recusado continua visível e copiável', () => {
  it.each([
    ['usuário no endereço', '[repo](https://usuario@git.example.com/r.git)', 'repo', 'https://usuario@git.example.com/r.git'],
    ['espaço em href de HTML cru', '<a href="https://example.com/a b">x</a>', 'x', 'https://example.com/a b'],
    ['campo de mailto fora da lista', '[m](mailto:a@example.com?in-reply-to=x)', 'm', 'mailto:a@example.com?in-reply-to=x'],
    // O sanitize apaga este `href` antes do `urlTransform`: o destino vem da
    // cópia feita antes dele.
    ['esquema que o sanitize apaga', '[x](javascript:alert(1))', 'x', 'javascript:alert(1)'],
  ])('%s: rótulo com o destino na dica e botão de copiar, sem href', (_label, source, text, destination) => {
    const html = renderMarkdown(source)

    expect(html).not.toMatch(/\shref=/i)
    expect(html).not.toMatch(/\bon[a-z]+=/i)
    expect(html).not.toMatch(/<a\b/i)
    expect(refusedLinksOf(html)).toEqual([{ destination, text }])
  })

  it('link aprovado, âncora e relativo seguem como antes, sem botão de copiar', () => {
    const html = renderMarkdown('[site](https://example.com/) [ir](#secao) [guia](OUTRO.md)')

    expect(hrefsOf(html)).toEqual(['https://example.com/', '#secao'])
    expect(html).toContain('<span>guia</span>')
    expect(html).not.toContain('Copiar endereço recusado')
    expect(html).not.toContain('Link recusado')
  })

  it('destino com invisível não vai para a dica: ela mostraria um texto e copiaria outro', () => {
    const html = renderMarkdown(`<a href="https://exa${ZERO_WIDTH_SPACE}mple.com/">x</a>`)

    expect(hrefsOf(html)).toEqual([])
    expect(html).toContain('<span>x</span>')
    expect(html).not.toContain('Copiar endereço recusado')
  })

  it('HTML cru não forja o destino recusado por atributo', () => {
    const html = renderMarkdown(
      '<a data-markdown-written-href="https://evil.example/">x</a> ' +
        '<a data-markdown-written-href="https://evil.example/" href="#secao">y</a>',
    )

    expect(html).not.toContain('evil.example')
    expect(html).not.toContain('Copiar endereço recusado')
    expect(hrefsOf(html)).toEqual(['#secao'])
  })
})

// Pedaços de Markdown e HTML que produzem destinos: o fuzz combina esquemas,
// entidades, controles e sintaxes de link, e exige que todo href que sobrar
// seja um que a política aprova.
const DESTINATIONS = [
  'https://example.com/a', 'HTTP://Example.com', 'mailto:time@example.com', 'javascript:alert(1)',
  '&#106;avascript:alert(1)', 'java&#9;script:x', 'data:text/html,x', 'file:///C:/x', 'vscode://x',
  'blob:https://example.com/x', '//evil.example', '#secao', 'notas.md', 'https://exa&#8203;mple.com',
  'https://example.com/&#8238;x', ' https://example.com/b', 'https:\\\\example.com\\c', 'about:blank',
]
const TEMPLATES = [
  (url: string) => `[texto](${url})`,
  (url: string) => `[texto](<${url}>)`,
  (url: string) => `<${url}>`,
  (url: string) => `<a href="${url}">html</a>`,
  (url: string) => `<a href='${url}'>html</a>`,
  (url: string) => `[ref]: ${url}${NEWLINE}${NEWLINE}[texto][ref]`,
  (url: string) => `![img](${url})`,
]

function seededRandom(seed: number): () => number {
  let state = seed | 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('Markdown e a política central de URL: fuzz', () => {
  it('nenhuma combinação de sintaxe e destino gera href fora da política', () => {
    const random = seededRandom(0x5eed_0101)
    const pick = <T,>(items: readonly T[]) => items[Math.floor(random() * items.length)]

    for (let index = 0; index < 400; index += 1) {
      const parts = Array.from({ length: 1 + Math.floor(random() * 3) }, () =>
        pick(TEMPLATES)(pick(DESTINATIONS) + (random() < 0.3 ? pick(DESTINATIONS) : '')),
      )
      const source = parts.join(random() < 0.5 ? ' ' : NEWLINE + NEWLINE)
      expectOnlyApprovedHrefs(renderMarkdown(source), source)
    }
  })
})

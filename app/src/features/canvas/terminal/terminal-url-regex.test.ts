import { WebLinksAddon } from '@xterm/addon-web-links'
import type { ILink, ILinkProvider, Terminal } from '@xterm/xterm'
import { describe, expect, it } from 'vitest'

import { EXTERNAL_WEB_SCHEMES, classifyExternalUrl } from '../../shared/external-url-policy'
import { isAllowedTerminalExternalLink } from './terminal-external-link'
import { TERMINAL_URL_REGEX } from './terminal-url-regex'

const ZERO_WIDTH = String.fromCodePoint(0x200b)
const RTL_OVERRIDE = String.fromCodePoint(0x202e)

/**
 * O que o `WebLinksAddon` de verdade destaca numa linha: o addon ativa num
 * terminal falso que só expõe essa linha, e o provedor que ele registra roda o
 * próprio laço (regex, `isUrl` e mapeamento de posição). Uma célula por code
 * point, largura 1.
 */
/** `urlRegex: null` deixa o addon com a regex padrão dele. */
function highlights(text: string, urlRegex: RegExp | null = TERMINAL_URL_REGEX): string[] {
  const chars = Array.from(text)
  const nullCell = {
    chars: '',
    getChars() {
      return this.chars
    },
    getWidth: () => 1,
  }
  const line = {
    isWrapped: false,
    length: chars.length,
    translateToString: () => text.replace(/\s+$/, ''),
    getCell: (x: number, cell: typeof nullCell) => {
      cell.chars = chars[x] ?? ''
      return cell
    },
  }
  let provider: ILinkProvider | undefined
  const terminal = {
    registerLinkProvider: (registered: ILinkProvider) => {
      provider = registered
      return { dispose: () => {} }
    },
    buffer: { active: { getLine: (index: number) => (index === 0 ? line : undefined), getNullCell: () => nullCell } },
  }
  new WebLinksAddon(() => {}, urlRegex ? { urlRegex } : {}).activate(terminal as unknown as Terminal)

  let links: ILink[] = []
  provider?.provideLinks(1, (found) => {
    links = found ?? []
  })
  return links.map((link) => link.text)
}

/** [linha, o que o terminal deve destacar nela, na ordem]. */
const TABELA: Array<[string, string[]]> = [
  ['ver https://en.wikipedia.org/wiki/Rust_(programming_language).', ['https://en.wikipedia.org/wiki/Rust_(programming_language)']],
  ['(https://example.com/a)', ['https://example.com/a']],
  ['Https://Example.com/Caminho', ['Https://Example.com/Caminho']],
  ['HTTP://EXAMPLE.COM/A', ['HTTP://EXAMPLE.COM/A']],
  ['[docs](https://example.com/docs)', ['https://example.com/docs']],
  ['[wiki](https://en.wikipedia.org/wiki/Rust_(lang))', ['https://en.wikipedia.org/wiki/Rust_(lang)']],
  [`"https://example.com/?q=1" e 'https://example.org/x'`, ['https://example.com/?q=1', 'https://example.org/x']],
  ['<https://example.com/a> e [https://example.com/b]', ['https://example.com/a', 'https://example.com/b']],
  [
    'fim: https://example.com/a. Depois, https://example.com/b, e https://example.com/c!',
    ['https://example.com/a', 'https://example.com/b', 'https://example.com/c'],
  ],
  ['dá certo? https://example.com/a?b=1?', ['https://example.com/a?b=1']],
  ['http://[::1]:3000/status', ['http://[::1]:3000/status']],
  ['**https://example.com/negrito**', ['https://example.com/negrito']],
  ['参见https://example.com/页面。', ['https://example.com/页面']],
  ['https://pt.wikipedia.org/wiki/São_Paulo…', ['https://pt.wikipedia.org/wiki/São_Paulo']],
  ['“https://example.com/aspas” «https://example.com/guillemets»', ['https://example.com/aspas', 'https://example.com/guillemets']],
  ['（https://example.com/largura-cheia）', ['https://example.com/largura-cheia']],
  ['https://example.com/#!/rota', ['https://example.com/#!/rota']],
  ['https://example.com/a_(b)_c', ['https://example.com/a_(b)_c']],
  ['https://x.com/@usuario', ['https://x.com/@usuario']],
  // O portão recusaria: sem destaque nenhum, nem do pedaço antes do caractere.
  ['https://google.com@evil.example/', []],
  ['https://usuario:senha@example.com/', []],
  [`https://exa${ZERO_WIDTH}mple.com`, []],
  [`https://example.com/${RTL_OVERRIDE}fdp.exe`, []],
  ['ftp://example.com javascript:alert(1) https://', []],
]

describe('TERMINAL_URL_REGEX no WebLinksAddon', () => {
  it.each(TABELA)('%s', (linha, esperado) => {
    expect(highlights(linha)).toEqual(esperado)
    // O inverso, na tabela: cada URL esperada é aprovada pelo portão.
    for (const url of esperado) expect(isAllowedTerminalExternalLink(url), url).toBe(true)
  })

  it('host IDN não é destacado: o isUrl do addon compara com o host em punycode (lado seguro)', () => {
    expect(highlights('https://münchen.de/karte')).toEqual([])
  })

  it('a regex padrão do addon é a que cortava: Wikipedia até "Rust_" e Https:// ignorado', () => {
    expect(highlights('https://en.wikipedia.org/wiki/Rust_(programming_language)', null)).toEqual([
      'https://en.wikipedia.org/wiki/Rust_',
    ])
    expect(highlights('Https://example.com/a', null)).toEqual([])
  })
})

/** Gerador determinístico (mulberry32): a mesma semente, as mesmas linhas. */
function aleatorio(semente: number) {
  let estado = semente
  return () => {
    estado = (estado + 0x6d2b79f5) | 0
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('diferencial: destacado ⇒ aprovado pelo portão, e é o que ele abriria', () => {
  const URLS = [
    'https://example.com',
    'http://a.b/c',
    'Https://Ex.com/p_(q)',
    'https://h.io/a?b=c&d=(e)',
    'https://h.io/São',
    'https://h.io/页面',
    'https://u@h.io/x',
    'https://u:p@h.io',
    `https://h.io/${ZERO_WIDTH}x`,
    `https://h${RTL_OVERRIDE}.io/x`,
    'http://[::1]:80/x',
    'https://h.io/#!/a',
    'HTTPS://H.IO/A[1]',
    'https://h.io/a)b',
    'https://h.io/((a))',
    'https://h.io/%E2%80%8B',
    'https://pay%E2%80%8Bpal.com/',
    'https://h.io/a{b}|c\\d^e`f',
    'https://münchen.de/x',
    'https:///sem-host',
  ]
  const MOLDURAS: Array<[string, string]> = [
    ['', ''],
    ['(', ')'],
    ['[', ']'],
    ['<', '>'],
    ['"', '"'],
    ["'", "'"],
    ['“', '”'],
    ['（', '）'],
    ['**', '**'],
    ['[x](', ')'],
  ]
  const FINAIS = ['', '.', ',', '!', '?', ':', ';', '...', '。', ').', ')', '*']
  const ANTES = ['', 'ver ', 'x', '→ ', 'Link: ']

  it('3000 linhas geradas: todo destaque passa no portão de página web', () => {
    const sortear = aleatorio(20261116)
    const um = <T,>(lista: readonly T[]): T => lista[Math.floor(sortear() * lista.length)]
    let destaques = 0

    for (let i = 0; i < 3000; i += 1) {
      const partes = Array.from({ length: 1 + Math.floor(sortear() * 3) }, () => {
        const [abre, fecha] = um(MOLDURAS)
        return `${um(ANTES)}${abre}${um(URLS)}${fecha}${um(FINAIS)}`
      })
      const linha = partes.join(sortear() < 0.8 ? ' ' : '')

      for (const texto of highlights(linha)) {
        destaques += 1
        const decisao = classifyExternalUrl(texto, EXTERNAL_WEB_SCHEMES)
        expect(decisao.ok, `${texto} em ${linha}`).toBe(true)
        // O que abre é a URL destacada, só normalizada pelo parser.
        if (decisao.ok) expect(decisao.url).toBe(new URL(texto).href)
        expect(linha.includes(texto)).toBe(true)
      }
    }
    expect(destaques).toBeGreaterThan(1000)
  })
})

describe('sem backtracking catastrófico', () => {
  const PATOLOGICAS: Array<[string, string]> = [
    ['parênteses abertos', `https://${'('.repeat(10_000)}`],
    ['grupos sem fechar', `https://x/${'(b'.repeat(5_000)})`],
    ['pontuação final', `https://x${'.'.repeat(10_000)}`],
    ['esquemas colados', 'https://a'.repeat(1_200)],
    ['arroba repetida', 'https://a@'.repeat(1_000)],
    ['invisível repetido', `https://a${ZERO_WIDTH}`.repeat(1_000)],
    ['invisível no fim', `https://${'a'.repeat(10_000)}${ZERO_WIDTH}`],
  ]

  it.each(PATOLOGICAS)('%s (linha de ~10 mil caracteres)', (_nome, linha) => {
    const global = new RegExp(TERMINAL_URL_REGEX.source, 'giu')
    const inicio = performance.now()
    const achados = [...linha.matchAll(global)].length
    // Medido em ~1 ms; o teto largo só pega regressão exponencial.
    expect(performance.now() - inicio).toBeLessThan(200)
    expect(achados).toBeLessThanOrEqual(1)
  })
})

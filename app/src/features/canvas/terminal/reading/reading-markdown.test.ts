import { describe, expect, it } from 'vitest'

import type { ReadingSegment } from './reading-lines'
import { blockMarkdown, escapeMarkdownText, inlineMarkdown } from './reading-markdown'
import { comparableText, renderMarkdown, renderedText, seededRandom } from './reading-test-helpers'

function segment(text: string, style: Partial<ReadingSegment> = {}): ReadingSegment {
  return { text, bold: false, italic: false, dim: false, underline: false, inverse: false, fg: null, bg: null, ...style }
}

function textOf(markdown: string): string {
  return renderedText(renderMarkdown(markdown))
}

describe('Markdown da Leitura', () => {
  it('pontuação e HTML do terminal saem como texto', () => {
    const value = '<b>oi</b> **não** _é_ [link](x) # 1. - > | ~ `x` &amp; \\ fim'

    expect(textOf(escapeMarkdownText(value))).toBe(value)
  })

  it('negrito, itálico e código inline viram estrutura; o espaço fica fora dos delimitadores', () => {
    const markdown = inlineMarkdown([
      segment('use '),
      segment(' npm test ', { fg: 'p4' }),
      segment(' e veja o '),
      segment('resultado ', { bold: true }),
      segment('final', { italic: true }),
      segment('.'),
    ])
    const html = renderMarkdown(markdown)

    expect(html).toMatch(/<code[^>]*>npm test<\/code>/)
    expect(html).toMatch(/<strong[^>]*>resultado<\/strong> <em[^>]*>final<\/em>\./)
  })

  it('negrito só de pontuação, colado em outro trecho, não deixa asteriscos à mostra', () => {
    const cases: ReadingSegment[][] = [
      [segment('('), segment('x', { bold: true }), segment(')', { bold: true })],
      [segment('a', { bold: true }), segment('b', { italic: true }), segment('c', { bold: true, italic: true })],
      [segment('**', { bold: true }), segment('meio'), segment('*', { italic: true })],
    ]
    for (const segments of cases) {
      const expected = segments.map((piece) => piece.text).join('')
      expect(textOf(inlineMarkdown(segments))).toBe(expected)
    }
  })

  it('código inline com crase usa cerca maior', () => {
    const html = renderMarkdown(inlineMarkdown([segment('rode '), segment('a`b``c', { fg: 'p2' })]))

    expect(html).toMatch(/<code[^>]*>a`b``c<\/code>/)
  })

  it('URL vira autolink sem levar a pontuação da frase; com invisível, não abre', () => {
    const html = renderMarkdown(inlineMarkdown([segment('veja (https://example.com/a_(b)). e https://exa​mple.com/')]))

    expect([...html.matchAll(/\shref="([^"]*)"/g)].map((match) => match[1])).toEqual(['https://example.com/a_(b)'])
    expect(html).toContain('data-refused-link')
    expect(html).toContain('https://exa⟨U+200B⟩mple.com/')
  })

  it('tabela escapa a barra da célula e completa colunas faltando', () => {
    const html = renderMarkdown(blockMarkdown({ kind: 'tabela', header: ['a|b', 'c'], rows: [['x'], ['1', '2', '3']] }))

    expect(html).toMatch(/<th[^>]*>a\|b<\/th>/)
    expect((html.match(/<td/g) ?? []).length).toBe(6)
  })

  it('bloco de código com cerca dentro usa cerca maior e não interpreta nada', () => {
    const lines = ['```', '<script>x</script>', '**não**']
    const html = renderMarkdown(blockMarkdown({ kind: 'codigo', lines }))

    expect(renderedText(html)).toContain(lines.join('\n'))
    expect(html).not.toContain('<strong')
  })

  it('propriedade: qualquer texto com qualquer estilo sai com o mesmo texto', () => {
    const random = seededRandom(0x1e17_0002)
    const alphabet = 'ab ç日🙂*_`[]()<>#!|~&\\-+.:/1'
    const styles: Partial<ReadingSegment>[] = [{}, { bold: true }, { italic: true }, { fg: 'p3' }, { underline: true, fg: '#63a8f8' }]
    for (let round = 0; round < 400; round += 1) {
      const segments = Array.from({ length: 1 + Math.floor(random() * 6) }, () =>
        segment(
          Array.from({ length: 1 + Math.floor(random() * 8) }, () => alphabet[Math.floor(random() * alphabet.length)]).join(''),
          styles[Math.floor(random() * styles.length)],
        ),
      )
      const expected = segments.map((piece) => piece.text).join('')
      expect(comparableText(textOf(inlineMarkdown(segments))), JSON.stringify(segments)).toBe(comparableText(expected))
    }
  })
})

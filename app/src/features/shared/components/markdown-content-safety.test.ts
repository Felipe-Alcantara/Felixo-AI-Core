import { describe, expect, it } from 'vitest'
import {
  MAX_MARKDOWN_CONTENT_CHARS,
  prepareMarkdownContent,
  stripTerminalAnsi,
} from './markdown-content-safety'

describe('preparação segura de Markdown', () => {
  it('remove ANSI de cor, OSC 8 e controles sem apagar Markdown', () => {
    const value = [
      '\u001b[31m**falha**\u001b[0m',
      '\u001b]8;;javascript:alert(1)\u0007[link]\u001b]8;;\u0007',
      'linha\u0007\u001b',
    ].join('\n')

    expect(stripTerminalAnsi(value)).toBe('**falha**\n[link]\nlinha')
  })

  it('tira o ESC de um caractere inteiro, sem sobrar o 7 ou o 8', () => {
    expect(stripTerminalAnsi('\u001b7x\u001b8')).toBe('x')
    expect(stripTerminalAnsi('\u001b=\u001b>ok\u001bc\u001b#8\u001b%G\u001b(Bfim')).toBe('okfim')
  })

  it('mantém o texto de um hyperlink OSC 8 fechado com ESC \\', () => {
    const value = 'a \u001b]8;;https://example.com\u001b\\texto\u001b]8;;\u001b\\ b'

    expect(stripTerminalAnsi(value)).toBe('a texto b')
  })

  it('tira o conteúdo de DCS e APC (imagens do terminal, passagem do tmux)', () => {
    const value = '\u001bP1;2|carga\u001b\\fim \u001b_Gf=100;AAAA\u001b\\z'

    expect(stripTerminalAnsi(value)).toBe('fim z')
  })

  it('normaliza quebras e limita o tamanho antes do parser', () => {
    const result = prepareMarkdownContent('a\r\nb\r\n' + 'x'.repeat(8), 4)

    expect(result).toEqual({ text: 'a\nb\n', truncated: true })
  })

  it('usa o limite padrão e não corta uma metade de surrogate', () => {
    const result = prepareMarkdownContent('x'.repeat(MAX_MARKDOWN_CONTENT_CHARS) + '😀')

    expect(result.truncated).toBe(true)
    expect(result.text).toHaveLength(MAX_MARKDOWN_CONTENT_CHARS)
    expect(result.text.endsWith('\ud83d')).toBe(false)
  })
})

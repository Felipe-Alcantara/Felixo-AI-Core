import { describe, expect, it } from 'vitest'

import { buildReadingBlocks } from './reading-blocks'
import type { ReadingLine, ReadingSegment } from './reading-lines'
import { blocksMarkdown } from './reading-markdown'
import { renderMarkdown, renderedText } from './reading-test-helpers'

function segment(text: string, fg: string | null = null): ReadingSegment {
  return { text, bold: false, italic: false, dim: false, underline: false, inverse: false, fg, bg: null }
}

/** O texto que a pessoa lê, depois do Markdown e do HTML. */
function readText(blocks: ReturnType<typeof buildReadingBlocks>): string {
  return renderedText(renderMarkdown(blocksMarkdown(blocks)))
}

/** Uma linha de `cols` colunas; cada trecho é `[texto, cor]` ou só o texto. */
function line(parts: (string | [string, string])[], cols?: number): ReadingLine {
  const segments = parts.map((part) => (typeof part === 'string' ? segment(part) : segment(part[0], part[1])))
  return { text: segments.map((piece) => piece.text).join(''), segments, cols }
}

describe('palavra partida pela CLI', () => {
  // O erro do Codex: a CLI quebra no hífen e a palavra continua na linha de baixo.
  const cols = 98
  it('hífen no fim da linha cheia: junta sem espaço', () => {
    const head = `${'a'.repeat(cols - 15)} modelo-que-`
    const blocks = buildReadingBlocks([line([head], cols), line(["nao-existe' não existe."], cols)])

    expect(readText(blocks)).toContain('modelo-que-nao-existe')
  })

  it('hífen numa linha curta: a quebra é do autor, volta o espaço', () => {
    const blocks = buildReadingBlocks([line(['um guarda-'], cols), line(['chuva cabe aqui.'], cols)])

    expect(readText(blocks)).toBe('um guarda- chuva cabe aqui.')
  })

  it('palavra mais longa que a linha, partida na largura: junta sem espaço', () => {
    const url = `https://example.com/${'a'.repeat(110)}`
    const blocks = buildReadingBlocks([line([`veja ${url.slice(0, cols - 5)}`], cols), line([url.slice(cols - 5)], cols)])

    expect(readText(blocks)).toContain(url)
  })

  it('quebra no espaço, mesmo com a linha cheia: segue com espaço', () => {
    const blocks = buildReadingBlocks([line([`${'ab '.repeat(31)}fim`], cols), line(['da frase continua.'], cols)])

    expect(readText(blocks)).toContain('fim da frase')
  })
})

describe('código sem cor', () => {
  it('recuo e forma de código viram bloco de código', () => {
    const blocks = buildReadingBlocks([
      line(['Exemplo:']),
      line([]),
      line(['function soma(a, b) {']),
      line(['  return a + b;']),
      line(['}']),
    ])

    expect(blocks.map((block) => block.kind)).toEqual(['paragrafo', 'codigo'])
    expect(blocks[1]).toEqual({ kind: 'codigo', lines: ['function soma(a, b) {', '  return a + b;', '}'] })
  })

  it('linha em branco dentro do código, antes de linha recuada, não corta o bloco', () => {
    const blocks = buildReadingBlocks([
      line(['class A:']),
      line(['    x = 1']),
      line([]),
      line(['    y = 2']),
      line([]),
      line(['Fim da explicação.']),
    ])

    expect(blocks.map((block) => block.kind)).toEqual(['codigo', 'paragrafo'])
  })

  it('parágrafo quebrado, com o mesmo recuo em todas as linhas, continua parágrafo', () => {
    const blocks = buildReadingBlocks([
      line(['Se a função falha: tente de novo, porque a chamada']),
      line(['pode ter perdido a conexão; a rotina refaz o pedido {sozinha}.']),
    ])

    expect(blocks.map((block) => block.kind)).toEqual(['paragrafo'])
  })
})

describe('parágrafo que começa com código inline', () => {
  it('uma cor de destaque e frase em volta é parágrafo, não código', () => {
    const blocks = buildReadingBlocks([
      line([['npm test', 'p6'], ' roda todos os testes do projeto e mostra o resultado']),
      line(['final na tela do terminal.']),
    ])

    expect(blocks.map((block) => block.kind)).toEqual(['paragrafo'])
    expect(blocksMarkdown(blocks)).toContain('`npm test`')
  })

  it('código realçado de verdade continua código', () => {
    const blocks = buildReadingBlocks([
      line([['def', 'p4'], ' soma', ['(', 'p7'], 'a, b', [')', 'p7'], ':']),
      line(['    ', ['return', 'p4'], ' a + b']),
    ])

    expect(blocks.map((block) => block.kind)).toEqual(['codigo'])
  })
})

import { describe, expect, it } from 'vitest'
import capture from './__fixtures__/agent-wrapped-url-rows.json'
import { findSpanningUrlLinks, type TerminalRowReader } from './terminal-spanning-url-links'

function reader(rows: string[], cols = capture.cols): TerminalRowReader {
  return {
    cols,
    length: rows.length,
    row: (index) => (index >= 0 && index < rows.length ? { text: rows[index] } : null),
  }
}

describe('URL quebrada em várias linhas pela TUI de um agente (captura real de 05/10/2026)', () => {
  it('Claude Code: junta a resposta recuada em 2 espaços e devolve a URL inteira de qualquer linha', () => {
    const rows = capture.rows.claudeAnswer
    for (let row = 0; row < rows.length; row += 1) {
      const links = findSpanningUrlLinks(reader(rows), row)
      expect(links.map((link) => link.url)).toEqual([capture.url])
    }
    const [link] = findSpanningUrlLinks(reader(rows), 0)
    // Começa depois do "● " da primeira linha e termina no fim da última.
    expect(link.range.start).toEqual({ x: 3, y: 1 })
    expect(link.range.end).toEqual({ x: rows[3].length, y: 4 })
  })

  it('Codex: junta o eco do prompt, quebrado com recuo e com uma coluna de folga no fim', () => {
    const rows = capture.rows.codexPromptEcho
    // A primeira linha é o texto do prompt; a URL começa na segunda.
    expect(findSpanningUrlLinks(reader(rows), 0)).toEqual([])
    for (let row = 1; row < rows.length; row += 1) {
      expect(findSpanningUrlLinks(reader(rows), row).map((link) => link.url)).toEqual([capture.url])
    }
  })

  it('Codex: a resposta com quebra mole (sem recuo) também sai inteira', () => {
    const rows = capture.rows.codexAnswer
    expect(findSpanningUrlLinks(reader(rows), 2).map((link) => link.url)).toEqual([capture.url])
  })

  it('Claude Code: o eco do prompt também vira a URL inteira', () => {
    const rows = capture.rows.claudePromptEcho
    expect(findSpanningUrlLinks(reader(rows), 3).map((link) => link.url)).toEqual([capture.url])
  })
})

describe('o que não deve virar link de várias linhas', () => {
  it('URL que cabe numa linha fica com o WebLinksAddon', () => {
    expect(findSpanningUrlLinks(reader(['veja https://example.com/curto agora']), 0)).toEqual([])
  })

  it('linha que não encosta na margem não puxa a seguinte', () => {
    const rows = ['  https://example.com/a', '  continua']
    expect(findSpanningUrlLinks(reader(rows, 40), 0)).toEqual([])
  })

  it('recuo grande na linha seguinte não é continuação', () => {
    const rows = ['https://example.com/'.padEnd(20, 'x'), '            mais']
    expect(findSpanningUrlLinks(reader(rows, 20), 0)).toEqual([])
  })

  it('pontuação de frase no fim fica fora; parêntese balanceado fica dentro', () => {
    const cols = 30
    const rows = ['ver https://example.com/wiki/A', '  _(b).']
    expect(rows[0]).toHaveLength(cols)
    expect(findSpanningUrlLinks(reader(rows, cols), 1).map((link) => link.url)).toEqual([
      'https://example.com/wiki/A_(b)',
    ])
  })

  it('só http/https: um esquema qualquer não é procurado', () => {
    const rows = ['file:///C:/Users/pessoa/'.padEnd(30, 'a'), '  b.txt']
    expect(findSpanningUrlLinks(reader(rows, 30), 0)).toEqual([])
  })
})

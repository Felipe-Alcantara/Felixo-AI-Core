import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../../../index.css', import.meta.url), 'utf8')

function ruleBody(selector: string): string | null {
  const start = css.search(new RegExp(String.raw`(^|\n)` + selector.replace(/\./g, String.raw`\.`) + String.raw`\s*\{`))
  if (start < 0) return null
  const open = css.indexOf('{', start)
  return css.slice(open + 1, css.indexOf('}', open))
}

// jsdom não calcula a cascata: este teste só prende que a nota mantém o papel
// também quando o nó está selecionado (a regra do cartão selecionado tem
// especificidade 0,3,0 e trocaria o fundo para o painel escuro).
describe('papel da nota no CSS', () => {
  it.each(['.felixo-canvas-card-note', '.react-flow__node.selected .felixo-canvas-card-note'])(
    '%s usa --note-paper, sem !important',
    (selector) => {
      const body = ruleBody(selector)
      expect(body).not.toBeNull()
      expect(body).toMatch(/background:\s*var\(--note-paper\);/)
    },
  )
})

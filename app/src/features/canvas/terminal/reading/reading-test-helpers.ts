/**
 * Apoio dos testes da Leitura: renderizar o Markdown pelo mesmo
 * `MarkdownContent` do app e comparar o texto que a pessoa vê com o texto do
 * terminal.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect } from 'vitest'

import { MarkdownContent } from '../../../shared/components/MarkdownContent'
import {
  loadFixture,
  replayFixture,
  type FixtureName,
} from '../__fixtures__/terminal-output/replay-fixture'
import { createTerminalLineReader } from './reading-lines'
import { readingProfileFor } from './reading-profiles'
import { buildTerminalReading, type TerminalReading } from './terminal-reading'

export function renderMarkdown(markdown: string): string {
  return renderToStaticMarkup(createElement(MarkdownContent, { content: markdown }))
}

/**
 * O HTML não tem nada que execute: nenhuma tag de script, quadro ou imagem,
 * nenhum atributo de evento, nenhum destino `javascript:`. O texto
 * `<script>` escapado, que aparece como texto, é permitido.
 */
export function expectInertHtml(html: string) {
  expect(html).not.toMatch(/<(?:script|iframe|object|embed|img|svg(?![^>]*lucide))\b/i)
  expect(html).not.toMatch(/<[^>]+\son[a-z]+\s*=/i)
  expect(html).not.toMatch(/(?:href|src|action)\s*=\s*"\s*javascript:/i)
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#x27': "'", '#39': "'" }

/**
 * O texto que a pessoa lê no HTML: sem tags, sem o cabeçalho do bloco de
 * código ("código"/"copiar") e sem botões, com as entidades decodificadas.
 */
export function renderedText(html: string): string {
  return html
    .replace(/<div class="flex h-7[^"]*">[\s\S]*?<\/button><\/div>/g, '')
    .replace(/<button\b[\s\S]*?<\/button>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#x27|#39);/g, (_, name: string) => ENTITIES[name])
}

/**
 * Forma de comparar texto do terminal e texto renderizado: sem espaço, sem as
 * marcas que a Leitura troca por estrutura (lista, título, citação, caixa) e
 * sem numeração de lista — aplicada igual dos dois lados.
 */
export function comparableText(text: string): string {
  return text
    .replace(/\d+\./g, '')
    .replace(/[│┌┐└┘├┤┬┴┼─━═╭╮╯╰▎⎿#>•*\-+]/g, '')
    .replace(/\s+/g, '')
}

/** A Leitura da tela final de uma gravação, com o perfil da CLI gravada. */
export async function readFixture(name: FixtureName): Promise<TerminalReading> {
  const fixture = loadFixture(name)
  const terminal = await replayFixture(fixture)
  const { lines, droppedLines } = createTerminalLineReader().read(terminal.buffer.active, terminal.cols)
  return buildTerminalReading(lines, readingProfileFor(fixture.provider, undefined), droppedLines)
}

export function seededRandom(seed: number): () => number {
  let state = seed | 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Blocos da Leitura → Markdown, para o `MarkdownContent` (o mesmo renderizador
 * sanitizado do chat) desenhar.
 *
 * Todo texto que veio do terminal é escapado: cada pontuação ASCII ganha `\`,
 * então nada vira HTML, link, ênfase ou lista que a CLI não desenhou. As
 * exceções são estruturas que a própria Leitura monta — ênfase de um trecho em
 * negrito/itálico, código, tabela — e os endereços `http(s)`, que viram
 * autolink (`<https://…>`) e passam pela política central de links como
 * qualquer link do app.
 */
import type { ReadingSegment } from './reading-lines'
import type { ReadingBlock, ReadingListItem } from './reading-blocks'

/**
 * Endereço web no meio do texto; a pontuação do fim fica fora (ver `trimUrl`).
 * Sem `|`: numa tabela ele separaria a célula antes de o autolink existir.
 */
const URL_IN_TEXT = /https?:\/\/[^\s<>"`|]+/g
const HAS_URL = /https?:\/\//
/** Pontuação ASCII: tudo o que pode virar sintaxe no CommonMark. */
const ASCII_PUNCTUATION = /[!-/:-@[-`{-~]/g

/** Trecho colorido sem negrito, sublinhado ou apagado: código inline, como as CLIs desenham. */
function isCodeSegment(segment: ReadingSegment): boolean {
  return segment.fg !== null && !segment.bold && !segment.underline && !segment.dim && !segment.italic
}

/** Escapa o texto para ele sair igual, como texto, no Markdown. */
export function escapeMarkdownText(text: string): string {
  return text.replace(ASCII_PUNCTUATION, (char) => `\\${char}`)
}

/**
 * Tira do fim da URL a pontuação que é da frase (`.`, `,`, `)` sem par):
 * "veja (https://example.com/docs)." não leva o `).` junto.
 */
function trimUrl(url: string): string {
  let end = url.length
  while (end > 0) {
    const char = url[end - 1]
    if (/[.,;:!?'*]/.test(char)) {
      end -= 1
      continue
    }
    if (char === ')') {
      const body = url.slice(0, end)
      if ((body.match(/\(/g)?.length ?? 0) < (body.match(/\)/g)?.length ?? 0)) {
        end -= 1
        continue
      }
    }
    break
  }
  return url.slice(0, end)
}

/** Texto comum: escapado, com cada URL `http(s)` como autolink. */
function plainInline(text: string): string {
  let result = ''
  let last = 0
  for (const match of text.matchAll(URL_IN_TEXT)) {
    const url = trimUrl(match[0])
    if (url.length <= 'https://'.length) continue
    result += escapeMarkdownText(text.slice(last, match.index)) + `<${url}>`
    last = match.index + url.length
  }
  return result + escapeMarkdownText(text.slice(last))
}

function isSpace(char: string): boolean {
  return char === '' || /\s/u.test(char)
}

function isPunctuation(char: string): boolean {
  return /[\p{P}\p{S}]/u.test(char)
}

/**
 * A ênfase só sai quando os delimitadores abrem e fecham pelas regras de
 * flanco do CommonMark — senão sobrariam `**` visíveis no lugar do negrito.
 * `before` é o caractere logo antes do delimitador de abertura (no Markdown já
 * escrito; vazio no começo da linha) e `after`, o logo depois do de fechamento.
 */
function emphasisFits(core: string, before: string, after: string): boolean {
  const chars = [...core]
  const first = chars[0] ?? ''
  const last = chars.at(-1) ?? ''
  const opens = !isSpace(first) && (!isPunctuation(first) || isSpace(before) || isPunctuation(before))
  const closes = !isSpace(last) && (!isPunctuation(last) || isSpace(after) || isPunctuation(after))
  return opens && closes
}

function sameLook(a: ReadingSegment, b: ReadingSegment): boolean {
  return (
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.dim === b.dim &&
    a.underline === b.underline &&
    a.inverse === b.inverse &&
    a.fg === b.fg &&
    a.bg === b.bg
  )
}

/**
 * Trechos de mesmo estilo separados só por espaço viram um: na tela clássica o
 * Claude escreve palavra por palavra, com o espaço sem estilo entre elas, e
 * cada palavra em itálico viraria uma ênfase separada.
 */
function mergeAcrossSpaces(segments: ReadingSegment[]): ReadingSegment[] {
  const merged: ReadingSegment[] = []
  for (const segment of segments) {
    const space = merged.at(-1)
    const before = merged.at(-2)
    if (
      space &&
      before &&
      space.text.trim() === '' &&
      !space.underline &&
      !space.inverse &&
      space.bg === before.bg &&
      sameLook(before, segment)
    ) {
      before.text += space.text + segment.text
      merged.pop()
      continue
    }
    merged.push({ ...segment })
  }
  return merged
}

/** Código inline: crase de fora maior que qualquer sequência de crases de dentro. */
function inlineCode(text: string): string {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((match) => match[0].length))
  const fence = '`'.repeat(longest + 1)
  // O trecho chega sem espaço nas pontas; crase na ponta precisa de espaço para não colar na cerca.
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : ''
  return `${fence}${pad}${text}${pad}${fence}`
}

/**
 * Um trecho de linha com o estilo que a CLI desenhou. O espaço das pontas fica
 * fora dos delimitadores (`** x**` não é negrito). Depois de um trecho com
 * delimitador, o seguinte colado nele sai sem: `**a***b*` é ambíguo.
 */
export function inlineMarkdown(segments: ReadingSegment[], allowCode = true): string {
  // Linha inteira numa cor só (a citação verde do Codex) é tema, não código.
  const colors = new Set(segments.filter((segment) => segment.text.trim() !== '').map((segment) => segment.fg))
  const codeAllowed = allowCode && colors.size > 1
  const pieces = mergeAcrossSpaces(segments)
  let result = ''
  let previousDelimited = false

  for (const [index, segment] of pieces.entries()) {
    let delimited = true
    const leading = segment.text.match(/^\s*/)![0]
    const trailing = segment.text.slice(leading.length).match(/\s*$/)![0]
    const core = segment.text.slice(leading.length, segment.text.length - trailing.length)
    const glued = previousDelimited && leading === ''
    const before = (result + leading).slice(-1)
    const after = trailing ? ' ' : (pieces[index + 1]?.text.charAt(0) ?? '')

    let body: string
    if (core !== '' && codeAllowed && isCodeSegment(segment) && !glued && !HAS_URL.test(core)) {
      body = inlineCode(core)
    } else if (
      core !== '' &&
      (segment.bold || segment.italic) &&
      emphasisFits(core, before, after) &&
      !glued &&
      !HAS_URL.test(core)
    ) {
      const delimiter = segment.bold && segment.italic ? '***' : segment.bold ? '**' : '*'
      body = `${delimiter}${plainInline(core)}${delimiter}`
    } else {
      body = plainInline(core)
      delimited = false
    }

    result += leading + body + trailing
    previousDelimited = delimited && trailing === ''
  }

  return result
}

/**
 * Linhas de prosa numa só: a CLI quebrou o texto na largura dela, e o
 * parágrafo do app preserva quebras (`whitespace-pre-wrap`) — num painel mais
 * estreito, as duas quebras se somariam.
 */
function proseLines(lines: ReadingSegment[][], allowCode: boolean): string {
  return lines.map((line) => inlineMarkdown(line, allowCode)).filter(Boolean).join(' ')
}

function fencedCode(lines: string[], language = ''): string {
  const longest = Math.max(0, ...lines.flatMap((line) => [...line.matchAll(/`{3,}/g)].map((match) => match[0].length)))
  const fence = '`'.repeat(Math.max(3, longest + 1))
  return `${fence}${language}\n${lines.join('\n')}\n${fence}`
}

function tableCell(text: string): string {
  // `escapeMarkdownText` já escapa o `|`, que o GFM lê como barra da célula.
  return plainInline(text) || ' '
}

function tableMarkdown(header: string[], rows: string[][]): string {
  const columns = Math.max(header.length, ...rows.map((row) => row.length))
  const pad = (row: string[]) => Array.from({ length: columns }, (_, column) => tableCell(row[column] ?? ''))
  const line = (cells: string[]) => `| ${cells.join(' | ')} |`
  return [line(pad(header)), line(Array(columns).fill('---')), ...rows.map((row) => line(pad(row)))].join('\n')
}

function listItemMarkdown(item: ReadingListItem): string {
  const marker = item.ordered ? `${item.number}.` : '-'
  const indent = '  '.repeat(item.depth * (item.ordered ? 2 : 1))
  return `${indent}${marker} ${proseLines(item.lines, true)}`
}

/** Um bloco em Markdown. */
export function blockMarkdown(block: ReadingBlock): string {
  switch (block.kind) {
    case 'titulo':
      return `${'#'.repeat(block.level)} ${inlineMarkdown(block.segments, false)}`
    case 'paragrafo':
      return proseLines(block.lines, true)
    case 'citacao':
      return `> ${proseLines(block.lines, true)}`
    case 'lista':
      return block.items.map(listItemMarkdown).join('\n')
    case 'codigo':
      return fencedCode(block.lines)
    case 'tabela':
      return tableMarkdown(block.header, block.rows)
    case 'regua':
      return '---'
    case 'nota':
      // Em itálico, como nota da CLI; sem código inline, a cor é do aviso.
      return `*${proseLines(block.lines, false)}*`
  }
}

/** Os blocos de uma fala, separados por linha em branco. */
export function blocksMarkdown(blocks: ReadingBlock[]): string {
  return blocks.map(blockMarkdown).filter(Boolean).join('\n\n')
}

/** Texto puro, sem estrutura: um bloco de código com a saída como veio. */
export function rawMarkdown(lines: string[]): string {
  return fencedCode(lines, 'text')
}

/** Uma fala de uma linha só (a pessoa, um aviso): parágrafo sem código inline. */
export function paragraphMarkdown(lines: ReadingSegment[][]): string {
  return proseLines(lines, false)
}

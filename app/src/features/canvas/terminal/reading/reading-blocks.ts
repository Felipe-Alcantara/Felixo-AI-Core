/**
 * Da tela para a estrutura: falas (pessoa, agente, aviso) e, dentro de cada
 * fala do agente, os blocos (título, lista, código, tabela, citação).
 *
 * As regras vêm de como Claude Code e Codex desenham o Markdown nas gravações
 * de `__fixtures__/terminal-output` — título em negrito ou com `##`, código
 * com cor de sintaxe, tabela com traços de caixa. É heurística: quando ela
 * erra, o texto continua inteiro (vira parágrafo ou código), e a checagem de
 * `sameReadingContent` devolve a fala ao texto puro se algum trecho sumir.
 */
import type { ReadingLine, ReadingSegment } from './reading-lines'
import type { ReadingProfile } from './reading-profiles'

export type ReadingRole = 'pessoa' | 'agente' | 'aviso' | 'saida'

export type ReadingTurn = {
  role: ReadingRole
  /** As linhas da fala, sem a marca da coluna 0 e sem o recuo de continuação. */
  lines: ReadingLine[]
}

export type ReadingListItem = {
  ordered: boolean
  number: number
  depth: number
  lines: ReadingSegment[][]
}

export type ReadingBlock =
  | { kind: 'titulo'; level: number; segments: ReadingSegment[] }
  | { kind: 'paragrafo'; lines: ReadingSegment[][] }
  | { kind: 'lista'; items: ReadingListItem[] }
  | { kind: 'citacao'; lines: ReadingSegment[][] }
  | { kind: 'codigo'; lines: string[] }
  | { kind: 'tabela'; header: string[]; rows: string[][] }
  | { kind: 'regua' }
  /** Resultado de ferramenta ou aviso dentro da fala (`⎿ Interrupted`, `└ saída`). */
  | { kind: 'nota'; lines: ReadingSegment[][] }

/** Quantas linhas, a contar do fim, a caixa de digitação e o rodapé podem ocupar. */
const INPUT_AREA_MAX_LINES = 8
/** Recuo da continuação de uma fala (a marca e o espaço depois dela). */
const TURN_INDENT = 2

const LIST_MARKER = /^(\s*)([-*•◦▪‣]|\d{1,3}[.)])\s+/
const HEADING_MARKER = /^#{1,6}\s+/
const QUOTE_MARKER = /^\s*(?:▎|>)\s?/
const RULE_LINE = /^\s*[─━═]{3,}\s*$/
/** Linha de traços em colunas, como o Codex sublinha o cabeçalho da tabela. */
const COLUMN_RULE = /^\s*[─━]{2,}(?:\s+[─━]{2,})+\s*$/
const BOX_TABLE_TOP = /^\s*┌[─┬]+┐\s*$/
const BOX_CHARS = /[│┌┐└┘├┤┬┴┼─━═╭╮╯╰]/g
/** Conector com que Claude (`⎿`) e Codex (`└`) penduram o resultado de uma ferramenta. */
const NOTE_CONNECTOR = /^\s*[⎿└]\s+/

// ---------------------------------------------------------------------------
// Falas

function leadingSpaces(text: string): number {
  return text.length - text.trimStart().length
}

function isBlank(line: ReadingLine): boolean {
  return line.text.trim() === ''
}

/** A marca da coluna 0 que abre uma fala, e o papel dela. */
function turnMarkerOf(line: ReadingLine, profile: ReadingProfile): ReadingRole | null {
  // As marcas são todas do plano básico (uma unidade UTF-16): `charAt` basta,
  // sem espalhar a linha inteira num array a cada leitura.
  const first = line.text.charAt(0)
  const second = line.text.charAt(1)
  // Espaço comum ou rígido: a caixa de digitação do Claude usa `❯` + U+00A0.
  if (second !== '' && !/\s/.test(second)) return null
  if (profile.userMarkers.includes(first)) return 'pessoa'
  if (profile.agentMarkers.includes(first)) return 'agente'
  if (profile.noticeMarkers.includes(first)) return 'aviso'
  return null
}

/** A linha sem as primeiras `count` colunas, cortando também os segmentos. */
export function sliceLine(line: ReadingLine, count: number): ReadingLine {
  let remaining = count
  const segments: ReadingSegment[] = []
  for (const segment of line.segments) {
    if (remaining >= segment.text.length) {
      remaining -= segment.text.length
      continue
    }
    segments.push({ ...segment, text: segment.text.slice(remaining) })
    remaining = 0
  }
  return { text: line.text.slice(count), segments }
}

/**
 * Onde começa a caixa de digitação: a última marca da pessoa perto do fim da
 * tela, com só rodapé depois dela. Ela e o rodapé não são conversa. Se uma
 * fala começa depois da marca, ela é um pedido de verdade (a CLI saiu e a
 * caixa sumiu, por exemplo), e nada é cortado.
 */
function inputAreaStart(lines: ReadingLine[], profile: ReadingProfile): number {
  // Só o fim da tela: a caixa fica nas últimas linhas com texto.
  let seen = 0
  for (let index = lines.length - 1; index >= 0 && seen < INPUT_AREA_MAX_LINES; index -= 1) {
    if (isBlank(lines[index])) continue
    seen += 1
    const role = turnMarkerOf(lines[index], profile)
    if (role === 'pessoa') return index
    if (role !== null) return lines.length
  }
  return lines.length
}

/** Só traço e símbolo, sem letra nem número: a borda de cima da caixa de digitação (`──── ↯ ─`). */
function isDecoration(line: ReadingLine): boolean {
  return !/[\p{L}\p{N}]/u.test(line.text)
}

/** Sem as linhas em branco das pontas, nem a borda que sobra no fim da fala. */
function trimBlankEdges(lines: ReadingLine[]): ReadingLine[] {
  let start = 0
  let end = lines.length
  while (start < end && isBlank(lines[start])) start += 1
  while (end > start && (isBlank(lines[end - 1]) || isDecoration(lines[end - 1]))) end -= 1
  return lines.slice(start, end)
}

/**
 * Divide a tela em falas. O perfil `texto` devolve uma fala só, com a saída
 * inteira. Nos outros, o que vem antes da primeira marca (logotipo, dicas) e a
 * caixa de digitação com o rodapé ficam de fora, assim como as linhas de
 * status que a CLI redesenha.
 */
export function splitReadingTurns(lines: ReadingLine[], profile: ReadingProfile): ReadingTurn[] {
  if (profile.id === 'texto') {
    const output = trimBlankEdges(lines)
    return output.length > 0 ? [{ role: 'saida', lines: output }] : []
  }

  const first = lines.findIndex((line) => turnMarkerOf(line, profile) !== null)
  if (first < 0) return []
  const end = inputAreaStart(lines, profile)

  const turns: ReadingTurn[] = []
  for (const line of lines.slice(first, Math.max(first, end))) {
    if (profile.isStatusLine(line)) continue
    const role = turnMarkerOf(line, profile)
    if (role) {
      turns.push({ role, lines: [sliceLine(line, Math.min(TURN_INDENT, line.text.length))] })
      continue
    }
    const current = turns.at(-1)
    if (current) current.lines.push(sliceLine(line, Math.min(TURN_INDENT, leadingSpaces(line.text))))
  }

  return turns
    .map((turn) => ({ ...turn, lines: trimBlankEdges(turn.lines) }))
    .filter((turn) => turn.lines.length > 0)
}

// ---------------------------------------------------------------------------
// Blocos

/** Segmento com cor de sintaxe: cor própria, sem sublinhado (link) nem negrito (título). */
function isSyntaxSegment(segment: ReadingSegment): boolean {
  return segment.fg !== null && !segment.underline && !segment.bold && segment.text.trim() !== ''
}

/**
 * A linha começa com um token colorido e mistura cores: o jeito das CLIs
 * desenharem código. Uma linha inteira numa cor só (o erro em vermelho do
 * Claude) é aviso, não código.
 */
function startsLikeCode(line: ReadingLine): boolean {
  const visible = line.segments.filter((segment) => segment.text.trim() !== '')
  const colors = new Set(visible.map((segment) => segment.fg))
  return (
    visible.length > 0 &&
    isSyntaxSegment(visible[0]) &&
    colors.size > 1 &&
    !LIST_MARKER.test(line.text) &&
    !QUOTE_MARKER.test(line.text) &&
    !NOTE_CONNECTOR.test(line.text)
  )
}

function isAllBold(line: ReadingLine): boolean {
  const visible = line.segments.filter((segment) => segment.text.trim() !== '')
  return visible.length > 0 && visible.every((segment) => segment.bold)
}

/** Os segmentos sem o espaço das pontas da linha. */
export function trimSegments(segments: ReadingSegment[]): ReadingSegment[] {
  const result = segments.map((segment) => ({ ...segment }))
  while (result.length > 0 && result[0].text.trimStart() === '') result.shift()
  while (result.length > 0 && result.at(-1)!.text.trimEnd() === '') result.pop()
  if (result.length > 0) {
    result[0].text = result[0].text.trimStart()
    result[result.length - 1].text = result[result.length - 1].text.trimEnd()
  }
  return result
}

/** Começa outro tipo de bloco nesta linha? Fecha parágrafo e citação. */
function opensOtherBlock(lines: ReadingLine[], index: number): boolean {
  const { text } = lines[index]
  return (
    LIST_MARKER.test(text) ||
    HEADING_MARKER.test(text.trimStart()) ||
    QUOTE_MARKER.test(text) ||
    NOTE_CONNECTOR.test(text) ||
    RULE_LINE.test(text) ||
    BOX_TABLE_TOP.test(text) ||
    COLUMN_RULE.test(lines[index + 1]?.text ?? '') ||
    startsLikeCode(lines[index])
  )
}

type BlockParse = { block: ReadingBlock; next: number }

/** O título já é destaque: o negrito e a cor com que a CLI o desenha não viram ênfase nem código. */
function plainHeading(segments: ReadingSegment[]): ReadingSegment[] {
  return trimSegments(segments).map((segment) => ({ ...segment, bold: false, italic: false, fg: null }))
}

function parseHeading(lines: ReadingLine[], index: number): BlockParse | null {
  const line = lines[index]
  const trimmed = line.text.trimStart()
  const hashes = HEADING_MARKER.exec(trimmed)
  if (hashes) {
    const level = hashes[0].trim().length
    return { block: { kind: 'titulo', level, segments: plainHeading(sliceLine(line, leadingSpaces(line.text) + hashes[0].length).segments) }, next: index + 1 }
  }
  // Título sem `#` (Claude): a linha toda em negrito, curta e sozinha.
  const alone = index + 1 >= lines.length || isBlank(lines[index + 1])
  if (isAllBold(line) && alone && trimmed.length <= 120 && !LIST_MARKER.test(line.text)) {
    return { block: { kind: 'titulo', level: 3, segments: plainHeading(line.segments) }, next: index + 1 }
  }
  return null
}

function parseNote(lines: ReadingLine[], index: number): BlockParse | null {
  const connector = NOTE_CONNECTOR.exec(lines[index].text)
  if (!connector) return null
  const note: ReadingSegment[][] = [trimSegments(sliceLine(lines[index], connector[0].length).segments)]
  let next = index + 1
  // O resultado continua nas linhas recuadas até a coluna do texto do conector.
  while (next < lines.length && !isBlank(lines[next]) && leadingSpaces(lines[next].text) >= connector[0].length) {
    note.push(trimSegments(lines[next].segments))
    next += 1
  }
  return { block: { kind: 'nota', lines: note }, next }
}

function parseQuote(lines: ReadingLine[], index: number): BlockParse | null {
  if (!QUOTE_MARKER.test(lines[index].text)) return null
  const quoted: ReadingSegment[][] = []
  let next = index
  while (next < lines.length && QUOTE_MARKER.test(lines[next].text)) {
    const line = lines[next]
    quoted.push(trimSegments(sliceLine(line, QUOTE_MARKER.exec(line.text)![0].length).segments))
    next += 1
  }
  return { block: { kind: 'citacao', lines: quoted }, next }
}

function parseList(lines: ReadingLine[], index: number): BlockParse | null {
  const first = LIST_MARKER.exec(lines[index].text)
  if (!first) return null
  const baseIndent = first[1].length
  const items: ReadingListItem[] = []
  let next = index

  while (next < lines.length) {
    const line = lines[next]
    const marker = LIST_MARKER.exec(line.text)
    if (marker && marker[1].length >= baseIndent) {
      const ordered = /\d/.test(marker[2])
      items.push({
        ordered,
        number: ordered ? Number.parseInt(marker[2], 10) : 0,
        depth: Math.floor((marker[1].length - baseIndent) / 2),
        lines: [trimSegments(sliceLine(line, marker[0].length).segments)],
      })
      next += 1
      continue
    }
    // Continuação: recuada além da marca, sem linha em branco no meio.
    const current = items.at(-1)
    if (current && !isBlank(line) && leadingSpaces(line.text) > baseIndent && !startsLikeCode(line)) {
      current.lines.push(trimSegments(line.segments))
      next += 1
      continue
    }
    // Linha em branco entre itens: a lista segue se o próximo é item dela.
    if (isBlank(line)) {
      const following = lines.slice(next).findIndex((candidate) => !isBlank(candidate))
      const nextMarker = following >= 0 ? LIST_MARKER.exec(lines[next + following].text) : null
      if (nextMarker && nextMarker[1].length >= baseIndent && /\d/.test(nextMarker[2]) === items[0].ordered) {
        next += following
        continue
      }
    }
    break
  }

  return { block: { kind: 'lista', items }, next }
}

function parseCode(lines: ReadingLine[], index: number): BlockParse | null {
  if (!startsLikeCode(lines[index])) return null
  const startIndent = leadingSpaces(lines[index].text)
  let next = index + 1
  while (next < lines.length) {
    const line = lines[next]
    const continues =
      !isBlank(line) &&
      (line.segments.some(isSyntaxSegment) || leadingSpaces(line.text) > startIndent) &&
      !RULE_LINE.test(line.text) &&
      !BOX_TABLE_TOP.test(line.text)
    if (!continues) break
    next += 1
  }
  const block = lines.slice(index, next).map((line) => line.text)
  const indent = Math.min(...block.map(leadingSpaces))
  return { block: { kind: 'codigo', lines: block.map((text) => text.slice(indent)) }, next }
}

/** Tabela desenhada com caixa (Claude): `┌─┬─┐`, `│ a │ b │`, `├─┼─┤`, `└─┴─┘`. */
function parseBoxTable(lines: ReadingLine[], index: number): BlockParse | null {
  if (!BOX_TABLE_TOP.test(lines[index].text)) return null
  const rows: string[][] = []
  let pending: string[] | null = null
  let next = index + 1

  for (; next < lines.length; next += 1) {
    const text = lines[next].text.trim()
    if (text.startsWith('└')) {
      next += 1
      break
    }
    if (text.startsWith('├')) {
      if (pending) rows.push(pending)
      pending = null
      continue
    }
    if (!text.startsWith('│')) break
    const cells = text.split('│').slice(1, -1).map((cell) => cell.trim())
    // Duas linhas `│` seguidas sem `├` entre elas: a célula quebrou de linha.
    pending = pending ? pending.map((cell, column) => [cell, cells[column] ?? ''].filter(Boolean).join(' ')) : cells
  }
  if (pending) rows.push(pending)
  if (rows.length === 0) return null

  const [header, ...body] = rows
  return { block: { kind: 'tabela', header, rows: body }, next }
}

/** Tabela do Codex: cabeçalho, traços em colunas por baixo, linhas separadas por `─`. */
function parseColumnTable(lines: ReadingLine[], index: number): BlockParse | null {
  const ruleLine = lines[index + 1]
  if (!ruleLine || !COLUMN_RULE.test(ruleLine.text) || isBlank(lines[index])) return null
  const starts = [...ruleLine.text.matchAll(/[─━]+/g)].map((match) => match.index)
  const split = (text: string) =>
    starts.map((start, column) => text.slice(column === 0 ? 0 : start, starts[column + 1] ?? text.length).trim())

  const rows: string[][] = []
  let pending: string[] | null = null
  let next = index + 2
  for (; next < lines.length; next += 1) {
    const { text } = lines[next]
    if (isBlank(lines[next])) break
    if (COLUMN_RULE.test(text) || RULE_LINE.test(text)) {
      if (pending) rows.push(pending)
      pending = null
      continue
    }
    const cells = split(text)
    pending = pending ? pending.map((cell, column) => [cell, cells[column]].filter(Boolean).join(' ')) : cells
  }
  if (pending) rows.push(pending)

  return { block: { kind: 'tabela', header: split(lines[index].text), rows }, next }
}

function parseParagraph(lines: ReadingLine[], index: number): BlockParse {
  const paragraph: ReadingSegment[][] = [trimSegments(lines[index].segments)]
  let next = index + 1
  while (next < lines.length && !isBlank(lines[next]) && !opensOtherBlock(lines, next)) {
    paragraph.push(trimSegments(lines[next].segments))
    next += 1
  }
  return { block: { kind: 'paragrafo', lines: paragraph }, next }
}

/** Os blocos de uma fala do agente, na ordem em que aparecem. */
export function buildReadingBlocks(lines: ReadingLine[]): ReadingBlock[] {
  const blocks: ReadingBlock[] = []
  let index = 0

  while (index < lines.length) {
    if (isBlank(lines[index])) {
      index += 1
      continue
    }
    if (RULE_LINE.test(lines[index].text) && !COLUMN_RULE.test(lines[index].text)) {
      blocks.push({ kind: 'regua' })
      index += 1
      continue
    }
    const parsed =
      parseBoxTable(lines, index) ??
      parseColumnTable(lines, index) ??
      parseNote(lines, index) ??
      parseHeading(lines, index) ??
      parseQuote(lines, index) ??
      parseList(lines, index) ??
      parseCode(lines, index) ??
      parseParagraph(lines, index)
    blocks.push(parsed.block)
    index = parsed.next
  }

  return blocks
}

// ---------------------------------------------------------------------------
// Checagem: nenhum texto some

function segmentsText(segments: ReadingSegment[]): string {
  return segments.map((segment) => segment.text).join('')
}

/** O conteúdo de uma linha sem marca de lista, `#`, `>`/`▎`, traço de caixa e espaço. */
function contentKey(text: string): string {
  return text
    .replace(LIST_MARKER, '')
    .replace(/^\s*#{1,6}\s+/, '')
    .replace(QUOTE_MARKER, '')
    .replace(NOTE_CONNECTOR, '')
    .replace(BOX_CHARS, '')
    .replace(/\s+/g, '')
}

function blockContent(block: ReadingBlock): string[] {
  switch (block.kind) {
    case 'titulo':
      return [segmentsText(block.segments)]
    case 'paragrafo':
    case 'citacao':
    case 'nota':
      return block.lines.map(segmentsText)
    case 'lista':
      return block.items.flatMap((item) => item.lines.map(segmentsText))
    case 'codigo':
      return block.lines
    case 'tabela':
      return [block.header, ...block.rows].map((row) => row.join(''))
    case 'regua':
      return []
  }
}

/**
 * Os blocos têm o mesmo texto que as linhas de onde vieram? Compara sem
 * espaço, marca e traço de caixa — o que a reconstrução troca de propósito.
 * Se não tiverem, a fala é mostrada como texto puro.
 */
export function sameReadingContent(lines: ReadingLine[], blocks: ReadingBlock[]): boolean {
  const source = lines.map((line) => contentKey(line.text)).join('')
  const rebuilt = blocks.flatMap(blockContent).map(contentKey).join('')
  return source === rebuilt
}

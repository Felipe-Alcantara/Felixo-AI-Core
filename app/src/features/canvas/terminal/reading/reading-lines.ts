/**
 * Linhas com estilo lidas do buffer do xterm — a matéria-prima da Leitura.
 *
 * A Leitura parte do que o terminal desenha, não do fluxo de bytes: o xterm já
 * interpretou cursor, cor, limpeza de tela e redesenho, e cada célula diz o
 * caractere e o estilo (negrito, itálico, cor). As CLIs de agente desenham o
 * Markdown assim — título em negrito, código colorido, tabela com traços —, e
 * é desses estilos que a Leitura reconstrói a estrutura.
 *
 * Nada aqui vira HTML: o texto sai das células como texto, e quem monta o
 * Markdown escapa cada caractere (ver `reading-markdown.ts`).
 */

/** O mínimo de uma célula do xterm (`IBufferCell`) que a Leitura usa. */
export type ReadingCell = {
  getChars(): string
  getWidth(): number
  isBold(): number
  isItalic(): number
  isDim(): number
  isUnderline(): number
  isInverse(): number
  isFgDefault(): boolean
  isBgDefault(): boolean
  isFgRGB(): boolean
  isBgRGB(): boolean
  getFgColor(): number
  getBgColor(): number
}

/** O mínimo de uma linha do buffer (`IBufferLine`). */
export type ReadingBufferLine = {
  readonly isWrapped: boolean
  readonly length: number
  getCell(x: number, cell?: ReadingCell): ReadingCell | undefined
  translateToString(trimRight?: boolean): string
}

/** O mínimo do buffer ativo do xterm (`IBuffer`). */
export type ReadingBuffer = {
  readonly type: 'normal' | 'alternate'
  readonly length: number
  /** Primeira linha da tela: as de cima dela são histórico, que não muda mais. */
  readonly baseY: number
  getLine(y: number): ReadingBufferLine | undefined
  getNullCell(): ReadingCell
}

export type ReadingStyle = {
  bold: boolean
  italic: boolean
  dim: boolean
  underline: boolean
  inverse: boolean
  /** `#rrggbb` (cor exata) ou `p<n>` (cor da paleta); `null` é a cor padrão. */
  fg: string | null
  bg: string | null
}

export type ReadingSegment = ReadingStyle & { text: string }

/** Uma linha lógica: as linhas que o terminal quebrou por largura voltam a ser uma. */
export type ReadingLine = {
  text: string
  segments: ReadingSegment[]
}

/** Quantas linhas lógicas a Leitura guarda; as mais antigas ficam só no terminal. */
export const MAX_READING_LINES = 2000

export type ReadingLinesResult = {
  lines: ReadingLine[]
  /** Linhas do começo do buffer que ficaram de fora pelo limite. */
  droppedLines: number
}

export type TerminalLineReader = {
  read(buffer: ReadingBuffer, cols: number): ReadingLinesResult
  reset(): void
}

function colorOf(rgb: boolean, isDefault: boolean, value: number): string | null {
  if (isDefault) return null
  return rgb ? `#${value.toString(16).padStart(6, '0')}` : `p${value}`
}

function styleOf(cell: ReadingCell): ReadingStyle {
  return {
    bold: cell.isBold() !== 0,
    italic: cell.isItalic() !== 0,
    dim: cell.isDim() !== 0,
    underline: cell.isUnderline() !== 0,
    inverse: cell.isInverse() !== 0,
    fg: colorOf(cell.isFgRGB(), cell.isFgDefault(), cell.getFgColor()),
    bg: colorOf(cell.isBgRGB(), cell.isBgDefault(), cell.getBgColor()),
  }
}

function sameStyle(a: ReadingStyle, b: ReadingStyle): boolean {
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
 * Os segmentos de uma linha física, sem o espaço vazio do fim. A segunda
 * metade de um caractere largo (largura 0) não é texto.
 */
export function readRowSegments(row: ReadingBufferLine, scratch: ReadingCell): ReadingSegment[] {
  const visibleLength = row.translateToString(true).length
  const segments: ReadingSegment[] = []
  let consumed = 0

  for (let x = 0; x < row.length && consumed < visibleLength; x += 1) {
    const cell = row.getCell(x, scratch)
    if (!cell || cell.getWidth() === 0) continue
    const chars = cell.getChars() || ' '
    consumed += chars.length
    const style = styleOf(cell)
    const last = segments.at(-1)
    if (last && sameStyle(last, style)) last.text += chars
    else segments.push({ ...style, text: chars })
  }

  return segments
}

function appendRow(target: ReadingLine, segments: ReadingSegment[]) {
  for (const segment of segments) {
    const last = target.segments.at(-1)
    if (last && sameStyle(last, segment)) last.text += segment.text
    else target.segments.push({ ...segment })
    target.text += segment.text
  }
}

type CachedRow = { text: string; segments: ReadingSegment[]; wrapped: boolean }

/**
 * Leitor incremental. O histórico (acima de `baseY`) não muda depois de rolar
 * para cima, então cada leitura só relê as linhas novas e a tela. O cache é
 * descartado quando o buffer troca (tela alternativa), encolhe, muda de largura
 * (o xterm refaz as quebras) ou desloca o histórico (cheio, ele descarta as
 * linhas do topo) — conferido por amostra de texto.
 */
export function createTerminalLineReader(maxLines = MAX_READING_LINES): TerminalLineReader {
  let cache = new Map<number, CachedRow>()
  let cacheKey = ''

  const reset = () => {
    cache = new Map()
    cacheKey = ''
  }

  const cachedStillValid = (buffer: ReadingBuffer): boolean => {
    for (const [row, cached] of sampleRows(cache)) {
      if (buffer.getLine(row)?.translateToString(true) !== cached.text) return false
    }
    return true
  }

  return {
    reset,
    read(buffer, cols) {
      const key = `${buffer.type}:${cols}`
      if (key !== cacheKey || !cachedStillValid(buffer)) {
        cache = new Map()
        cacheKey = key
      }

      const firstRow = Math.max(0, buffer.length - maxLines)
      const scratch = buffer.getNullCell()
      const lines: ReadingLine[] = []
      let current: ReadingLine | null = null

      for (let y = firstRow; y < buffer.length; y += 1) {
        let row = y < buffer.baseY ? cache.get(y) : undefined
        if (!row) {
          const line = buffer.getLine(y)
          if (!line) continue
          const segments = readRowSegments(line, scratch)
          row = { text: segments.map((segment) => segment.text).join(''), segments, wrapped: line.isWrapped }
          if (y < buffer.baseY && buffer.type === 'normal') cache.set(y, row)
        }

        if (row.wrapped && current) {
          appendRow(current, row.segments)
          continue
        }
        current = { text: '', segments: [] }
        appendRow(current, row.segments)
        lines.push(current)
      }

      // Linhas que saíram da janela não voltam: o cache não cresce sem limite.
      for (const row of cache.keys()) if (row < firstRow) cache.delete(row)

      return { lines, droppedLines: firstRow }
    },
  }
}

/** Primeira, do meio e última linha do cache: um deslocamento muda alguma delas. */
function sampleRows(cache: Map<number, CachedRow>): [number, CachedRow][] {
  if (cache.size === 0) return []
  const rows = [...cache.keys()]
  const picks = new Set([rows[0], rows[Math.floor(rows.length / 2)], rows[rows.length - 1]])
  return [...picks].map((row) => [row, cache.get(row)!])
}

/**
 * URL que uma TUI de agente quebrou em várias linhas do terminal.
 *
 * O `WebLinksAddon` só junta linhas que o xterm marcou como continuação
 * (`isWrapped`) e roda o regex no texto cru. Medido ao vivo em 05/10/2026,
 * com uma URL de 322 caracteres pedida aos agentes reais num terminal de 100
 * colunas (Windows, ConPTY):
 *
 * - Claude Code 2.1.285 posiciona o cursor na coluna 3 (`ESC[23;3H`) a cada
 *   linha da resposta. A primeira quebra chega SEM `isWrapped`, e o recuo de
 *   dois espaços vira caractere de verdade no buffer — inclusive dentro das
 *   linhas seguintes que o xterm marca como `isWrapped`. O addon via só
 *   `https://…/segment` e o clique abria a URL cortada.
 * - Codex 0.150.1 imprime a resposta com quebra mole (o addon já resolve), mas
 *   ecoa o prompt com quebra dura e o mesmo recuo de dois espaços.
 *
 * Por isso o critério de continuação é geométrico, não o `isWrapped`: a linha
 * encosta na margem direita (com até uma coluna de folga — o Codex deixa um
 * espaço no fim) e a seguinte começa com um recuo curto seguido de um
 * caractere de URL. Uma URL que termina exatamente na margem pode, raramente,
 * puxar a primeira palavra da linha seguinte; o menu de destino mostra o
 * endereço inteiro antes de abrir, então isso nunca abre nada às cegas.
 */

export type TerminalRowText = {
  /** Texto da linha sem os espaços à direita (`translateToString(true)`). */
  text: string
}

export type TerminalRowReader = {
  cols: number
  length: number
  row(index: number): TerminalRowText | null
}

/** Posição 1-based, final inclusivo — o formato de `IBufferRange` do xterm. */
export type SpanningUrlLink = {
  url: string
  range: { start: { x: number; y: number }; end: { x: number; y: number } }
}

/** Recuo máximo aceito numa linha de continuação. As TUIs medidas usam 2. */
const MAX_CONTINUATION_INDENT = 8
/** Teto de linhas juntadas, para uma tela cheia de texto não virar uma URL. */
const MAX_JOINED_ROWS = 24
const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/g
const URL_CHAR = /[^\s<>"'`]/

/**
 * A linha `index` continua na seguinte? Ela precisa encostar na margem direita
 * e a próxima precisa começar, depois do recuo curto, com caractere de URL.
 */
function continuesIntoNext(reader: TerminalRowReader, index: number): boolean {
  const current = reader.row(index)
  const next = reader.row(index + 1)
  if (!current || !next) return false
  if (current.text.length < reader.cols - 1) return false
  const last = current.text.at(-1) ?? ''
  if (!URL_CHAR.test(last)) return false
  const indent = next.text.length - next.text.trimStart().length
  if (indent > MAX_CONTINUATION_INDENT) return false
  const first = next.text.charAt(indent)
  return first !== '' && URL_CHAR.test(first)
}

/**
 * Remove a pontuação que fecha uma frase, não a URL: `.` `,` `;` `:` `!` `?`
 * no fim, e `)` sem `(` correspondente dentro da própria URL.
 */
function trimTrailingPunctuation(url: string): string {
  let result = url.replace(/[.,;:!?]+$/, '')
  while (result.endsWith(')')) {
    const opens = (result.match(/\(/g) ?? []).length
    const closes = (result.match(/\)/g) ?? []).length
    if (closes <= opens) break
    result = result.slice(0, -1).replace(/[.,;:!?]+$/, '')
  }
  return result
}

/**
 * URLs que atravessam mais de uma linha e passam pela linha `bufferRow`
 * (0-based). Links de uma linha só ficam com o `WebLinksAddon`.
 */
export function findSpanningUrlLinks(reader: TerminalRowReader, bufferRow: number): SpanningUrlLink[] {
  if (bufferRow < 0 || bufferRow >= reader.length) return []

  let first = bufferRow
  while (first > 0 && bufferRow - first < MAX_JOINED_ROWS && continuesIntoNext(reader, first - 1)) {
    first -= 1
  }
  let last = bufferRow
  while (last < reader.length - 1 && last - first < MAX_JOINED_ROWS && continuesIntoNext(reader, last)) {
    last += 1
  }
  if (first === last) return []

  // Texto juntado e, para cada caractere dele, a célula de onde veio.
  let joined = ''
  const cells: Array<{ x: number; y: number }> = []
  for (let index = first; index <= last; index += 1) {
    const text = reader.row(index)?.text ?? ''
    const start = index === first ? 0 : text.length - text.trimStart().length
    // A folga de uma coluna no fim da linha (o espaço do Codex) não entra.
    const end = index === last ? text.length : text.trimEnd().length
    for (let x = start; x < end; x += 1) {
      joined += text.charAt(x)
      cells.push({ x, y: index })
    }
  }

  const links: SpanningUrlLink[] = []
  for (const match of joined.matchAll(URL_PATTERN)) {
    const url = trimTrailingPunctuation(match[0])
    const startIndex = match.index ?? 0
    const endIndex = startIndex + url.length - 1
    const startCell = cells[startIndex]
    const endCell = cells[endIndex]
    if (!startCell || !endCell || startCell.y === endCell.y) continue
    if (bufferRow < startCell.y || bufferRow > endCell.y) continue
    links.push({
      url,
      range: {
        start: { x: startCell.x + 1, y: startCell.y + 1 },
        end: { x: endCell.x + 1, y: endCell.y + 1 },
      },
    })
  }
  return links
}

/**
 * A Leitura de um terminal: a tela já desenhada → falas com Markdown pronto
 * para o `MarkdownContent`.
 *
 * Cada fala carrega o próprio texto puro (`text`), que é o que "Copiar" leva
 * e o que aparece quando a reconstrução não confere com a tela (`raw`): se um
 * trecho sumiria, ou se algo lança erro, a fala volta ao texto como o terminal
 * mostra. A Leitura nunca é a única cópia do conteúdo — o terminal continua lá.
 */
import {
  buildReadingBlocks,
  sameReadingContent,
  splitReadingTurns,
  trimSegments,
  type ReadingBlock,
  type ReadingRole,
} from './reading-blocks'
import type { ReadingLine } from './reading-lines'
import { blocksMarkdown, paragraphMarkdown, rawMarkdown } from './reading-markdown'
import type { ReadingProfile, ReadingProfileId } from './reading-profiles'

export type ReadingTurnView = {
  role: ReadingRole
  markdown: string
  /** A fala como o terminal mostra, sem a marca da coluna 0: o que "Copiar" leva. */
  text: string
  /** A estrutura não conferiu com a tela (ou deu erro): a fala sai como texto puro. */
  raw: boolean
  /** Os blocos da fala (para a prévia do cartão); `null` quando ela sai como texto puro. */
  blocks: ReadingBlock[] | null
}

export type TerminalReading = {
  profile: ReadingProfileId
  turns: ReadingTurnView[]
  /** Linhas antigas que ficaram de fora pelo limite de memória (seguem no terminal). */
  droppedLines: number
}

function turnText(lines: ReadingLine[]): string {
  return lines.map((line) => line.text.trimEnd()).join('\n')
}

function rawTurn(role: ReadingRole, lines: ReadingLine[]): ReadingTurnView {
  const text = turnText(lines)
  return { role, text, markdown: rawMarkdown(text.split('\n')), raw: true, blocks: null }
}

/** Uma fala → Markdown, ou texto puro quando a estrutura não confere. */
export function readTurn(role: ReadingRole, lines: ReadingLine[]): ReadingTurnView {
  try {
    if (role === 'saida') return rawTurn(role, lines)
    if (role !== 'agente') {
      const paragraph = lines.map((line) => trimSegments(line.segments))
      return {
        role,
        text: turnText(lines),
        markdown: paragraphMarkdown(paragraph),
        raw: false,
        blocks: [{ kind: 'paragrafo', lines: paragraph }],
      }
    }
    const blocks = buildReadingBlocks(lines)
    if (!sameReadingContent(lines, blocks)) return rawTurn(role, lines)
    return { role, text: turnText(lines), markdown: blocksMarkdown(blocks), raw: false, blocks }
  } catch {
    return rawTurn(role, lines)
  }
}

/**
 * Falas já montadas, pela chave de conteúdo (texto e estilo de cada linha).
 * No stream só a última fala muda: as outras saem daqui sem passar pelos
 * blocos nem pelo Markdown de novo. Guarda só as falas da última leitura.
 */
export type ReadingTurnCache = Map<string, ReadingTurnView>

export function createReadingTurnCache(): ReadingTurnCache {
  return new Map()
}

/** Texto e estilo da fala numa string: igual só se a fala renderizaria igual. */
function turnKey(role: ReadingRole, lines: ReadingLine[]): string {
  let key = role
  for (const line of lines) {
    key += '\u0002'
    for (const segment of line.segments) {
      const flags = (segment.bold ? 1 : 0) | (segment.italic ? 2 : 0) | (segment.dim ? 4 : 0) | (segment.underline ? 8 : 0)
      key += `\u0001${flags}${segment.fg ?? ''}\u0001${segment.text}`
    }
  }
  return key
}

/** A Leitura da tela inteira com o perfil da CLI. */
export function buildTerminalReading(
  lines: ReadingLine[],
  profile: ReadingProfile,
  droppedLines = 0,
  cache?: ReadingTurnCache,
): TerminalReading {
  let turns: ReadingTurnView[]
  try {
    const used = new Map<string, ReadingTurnView>()
    turns = splitReadingTurns(lines, profile).map((turn) => {
      if (!cache) return readTurn(turn.role, turn.lines)
      const key = turnKey(turn.role, turn.lines)
      const view = cache.get(key) ?? readTurn(turn.role, turn.lines)
      used.set(key, view)
      return view
    })
    if (cache) {
      cache.clear()
      for (const [key, view] of used) cache.set(key, view)
    }
  } catch {
    // A divisão em falas falhou: a tela inteira, como texto.
    turns = lines.length > 0 ? [rawTurn('saida', lines)] : []
  }
  return { profile: profile.id, turns, droppedLines }
}

/** O texto puro de todas as falas, separadas por linha em branco: o que "Copiar texto" leva. */
export function readingPlainText(reading: TerminalReading | null): string {
  return (reading?.turns ?? []).map((turn) => turn.text).join('\n\n')
}

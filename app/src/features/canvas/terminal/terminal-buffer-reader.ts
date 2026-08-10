/**
 * Leitura do buffer renderizado do xterm.
 *
 * Este é o texto já limpo e interpretado que o terminal mostra — bem mais
 * confiável do que remover ANSI do fluxo de bytes por conta própria. Isolado do
 * store porque não depende de sessão: recebe um terminal, devolve texto.
 */
import type { Terminal } from '@xterm/xterm'

/** Quantas linhas de saída a pré-visualização do bloco mostra. */
const PREVIEW_LINES = 6

/** Rodapé fixo das CLIs de agente (modelo, tokens), não parte da resposta. */
const TERMINAL_CHROME_LINE =
  /^(?:gpt-|claude|gemini)\S*.*[·•]|^(?:model|tokens?|contexto|esc to interrupt)\b/i

/** Quadros de spinner (braille, ascii, pontos, relógios) que as CLIs animam. */
const ANIMATION_GLYPHS = /[⠀-⣿■-◿▖-▟⏰-⏿⠿|/\-\\▁▂▃▄▅▆▇█·•∙…]/g

/** Contadores de tempo como "12s", "1m04s", "(3.2s)", que mudam a cada quadro. */
const ELAPSED_TIMER = /\(?\b\d+(?:[.:]\d+)?\s?(?:ms|s|m|h)\b\)?/g

function lineAt(terminal: Terminal, row: number): string {
  return terminal.buffer.active.getLine(row)?.translateToString(true).trimEnd() ?? ''
}

function joinTrimmed(lines: string[]): string {
  return lines.join('\n').replace(/\n+$/, '')
}

/** Texto visível na área do terminal, sem o histórico rolado para cima. */
export function readViewport(terminal: Terminal): string {
  const start = terminal.buffer.active.viewportY
  const lines: string[] = []

  for (let row = start; row < start + terminal.rows; row += 1) {
    lines.push(lineAt(terminal, row))
  }

  return joinTrimmed(lines)
}

/** Buffer inteiro, incluindo o histórico rolado. */
export function readBuffer(terminal: Terminal): string {
  const lines: string[] = []

  for (let row = 0; row < terminal.buffer.active.length; row += 1) {
    lines.push(lineAt(terminal, row))
  }

  return joinTrimmed(lines)
}

/**
 * Últimos caracteres do buffer. Evita reprocessar um histórico grande a cada
 * chegada de saída.
 */
export function readTerminalTail(terminal: Terminal, maxChars = 16_000): string {
  const lines: string[] = []
  let length = 0

  for (let row = terminal.buffer.active.length - 1; row >= 0 && length < maxChars; row -= 1) {
    const line = lineAt(terminal, row)
    lines.unshift(line)
    length += line.length + 1
  }

  return lines.join('\n').slice(-maxChars)
}

/** Últimas linhas não vazias da saída, sem o rodapé fixo da CLI. */
export function computePreview(terminal: Terminal): string[] {
  const buffer = terminal.buffer.active
  const lines: string[] = []

  // Sobe a partir da última linha, coletando o que não está vazio.
  for (let row = buffer.length - 1; row >= 0 && lines.length < PREVIEW_LINES; row -= 1) {
    const text = lineAt(terminal, row)
    if (text.length > 0 && !TERMINAL_CHROME_LINE.test(text.trim())) {
      lines.unshift(text)
    }
  }

  return lines
}

/**
 * Assinatura do que o terminal mostra agora, com quadros de spinner e
 * contadores de tempo normalizados.
 *
 * Duas repinturas da mesma tela de espera — diferentes apenas por um glifo
 * animado — colapsam na mesma string, então não contam como trabalho novo. A
 * contagem total de linhas entra como âncora para que rolagem real seja
 * detectada mesmo quando o texto visível se repete.
 */
export function computeSignature(terminal: Terminal): string {
  const buffer = terminal.buffer.active
  const start = Math.max(0, buffer.length - terminal.rows)
  const lines: string[] = []

  for (let row = start; row < buffer.length; row += 1) {
    const text = buffer.getLine(row)?.translateToString(true) ?? ''
    lines.push(text.replace(ELAPSED_TIMER, '').replace(ANIMATION_GLYPHS, '').trimEnd())
  }

  return `${buffer.length}|${lines.join('\n').replace(/\s+/g, ' ').trim()}`
}

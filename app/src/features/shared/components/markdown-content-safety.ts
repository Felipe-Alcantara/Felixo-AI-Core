/** Limite de texto que o renderer de Markdown aceita antes de fazer o parse. */
export const MAX_MARKDOWN_CONTENT_CHARS = 200_000

/**
 * Sequências ANSI comuns em saída de terminal.
 *
 * O conteúdo do terminal chega como texto externo e pode ser reutilizado numa
 * mensagem ou prévia Markdown. Remover CSI/OSC antes do parser evita que
 * estados visuais, hyperlinks OSC 8 e controles de cursor contaminem o texto
 * que o renderer interpreta.
 */
const ANSI_ESCAPE_PATTERN =
  // eslint-disable-next-line no-control-regex -- a barreira precisa reconhecer bytes ANSI.
  /(?:\u001B\][^\u0007]*(?:\u0007|\u001B\\)|\u001B\[[0-?]*[ -/]*[@-~]|\u001B[()][0-2A-Z]|\u001B[@-_]|\u009B[0-?]*[ -/]*[@-~])/g

/** C0/C1 restantes não têm lugar no Markdown exibido. Quebras são preservadas. */
const TERMINAL_CONTROL_PATTERN =
  // eslint-disable-next-line no-control-regex -- controles são removidos antes do parser.
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g

export type PreparedMarkdownContent = {
  text: string
  truncated: boolean
}

/** Remove controles ANSI sem alterar texto, tabs ou quebras de linha úteis. */
export function stripTerminalAnsi(value: string): string {
  return String(value ?? '')
    .replace(ANSI_ESCAPE_PATTERN, '')
    .replace(TERMINAL_CONTROL_PATTERN, '')
}

/**
 * Prepara texto externo para o parser Markdown e aplica o limite antes de
 * `rehypeRaw`/`rehypeSanitize`. O corte é feito em caracteres UTF-16, mas evita
 * deixar uma metade isolada de surrogate no fim do conteúdo.
 */
export function prepareMarkdownContent(
  value: string,
  maxChars = MAX_MARKDOWN_CONTENT_CHARS,
): PreparedMarkdownContent {
  const normalized = stripTerminalAnsi(value).replace(/\r\n?/g, '\n')
  const safeLimit = Number.isFinite(maxChars)
    ? Math.max(0, Math.floor(maxChars))
    : MAX_MARKDOWN_CONTENT_CHARS

  if (normalized.length <= safeLimit) {
    return { text: normalized, truncated: false }
  }

  let text = normalized.slice(0, safeLimit)
  const lastCodeUnit = text.charCodeAt(text.length - 1)

  if (lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff) {
    text = text.slice(0, -1)
  }

  return { text, truncated: true }
}

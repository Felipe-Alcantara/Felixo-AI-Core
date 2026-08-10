/**
 * Converts a complete prompt into bytes that submit it in an interactive PTY.
 * Internal LF characters remain available for multi-line instructions; only
 * trailing line endings are normalized to CR, which agent CLIs treat as Enter.
 */
export function toSubmittedTerminalText(text: string): string {
  return `${text.replace(/(?:\r\n|\r|\n)+$/, '')}\r`
}

/**
 * Verdadeiro quando o prompt traz o próprio Enter — ou seja, foi montado para
 * ser executado, não só digitado.
 *
 * A quebra final é a forma como um prompt carrega essa intenção por todo o
 * caminho até o PTY: contexto que só prepara o agente termina sem ela e fica
 * esperando na linha de entrada; uma tarefa de verdade (`/resume`, uma
 * passagem de responsabilidade) termina com ela e roda sozinha.
 */
export function isSubmittedTerminalText(text: string): boolean {
  return /(?:\r\n|\r|\n)$/.test(text)
}

/** Devolve o prompt sem o Enter final: o texto deixa de pedir execução. */
export function stripTerminalSubmission(text?: string): string | undefined {
  return text?.replace(/(?:\r\n|\r|\n)+$/, '')
}

/**
 * Splits a prompt into the text and the Enter key sent to the PTY.
 * Some full-screen CLIs need a render turn between receiving pasted text and
 * receiving Enter, otherwise the key can be handled as a plain line break.
 *
 * `submit` vem nulo quando o prompt não pede execução: aí o texto é só
 * escrito na entrada da CLI e quem decide enviar é o usuário.
 */
export function splitTerminalSubmission(text: string): { text: string; submit: '\r' | null } {
  return {
    text: text.replace(/(?:\r\n|\r|\n)+$/, ''),
    submit: isSubmittedTerminalText(text) ? '\r' : null,
  }
}

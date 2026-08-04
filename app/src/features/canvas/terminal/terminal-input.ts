/**
 * Converts a complete prompt into bytes that submit it in an interactive PTY.
 * Internal LF characters remain available for multi-line instructions; only
 * trailing line endings are normalized to CR, which agent CLIs treat as Enter.
 */
export function toSubmittedTerminalText(text: string): string {
  return `${text.replace(/(?:\r\n|\r|\n)+$/, '')}\r`
}

/**
 * Splits a submitted prompt into the text and the Enter key sent to the PTY.
 * Some full-screen CLIs need a render turn between receiving pasted text and
 * receiving Enter, otherwise the key can be handled as a plain line break.
 */
export function splitTerminalSubmission(text: string): { text: string; submit: '\r' } {
  const submitted = toSubmittedTerminalText(text)
  return { text: submitted.slice(0, -1), submit: '\r' }
}

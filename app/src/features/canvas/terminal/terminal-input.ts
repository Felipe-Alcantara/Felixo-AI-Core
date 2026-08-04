/**
 * Converts a complete prompt into bytes that submit it in an interactive PTY.
 * Internal LF characters remain available for multi-line instructions; only
 * trailing line endings are normalized to CR, which agent CLIs treat as Enter.
 */
export function toSubmittedTerminalText(text: string): string {
  return `${text.replace(/(?:\r\n|\r|\n)+$/, '')}\r`
}

/**
 * Detects explicit provider/CLI usage-limit messages in a terminal buffer.
 *
 * This is intentionally stricter than a generic error detector: the handoff
 * action must not appear merely because an agent mentioned quota/rate limits
 * while discussing code.
 */
export type TerminalUsageLimit = {
  reason: string
  resetLabel?: string
}

const LIMIT_PATTERNS = [
  /out of extra usage/i,
  /usage limit/i,
  /rate limit/i,
  /too many requests/i,
  /quota exceeded/i,
  /exceeded your current quota/i,
  /resource exhausted/i,
  /limit reached/i,
  /limite de uso/i,
  /limite atingido/i,
  /limite excedido/i,
  /\b429\b/,
]

const RESET_PATTERN = /\bresets?\s+([^\r\n•·]+)/i

/** Returns a compact, user-facing limit description when one is present. */
export function detectTerminalUsageLimit(text: string): TerminalUsageLimit | undefined {
  // eslint-disable-next-line no-control-regex
  const normalized = String(text ?? '').replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
  const match = LIMIT_PATTERNS.find((pattern) => pattern.test(normalized))

  if (!match) {
    return undefined
  }

  const resetMatch = normalized.match(RESET_PATTERN)
  const resetLabel = resetMatch?.[1]?.trim().replace(/\s+/g, ' ')
  const reason = compactReason(normalized, match)

  return {
    reason,
    ...(resetLabel ? { resetLabel } : {}),
  }
}

function compactReason(text: string, match: RegExp): string {
  const matchedText = text.match(match)?.[0] ?? 'limite de uso'
  const line = text
    .split(/\r?\n/)
    .find((candidate) => match.test(candidate))
    ?.replace(/\s+/g, ' ')
    .trim()

  const result = line || matchedText
  return result.length > 240 ? `${result.slice(0, 240)}…` : result
}

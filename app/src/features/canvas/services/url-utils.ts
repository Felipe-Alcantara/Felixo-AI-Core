// Normalização de URL para o bloco "Página Web": aceita entradas digitadas
// como numa barra de endereços de navegador (sem protocolo) e valida que o
// resultado é uma URL http(s) de verdade.

/**
 * Accepts URLs without a protocol (like a browser's address bar) and
 * prefixes `https://` automatically. Returns `undefined` when the resulting
 * text isn't a parseable http(s) URL — this only rejects obviously invalid
 * input, it's not a domain allowlist/blocklist.
 */
export function normalizeUrlInput(raw: string): string | undefined {
  const trimmed = raw.trim()
  if (!trimmed) {
    return undefined
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const parsed = new URL(withProtocol)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? parsed.toString()
      : undefined
  } catch {
    return undefined
  }
}

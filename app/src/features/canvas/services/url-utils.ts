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

  // Só o texto SEM esquema ganha o https:// implícito. Sem esta checagem,
  // `file:///etc/passwd` não casaria com o teste de http(s), seria prefixado
  // e viraria `https://file///etc/passwd` — um endereço absurdo em vez de uma
  // rejeição. O mesmo valia para ftp://, chrome:// e afins.
  //
  // O esquema exige `//` logo depois dos dois-pontos, senão `localhost:3000`
  // seria lido como esquema "localhost" e o endereço de um servidor local
  // deixaria de funcionar. Os esquemas sem `//` que importam bloquear —
  // javascript:, data:, about: — já são barrados pela checagem de protocolo
  // no fim, porque o https:// implícito não os torna http(s).
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
  const candidate = hasScheme ? trimmed : `https://${trimmed}`

  try {
    const parsed = new URL(candidate)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? parsed.toString()
      : undefined
  } catch {
    return undefined
  }
}

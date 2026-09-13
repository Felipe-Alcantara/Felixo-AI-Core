// Normalização de URL para o bloco "Página Web": aceita entradas digitadas
// como numa barra de endereços de navegador (sem protocolo) e valida que o
// resultado é uma URL http(s) de verdade.

/**
 * Accepts URLs without a protocol (like a browser's address bar) and
 * prefixes `https://` automatically, except for loopback hosts commonly used
 * by local development servers, which default to `http://`. Returns
 * `undefined` when the resulting text isn't a parseable http(s) URL — this
 * only rejects obviously invalid input, it's not a domain allowlist/blocklist.
 */
export function normalizeUrlInput(raw: string): string | undefined {
  const trimmed = raw.trim()
  if (!trimmed) {
    return undefined
  }

  // Só o texto SEM esquema ganha um protocolo implícito. Sem esta checagem,
  // `file:///etc/passwd` não casaria com o teste de http(s), seria prefixado
  // e viraria `https://file///etc/passwd` — um endereço absurdo em vez de uma
  // rejeição. O mesmo valia para ftp://, chrome:// e afins.
  //
  // O esquema exige `//` logo depois dos dois-pontos, senão `localhost:3000`
  // seria lido como esquema "localhost" e o endereço de um servidor local
  // deixaria de funcionar. Os esquemas sem `//` que importam bloquear —
  // javascript:, data:, about: — já são barrados pela checagem de protocolo
  // no fim, porque o protocolo implícito não os torna http(s).
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
  const implicitProtocol = hasScheme ? '' : isLoopbackAddress(trimmed) ? 'http://' : 'https://'
  const candidate = hasScheme ? trimmed : `${implicitProtocol}${trimmed}`

  try {
    const parsed = new URL(candidate)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? parsed.toString()
      : undefined
  } catch {
    return undefined
  }
}

/**
 * Local development servers almost always speak plain HTTP. Detect the host
 * from a temporary HTTPS parse so paths, ports, and IPv6 brackets are handled
 * by the platform URL parser instead of by a second hand-written grammar.
 */
function isLoopbackAddress(raw: string): boolean {
  try {
    const hostname = new URL(`https://${raw}`).hostname.toLowerCase().replace(/^\[|\]$/g, '')
    return (
      hostname === 'localhost' ||
      hostname === 'localhost.localdomain' ||
      hostname === '::1' ||
      /^127(?:\.\d{1,3}){3}$/.test(hostname)
    )
  } catch {
    return false
  }
}

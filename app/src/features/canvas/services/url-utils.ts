// Normalização de URL para o bloco "Página Web": aceita entradas digitadas
// como numa barra de endereços de navegador (sem protocolo) e decide o
// resultado pela política única de URL externa — a mesma que o processo
// principal aplica ao `src` de todo webview que o renderer tenta anexar.
import { classifyExternalUrl, EXTERNAL_WEB_SCHEMES } from '../../shared/external-url-policy'

/**
 * Accepts URLs without a protocol (like a browser's address bar) and
 * prefixes `https://` automatically, except for loopback hosts commonly used
 * by local development servers, which default to `http://`. Returns
 * `undefined` when the resulting text isn't a web URL the external URL policy
 * accepts — this is not a domain allowlist/blocklist.
 *
 * A decisão final é da política, não de um `new URL` local: a barra aceitava
 * `https://usuario:senha@host`, espaço interno (o parser codificava para
 * `%20`) e endereço acima do limite, e o bloco gravava esse endereço. O
 * processo principal recusa o mesmo texto como `src` do webview, então no
 * próximo remount a página sumia. Uma regra só, dos dois lados.
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
  // javascript:, data:, about: — também não passam: com o protocolo
  // implícito viram `https://javascript:alert(1)`, cuja "porta" não é número,
  // e a política recusa como malformada.
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
  const implicitProtocol = hasScheme ? '' : isLoopbackAddress(trimmed) ? 'http://' : 'https://'
  const candidate = hasScheme ? trimmed : `${implicitProtocol}${trimmed}`

  const decision = classifyExternalUrl(candidate, EXTERNAL_WEB_SCHEMES)
  return decision.ok ? decision.url : undefined
}

/**
 * A URL que uma navegação do webview pode gravar no bloco, ou `undefined`
 * quando ela não serviria de `src` num remount.
 *
 * O `did-navigate` informa qualquer endereço em que a página caiu: um SPA que
 * guarda estado no fragmento passa fácil de 8192 caracteres, um link leva a
 * `https://usuario@host`, um popup começa em `about:blank`. Gravar isso
 * trocava a última página boa por uma que o processo principal recusa no
 * próximo attach — e o bloco reabria em branco. Quem chama mantém a última URL
 * aceita; a página em si continua aberta, só não vira o endereço salvo.
 *
 * Devolve a serialização da política (e não o texto do webview) pelo mesmo
 * motivo do `normalizeUrlInput`: o que fica salvo é exatamente o que foi
 * validado.
 */
export function persistableNavigationUrl(navigatedUrl: unknown): string | undefined {
  const decision = classifyExternalUrl(navigatedUrl, EXTERNAL_WEB_SCHEMES)
  return decision.ok ? decision.url : undefined
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

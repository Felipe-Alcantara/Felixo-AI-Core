/**
 * Política única de URL externa do lado do renderer.
 *
 * Toda superfície que transforma texto em link clicável (terminal, hyperlink
 * OSC 8, Markdown, menus) pergunta aqui se aquele texto pode sair do app. O
 * renderer NÃO é o portão: ele só decide o que parece e age como link. O
 * portão é `electron/services/external-url-policy.cjs`, que repete a mesma
 * decisão antes de qualquer `shell.openExternal`. As duas implementações leem
 * a allowlist do mesmo JSON e rodam a mesma tabela de casos
 * (`external-url-policy.cases.json`); um teste diferencial compara as duas em
 * entradas aleatórias.
 *
 * A URL devolvida é a serialização do parser (`URL.href`), não o texto
 * original: quem abre recebe exatamente o que foi validado, sem uma segunda
 * interpretação que possa divergir (barra invertida, maiúsculas, IDN).
 */
import policy from '../../../electron/services/external-url-policy.json'

export type ExternalUrlBlockReason =
  | 'vazia'
  | 'longa'
  | 'controle'
  | 'invisivel'
  | 'espaco'
  | 'sem-esquema'
  | 'esquema'
  | 'malformada'
  | 'sem-destino'
  | 'parametro'
  | 'credenciais'

export type ExternalUrlDecision =
  | { ok: true; url: string; scheme: string }
  | { ok: false; reason: ExternalUrlBlockReason; scheme?: string }

/** O que pode chegar ao `shell.openExternal`. */
export const EXTERNAL_OPENER_SCHEMES: readonly string[] = policy.esquemasDoAbridor
/** O subconjunto que é página web (terminal, bloco "Página Web", pedidos de agente). */
export const EXTERNAL_WEB_SCHEMES: readonly string[] = policy.esquemasWeb
export const MAX_EXTERNAL_URL_CHARS: number = policy.maxCaracteres
// Ver `justificativaCamposMailto` no JSON: `attach=` já anexou arquivo local.
const MAILTO_FIELDS: ReadonlySet<string> = new Set(policy.camposMailto)

// C0, DEL, C1 e os separadores de linha Unicode: quebram a URL em duas para
// quem a lê e não para quem a abre (ou o contrário).
// eslint-disable-next-line no-control-regex -- a política precisa reconhecer exatamente estes bytes.
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/
// Invisíveis e marcas de direção não mudam o que a pessoa lê, mas mudam o que
// abre. No host o IDNA descarta todo Default_Ignorable (um U+200B, U+034F ou
// U+FE0F no meio de `example.com` some e abre `example.com`), e U+202E inverte
// o texto exibido. Por propriedade Unicode, não por lista: a lista escrita à mão
// deixava passar os que ninguém lembrou.
const INVISIBLE = /[\p{Default_Ignorable_Code_Point}\p{Cf}]/u
const INNER_SPACE = /\s/
const SCHEME = /^([a-z][a-z0-9+.-]*):/i
// A autoridade (usuário, host e porta) de uma URL com `//`: termina no
// primeiro `/`, `?`, `#` ou barra invertida, como no parser WHATWG.
const AUTHORITY = /^[a-z][a-z0-9+.-]*:\/\/([^/?#\\]*)/i

/**
 * Decide se `raw` pode sair do app por um dos `allowedSchemes`.
 *
 * Nunca lança: qualquer entrada, inclusive não-string, vira uma decisão. O
 * motivo do bloqueio existe para teste e diagnóstico; a UI não o mostra cru.
 */
export function classifyExternalUrl(
  raw: unknown,
  allowedSchemes: readonly string[] = EXTERNAL_OPENER_SCHEMES,
): ExternalUrlDecision {
  if (typeof raw !== 'string') return { ok: false, reason: 'vazia' }

  const value = raw.trim()
  if (!value) return { ok: false, reason: 'vazia' }
  if (value.length > MAX_EXTERNAL_URL_CHARS) return { ok: false, reason: 'longa' }
  if (CONTROL.test(value)) return { ok: false, reason: 'controle' }
  if (INVISIBLE.test(value)) return { ok: false, reason: 'invisivel' }
  if (INNER_SPACE.test(value)) return { ok: false, reason: 'espaco' }

  const match = SCHEME.exec(value)
  if (!match) return { ok: false, reason: 'sem-esquema' }

  const scheme = `${match[1].toLowerCase()}:`
  if (!allowedSchemes.includes(scheme)) return { ok: false, reason: 'esquema', scheme }
  if (hasEncodedHiddenInAuthority(value)) return { ok: false, reason: 'invisivel', scheme }

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return { ok: false, reason: 'malformada', scheme }
  }
  if (parsed.protocol !== scheme) return { ok: false, reason: 'malformada', scheme }
  // O limite vale também para o que sai: a serialização codifica cada
  // caractere não-ASCII em até 9 (`中` vira `%E4%B8%AD`), e sem isto o renderer
  // aprovaria um href que o main, reclassificando, recusa.
  if (parsed.href.length > MAX_EXTERNAL_URL_CHARS) return { ok: false, reason: 'longa', scheme }
  // `%` no host serializado só aparece quando o parser do Chromium codificou
  // algo que o do Node recusa (U+00A8 vira `xn--a%20b-…`): link que o
  // renderer mostraria e o main não abriria.
  if (parsed.hostname.includes('%')) return { ok: false, reason: 'malformada', scheme }

  const hasDestination = scheme === 'mailto:' ? Boolean(parsed.pathname) : Boolean(parsed.hostname)
  if (!hasDestination) return { ok: false, reason: 'sem-destino', scheme }
  // Fragmento num mailto: não existe na RFC 6068 (um `#` do endereço vem como
  // `%23`) e fica fora de `searchParams`: `mailto:a@b.com#&attach=…` levaria
  // o campo proibido ao cliente de e-mail por fora da checagem abaixo.
  if (scheme === 'mailto:' && (parsed.href.includes('#') || hasUnknownMailtoField(parsed))) {
    return { ok: false, reason: 'parametro', scheme }
  }

  const credentials = decideCredentials(parsed)
  if (credentials) return { ok: false, reason: credentials, scheme }

  return { ok: true, url: parsed.href, scheme }
}

/**
 * O texto tem controle, separador de linha ou invisível? Para quem vê a URL
 * crua antes de algum parser codificá-la: o Markdown troca U+202E por
 * `%E2%80%AE` antes do `urlTransform`, e a partir daí `classifyExternalUrl`
 * já não enxerga o caractere.
 */
export function hasHiddenUrlCharacters(value: string): boolean {
  return CONTROL.test(value) || INVISIBLE.test(value)
}

/** Atalho para quem só precisa do sim/não. */
export function isAllowedExternalUrl(
  raw: unknown,
  allowedSchemes: readonly string[] = EXTERNAL_OPENER_SCHEMES,
): boolean {
  return classifyExternalUrl(raw, allowedSchemes).ok
}

/**
 * Invisível percent-codificado no host (`https://pay%E2%80%8Bpal.com/`): o
 * parser decodifica, o IDNA apaga o caractere e a URL aprovada sairia como
 * `paypal.com`. Só a autoridade é decodificada: no caminho, um `%E2%80%8C`
 * pode ser o ZWNJ legítimo de uma palavra em persa.
 */
function hasEncodedHiddenInAuthority(value: string): boolean {
  const authority = AUTHORITY.exec(value)?.[1]
  if (!authority || !authority.includes('%')) return false
  try {
    return hasHiddenUrlCharacters(decodeURIComponent(authority))
  } catch {
    // `%` malformado: o parser recusa o host logo adiante.
    return false
  }
}

function hasUnknownMailtoField(parsed: URL): boolean {
  for (const key of parsed.searchParams.keys()) {
    if (!MAILTO_FIELDS.has(key.toLowerCase())) return true
  }
  return false
}

/**
 * URL com userinfo (`https://usuario:senha@host`) não sai do app.
 *
 * Dois problemas, um só bloqueio: `https://google.com@evil.example/` diz
 * "google.com" para quem lê e abre `evil.example` (o usuário é o disfarce), e
 * uma senha no userinfo iria em texto claro para o histórico do navegador. Os
 * links legítimos com usuário (`https://usuario@git.empresa.com`) são raros
 * fora de Git e FTP e continuam copiáveis: bloquear só tira o clique.
 * No `mailto:` o `@` é do caminho, então `username` fica vazio e nada muda.
 */
function decideCredentials(parsed: URL): ExternalUrlBlockReason | null {
  return parsed.username || parsed.password ? 'credenciais' : null
}

/**
 * Versão de uma URL que pode ir para log, erro e resultado de pedido: esquema
 * e host, nunca caminho, query, fragmento ou credenciais — é ali que moram
 * tokens de convite, links assinados e senhas.
 */
export function describeExternalUrlForLog(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) return '[vazia]'

  const value = raw.trim()
  const match = SCHEME.exec(value)
  if (!match) return '[sem esquema]'

  const scheme = `${match[1].toLowerCase().slice(0, 32)}:`
  try {
    const { host } = new URL(value)
    return host ? `${scheme}//${host}` : `${scheme}…`
  } catch {
    return `${scheme}…`
  }
}

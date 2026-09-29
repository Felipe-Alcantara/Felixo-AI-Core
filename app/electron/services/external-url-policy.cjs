'use strict'

/**
 * Portão de URL externa do processo principal: nada chega ao
 * `shell.openExternal` (nem à permissão `openExternal` de uma sessão) sem
 * passar por `classifyExternalUrl`.
 *
 * Espelho de `src/features/shared/external-url-policy.ts`. O renderer decide o
 * que parece link; este arquivo decide o que abre, porque qualquer conteúdo
 * que chegue ao renderer (saída de CLI, Markdown de agente, página em webview)
 * consegue pedir um `window.open`. As duas implementações leem a allowlist do
 * mesmo `external-url-policy.json`, rodam a mesma tabela de casos e são
 * comparadas entre si por um teste diferencial com entradas aleatórias —
 * mudou uma, o teste exige a outra.
 */

const policy = require('./external-url-policy.json')

const EXTERNAL_OPENER_SCHEMES = Object.freeze([...policy.esquemasDoAbridor])
const EXTERNAL_WEB_SCHEMES = Object.freeze([...policy.esquemasWeb])
const MAX_EXTERNAL_URL_CHARS = policy.maxCaracteres
// Ver `justificativaCamposMailto` no JSON: `attach=` já anexou arquivo local.
const MAILTO_FIELDS = new Set(policy.camposMailto)

// Ver os comentários das mesmas expressões no espelho do renderer.
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/
const INVISIBLE = /[\p{Default_Ignorable_Code_Point}\p{Cf}]/u
const INNER_SPACE = /\s/
const SCHEME = /^([a-z][a-z0-9+.-]*):/i
const AUTHORITY = /^[a-z][a-z0-9+.-]*:\/\/([^/?#\\]*)/i

/**
 * @typedef {{ ok: true, url: string, scheme: string }
 *   | { ok: false, reason: string, scheme?: string }} ExternalUrlDecision
 */

/**
 * @param {unknown} raw
 * @param {readonly string[]} [allowedSchemes]
 * @returns {ExternalUrlDecision}
 */
function classifyExternalUrl(raw, allowedSchemes = EXTERNAL_OPENER_SCHEMES) {
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

  let parsed
  try {
    parsed = new URL(value)
  } catch {
    return { ok: false, reason: 'malformada', scheme }
  }
  if (parsed.protocol !== scheme) return { ok: false, reason: 'malformada', scheme }
  // Ver os comentários das mesmas checagens no espelho do renderer.
  if (parsed.href.length > MAX_EXTERNAL_URL_CHARS) return { ok: false, reason: 'longa', scheme }
  if (parsed.hostname.includes('%')) return { ok: false, reason: 'malformada', scheme }

  const hasDestination = scheme === 'mailto:' ? Boolean(parsed.pathname) : Boolean(parsed.hostname)
  if (!hasDestination) return { ok: false, reason: 'sem-destino', scheme }
  if (scheme === 'mailto:' && (parsed.href.includes('#') || hasUnknownMailtoField(parsed))) {
    return { ok: false, reason: 'parametro', scheme }
  }

  const credentials = decideCredentials(parsed)
  if (credentials) return { ok: false, reason: credentials, scheme }

  return { ok: true, url: parsed.href, scheme }
}

/**
 * @param {unknown} raw
 * @param {readonly string[]} [allowedSchemes]
 */
function isAllowedExternalUrl(raw, allowedSchemes = EXTERNAL_OPENER_SCHEMES) {
  return classifyExternalUrl(raw, allowedSchemes).ok
}

/**
 * Mesma regra de `hasEncodedHiddenInAuthority` no espelho do renderer.
 *
 * @param {string} value
 */
function hasEncodedHiddenInAuthority(value) {
  const authority = AUTHORITY.exec(value)?.[1]
  if (!authority || !authority.includes('%')) return false
  try {
    const decoded = decodeURIComponent(authority)
    return CONTROL.test(decoded) || INVISIBLE.test(decoded)
  } catch {
    return false
  }
}

/**
 * @param {URL} parsed
 */
function hasUnknownMailtoField(parsed) {
  for (const key of parsed.searchParams.keys()) {
    if (!MAILTO_FIELDS.has(key.toLowerCase())) return true
  }
  return false
}

/**
 * Mesma regra de `decideCredentials` no espelho do renderer.
 *
 * @param {URL} parsed
 * @returns {string | null}
 */
function decideCredentials(parsed) {
  return parsed.username || parsed.password ? 'credenciais' : null
}

/**
 * Esquema e host, nunca caminho, query, fragmento ou credenciais: é o único
 * pedaço de uma URL recusada que pode ir para log, mensagem de erro ou
 * resultado gravado em disco.
 *
 * @param {unknown} raw
 * @returns {string}
 */
function describeExternalUrlForLog(raw) {
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

module.exports = {
  EXTERNAL_OPENER_SCHEMES,
  EXTERNAL_WEB_SCHEMES,
  MAX_EXTERNAL_URL_CHARS,
  classifyExternalUrl,
  describeExternalUrlForLog,
  isAllowedExternalUrl,
}

'use strict'

const { isSensitiveKeyName } = require('./git-secret-redaction.cjs')

/**
 * Tira os segredos de uma URL antes de ela sair do computador: o `.fxcanvas`
 * exportado e o que os agentes leem do canvas (decisão de 16/11/2026). O banco
 * local guarda a URL completa, e o bloco Página Web reabre exatamente onde
 * estava; só o que sai é redigido.
 *
 * O parâmetro sensível SAI da URL (não vira "[redigido]"): quem importa o
 * canvas e reabre o bloco não manda lixo ao site. A query inofensiva fica
 * (buscas, documentos), e o fragmento só perde as chaves sensíveis, como o
 * `#access_token=` do OAuth; uma âncora comum (`#secao`) não muda.
 */

// Além dos nomes de `isSensitiveKeyName` (token, password, secret, api_key,
// signature, sig, access_token, id_token...): códigos de login e de OAuth.
const EXTRA_SENSITIVE_NAMES = new Set([
  'code',
  'key',
  'auth',
  'otp',
  'ticket',
  'jwt',
  'session',
  'sessionid',
  'session_id',
  'assertion',
  'samlresponse',
  'samlrequest',
  'oauth_verifier',
  'login_token',
  'magic_link',
  'reset_token',
  'credential',
  'credentials',
])
// URLs pré-assinadas: todo `X-Amz-*` (S3) e `X-Goog-*` (Cloud Storage).
const SENSITIVE_PREFIXES = ['x-amz-', 'x-goog-']
// Valor com cara de token mesmo num parâmetro de nome inocente (`?t=eyJ...`).
const TOKEN_VALUE_PATTERNS = [
  /^eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+$/,
  /^(?:github_pat_|gh[pousr]_|glpat-|xox[baprs]-|npm_|pypi-)[A-Za-z0-9_-]{12,}$/,
  /^sk-[A-Za-z0-9_-]{8,}$/,
]

function isSensitiveParameter(name, value) {
  const key = String(name ?? '').trim().toLowerCase()
  if (!key) return false
  if (isSensitiveKeyName(key) || EXTRA_SENSITIVE_NAMES.has(key)) return true
  if (SENSITIVE_PREFIXES.some((prefix) => key.startsWith(prefix))) return true
  return TOKEN_VALUE_PATTERNS.some((pattern) => pattern.test(String(value ?? '')))
}

/**
 * Tira os pares sensíveis de uma lista `a=1&b=2`. Sem nada sensível, devolve
 * a string original: reserializar trocaria `%20` por `+` à toa.
 */
function withoutSensitivePairs(serialized) {
  const params = new URLSearchParams(serialized)
  const kept = new URLSearchParams()
  let removed = false
  for (const [name, value] of params) {
    if (isSensitiveParameter(name, value)) removed = true
    else kept.append(name, value)
  }
  return removed ? kept.toString() : serialized
}

/**
 * URL sem usuário/senha, sem parâmetros sensíveis na query e sem chaves
 * sensíveis no fragmento. O que não é URL http(s) volta igual (o chamador já
 * decide se aceita); valor que não é string vira `''`.
 *
 * @param {unknown} url
 * @returns {string}
 */
function redactUrlSecrets(url) {
  if (typeof url !== 'string') return ''
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return url
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return url

  // Sem nada a tirar, a URL volta como veio: `toString()` poria uma "/" no fim.
  let changed = false
  if (parsed.username || parsed.password) {
    parsed.username = ''
    parsed.password = ''
    changed = true
  }
  const query = parsed.search.slice(1)
  if (query) {
    const kept = withoutSensitivePairs(query)
    if (kept !== query) {
      parsed.search = kept ? `?${kept}` : ''
      changed = true
    }
  }
  const fragment = parsed.hash.slice(1)
  // Só um fragmento de pares (`access_token=...&state=...`) é tratado; âncora fica.
  if (fragment.includes('=')) {
    const kept = withoutSensitivePairs(fragment)
    if (kept !== fragment) {
      parsed.hash = kept ? `#${kept}` : ''
      changed = true
    }
  }
  return changed ? parsed.toString() : url
}

module.exports = { isSensitiveParameter, redactUrlSecrets }

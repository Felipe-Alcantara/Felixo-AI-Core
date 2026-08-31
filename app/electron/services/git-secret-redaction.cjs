'use strict'

const REDACTED = '***'
const MAX_DIAGNOSTIC_LENGTH = 1200

const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]*:\/\/)[^\/?#\s@]+@/gi
const SENSITIVE_PARAMETER_PATTERN =
  /\b(access[_-]?token|auth[_-]?token|oauth[_-]?token|refresh[_-]?token|id[_-]?token|private[_-]?token|token|password|passwd|pass|secret|client[_-]?secret|api[_-]?key|apikey|pat|signature|sig|authorization)\b(\s*[=:]\s*)([^&\s"'<>]+)/gi
const SENSITIVE_LABEL_PATTERN =
  /\b(access[_-]?token|auth[_-]?token|oauth[_-]?token|refresh[_-]?token|id[_-]?token|private[_-]?token|token|password|passwd|pass|secret|client[_-]?secret|api[_-]?key|apikey|pat|signature|sig|authorization)\b(\s*:\s*)[^\r\n]*/gi
const SENSITIVE_HEADER_PATTERN =
  /\b((?:proxy-)?authorization|x-(?:api|access)-token)\s*:\s*[^\r\n]*/gi
const SENSITIVE_CLI_ARGUMENT_PATTERN =
  /(--(?:access[_-]?token|auth[_-]?token|oauth[_-]?token|token|password|passwd|pass|secret|api[_-]?key|apikey|pat))(=|\s+)([^\s]+)/gi
const AUTH_SCHEME_PATTERN = /\b(?:Bearer|Basic|Token)\s+\S+/gi
const KNOWN_TOKEN_PATTERNS = [
  /\b(?:github_pat_|gh[pousr]_|glpat-|xox[baprs]-|npm_|pypi-)[A-Za-z0-9_-]{12,}\b/gi,
  /\bsk-[A-Za-z0-9_-]{8,}\b/gi,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g,
]
const SENSITIVE_PARAMETER_NAME_PATTERN =
  /^(?:access[_-]?token|auth[_-]?token|oauth[_-]?token|refresh[_-]?token|id[_-]?token|private[_-]?token|token|password|passwd|pass|secret|client[_-]?secret|api[_-]?key|apikey|pat|signature|sig|authorization)$/i
const GIT_COMMAND_LINE_PATTERN = /^\s*(?:Command failed:\s*)?git(?:\.exe)?(?:\s|$).*/i

/**
 * Mascara userinfo, parâmetros de segredo, cabeçalhos e formatos conhecidos
 * de token em texto que veio do Git. O texto resultante pode ser exibido ou
 * persistido; o valor original nunca deve ser anexado a um erro redigido.
 *
 * @param {unknown} text
 * @returns {string}
 */
function redactSensitiveText(text) {
  let redacted = String(text ?? '')
    .replace(URL_CREDENTIALS, '$1***@')
    .replace(SENSITIVE_HEADER_PATTERN, '$1: ' + REDACTED)
    .replace(AUTH_SCHEME_PATTERN, REDACTED)
    .replace(SENSITIVE_CLI_ARGUMENT_PATTERN, '$1$2' + REDACTED)
    .replace(SENSITIVE_PARAMETER_PATTERN, '$1$2' + REDACTED)
    .replace(SENSITIVE_LABEL_PATTERN, '$1$2' + REDACTED)

  for (const pattern of KNOWN_TOKEN_PATTERNS) {
    redacted = redacted.replace(pattern, REDACTED)
  }

  return redacted
}

/**
 * Retira linhas de erro geradas pelo Node que repetem o comando `git` inteiro.
 * O stderr continua sendo usado como diagnóstico, mas a linha de comando não
 * é uma informação necessária para quem usa o painel.
 *
 * @param {unknown} text
 * @returns {string}
 */
function stripGitCommandLines(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .filter((line) => !GIT_COMMAND_LINE_PATTERN.test(line))
    .join('\n')
}

/**
 * Redige e compacta texto antes de colocá-lo em uma configuração ou log.
 *
 * @param {unknown} text
 * @returns {string}
 */
function sanitizeGitErrorText(text) {
  const compact = stripGitCommandLines(redactSensitiveText(text))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
    .trim()

  return compact.length > MAX_DIAGNOSTIC_LENGTH
    ? `${compact.slice(0, MAX_DIAGNOSTIC_LENGTH - 1)}…`
    : compact
}

/**
 * Remove credenciais da URL que será armazenada ou entregue ao Git.
 *
 * Repositórios privados continuam funcionando por meio do credential helper
 * do Git, keychain/credential manager do sistema ou outra autenticação
 * configurada fora da URL. Embutir segredo na URL não é uma forma suportada.
 *
 * @param {unknown} value
 * @returns {string}
 */
function sanitizeGitRemoteUrl(value) {
  const source = String(value ?? '').trim()
  if (!source) {
    return ''
  }

  try {
    const parsed = new URL(source)
    parsed.username = ''
    parsed.password = ''
    parsed.hash = ''

    for (const key of [...parsed.searchParams.keys()]) {
      if (SENSITIVE_PARAMETER_NAME_PATTERN.test(key)) {
        parsed.searchParams.delete(key)
      }
    }

    return redactSensitiveText(parsed.toString())
  } catch {
    // URLs não HTTP (por exemplo, uma referência local) não precisam ser
    // normalizadas pela classe URL, mas ainda devem passar pela redação geral.
    return redactSensitiveText(source)
  }
}

/**
 * Monta um diagnóstico útil sem repetir a linha de comando ou o segredo.
 *
 * @param {unknown} error
 * @param {{ stage?: string, repoUrl?: unknown, branch?: unknown }} context
 * @returns {string}
 */
function formatGitError(error, context = {}) {
  const target = sanitizeGitRemoteUrl(context.repoUrl) || 'repositório configurado'
  const stage = sanitizeMetadata(context.stage, 'sincronização')
  const branch = sanitizeMetadata(context.branch, '')
  const code = normalizeErrorCode(error?.code)
  const detail = sanitizeGitErrorText(error?.stderr || error?.message)
  const parts = [
    `Falha no Git durante ${stage}.`,
    `Repositório: ${sanitizeMetadata(target, 'repositório configurado')}.`,
    `Código: ${code}.`,
  ]

  if (branch) {
    parts.push(`Branch: ${branch}.`)
  }
  if (detail) {
    parts.push(`Detalhe: ${detail}`)
  }

  return parts.join(' ')
}

/**
 * Cria um Error que carrega somente a mensagem segura e metadados não
 * sensíveis. O erro original não é anexado ao objeto para evitar que um log
 * futuro serialize stderr/message crus por acidente.
 *
 * @param {unknown} error
 * @param {{ stage?: string, repoUrl?: unknown, branch?: unknown }} context
 * @returns {Error & { code: string, stage: string, isRedactedGitError: true }}
 */
function createRedactedGitError(error, context = {}) {
  const wrapped = new Error(formatGitError(error, context))
  wrapped.name = 'GitSyncError'
  wrapped.code = normalizeErrorCode(error?.code)
  wrapped.stage = sanitizeMetadata(context.stage, 'sincronização')
  wrapped.isRedactedGitError = true
  return wrapped
}

function normalizeErrorCode(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value))
  }
  if (typeof value === 'string' && /^[A-Za-z0-9_.-]{1,40}$/.test(value)) {
    return value
  }
  return 'GIT_ERROR'
}

function sanitizeMetadata(value, fallback) {
  const normalized = sanitizeGitErrorText(value)
    .replace(/\s+/g, ' ')
    .trim()
  return normalized || fallback
}

module.exports = {
  createRedactedGitError,
  formatGitError,
  redactSensitiveText,
  sanitizeGitErrorText,
  sanitizeGitRemoteUrl,
  stripGitCommandLines,
}

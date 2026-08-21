/**
 * @module official-cli-account-status
 * Leitura do estado de conta de uma CLI oficial a partir da saída que ela
 * própria imprime.
 *
 * Duas regras moldam este módulo:
 *
 * 1. **A CLI é a fonte de verdade.** Nada aqui abre `~/.codex`, lê arquivo de
 *    credencial ou deduz identidade por caminho no disco. O que a CLI não
 *    imprimir, o app não sabe — e diz que não sabe, em vez de inventar.
 * 2. **Saída de comando de autenticação é território de segredo.** Uma versão
 *    futura da CLI pode passar a ecoar chave, token ou cabeçalho no `stderr` de
 *    um erro. Por isso a saída é redigida antes de virar mensagem de UI ou
 *    linha de log, e não depois.
 */

/**
 * Rótulo cujo valor nunca sai deste processo em texto claro.
 *
 * O valor mascarado é o resto da linha, não só a primeira palavra: em
 * `Authorization: Bearer <token>` o segredo está depois de um prefixo, e parar
 * no primeiro espaço deixaria o token exposto.
 */
const LABELED_SECRET_PATTERN =
  /\b(api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token|id[-_ ]?token|client[-_ ]?secret|secret|token|password|senha|cookie|authorization)\b(\s*[:=]\s*)[^\n]+/gi

/**
 * Formatos autoexplicativos: valem mesmo sem rótulo, porque uma chave colada
 * no meio de uma frase de erro continua sendo uma chave.
 */
const SECRET_PATTERNS = [
  /\bBearer\s+\S+/gi,
  /\bsk-[A-Za-z0-9_-]{8,}/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g,
]

const REDACTED = '[oculto]'

/** Métodos de login que o Codex imprime; usados só para exibição. */
const LOGIN_METHOD_PATTERN = /logged in using ([^.(\n]+)/i

/** Rótulos de identidade que a CLI pode imprimir em linhas `Rótulo: valor`. */
const IDENTITY_FIELDS = [
  { key: 'account', labels: ['account', 'conta', 'email', 'e-mail', 'signed in as', 'logged in as'] },
  { key: 'plan', labels: ['plan', 'plano', 'subscription'] },
  { key: 'organization', labels: ['organization', 'organização', 'org', 'workspace'] },
]

/**
 * Mascara segredos de um texto preservando o resto da mensagem.
 *
 * Preserva o rótulo justamente para que a pessoa consiga entender o erro
 * ("o token expirou") sem que o valor apareça em tela, log ou teste.
 *
 * @param {unknown} text
 * @returns {string}
 */
function redactSecrets(text) {
  let redacted = String(text ?? '').replace(
    LABELED_SECRET_PATTERN,
    (_match, label, separator) => `${label}${separator}${REDACTED}`,
  )

  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, REDACTED)
  }

  return redacted
}

/**
 * Interpreta a saída de `codex login status`.
 *
 * Devolve apenas os campos que a CLI realmente imprimiu: uma versão que só diz
 * "Logged in using ChatGPT" produz `{ authStatus: 'logged_in', method:
 * 'ChatGPT' }`, sem `account` nem `plan`. Quem consome deve tratar campo
 * ausente como "a CLI não informa", nunca como "não existe conta".
 *
 * @param {unknown} output - stdout+stderr do comando de status.
 * @returns {{
 *   authStatus: 'logged_in' | 'logged_out' | 'unknown',
 *   method?: string,
 *   account?: string,
 *   plan?: string,
 *   organization?: string,
 * }}
 */
function parseCodexAccountStatus(output) {
  const text = redactSecrets(output).trim()
  const status = { authStatus: parseCodexLoginStatus(text) }

  if (!text) {
    return status
  }

  const method = text.match(LOGIN_METHOD_PATTERN)?.[1]?.trim()
  if (method && status.authStatus === 'logged_in') {
    status.method = method
  }

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*[-*]?\s*([^:]{1,40}):\s*(.+?)\s*$/)

    if (!match) {
      continue
    }

    const label = match[1].trim().toLowerCase()
    const value = match[2].trim()
    const field = IDENTITY_FIELDS.find(
      (candidate) => candidate.labels.includes(label) && !status[candidate.key],
    )

    if (field && value && value !== REDACTED) {
      status[field.key] = value
    }
  }

  return status
}

/**
 * Classifica a saída de status em conectado / desconectado / desconhecido.
 *
 * "Desconhecido" é um resultado legítimo, não uma falha: a UI mostra o texto
 * cru redigido em vez de afirmar um estado que a CLI não confirmou.
 *
 * @param {unknown} output
 * @returns {'logged_in' | 'logged_out' | 'unknown'}
 */
function parseCodexLoginStatus(output) {
  const normalizedOutput = String(output ?? '').trim().toLowerCase()

  if (!normalizedOutput) {
    return 'unknown'
  }

  // As negativas são testadas primeiro porque "not logged in" contém
  // "logged in": a ordem inversa classificaria uma sessão ausente como ativa.
  if (
    normalizedOutput.includes('not logged in') ||
    normalizedOutput.includes('not authenticated') ||
    normalizedOutput.includes('no login') ||
    normalizedOutput.includes('logged out')
  ) {
    return 'logged_out'
  }

  if (normalizedOutput.includes('logged in')) {
    return 'logged_in'
  }

  return 'unknown'
}

/**
 * Resumo de uma linha para log/telemetria, sem identidade nem segredo.
 *
 * O estado (`logged_in`) é útil para depurar; o e-mail da pessoa não é, e
 * arquivo de log costuma sobreviver mais do que a sessão que o gerou.
 *
 * @param {{ authStatus?: string, account?: string, plan?: string }} accountStatus
 * @returns {{ authStatus: string, hasIdentity: boolean }}
 */
function describeAccountStatusForLog(accountStatus) {
  return {
    authStatus: accountStatus?.authStatus ?? 'unknown',
    hasIdentity: Boolean(accountStatus?.account),
  }
}

module.exports = {
  describeAccountStatusForLog,
  parseCodexAccountStatus,
  parseCodexLoginStatus,
  redactSecrets,
}

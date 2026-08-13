/**
 * @module fetch-all/secret-redaction
 * Redação de credenciais em texto vindo do git antes de exibir ou persistir.
 *
 * Saída de `git fetch`/`push` pode carregar a URL do remoto com usuário e
 * senha embutidos, ou um token ecoado numa mensagem de erro. Esse texto vai
 * para a interface e para o relatório em disco, então passa por aqui antes.
 */

const URL_CREDENTIALS = /\b(https?:\/\/)[^/@\s]+@/gi
const SECRET_PARAMETERS =
  /\b(access_token|auth_token|oauth_token|password|passwd|token)=([^&\s]+)/gi
const KNOWN_TOKEN_FORMATS =
  /\b(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,})\b/g

/**
 * Mascara credenciais comuns em URLs, parâmetros de query e tokens do GitHub.
 *
 * @param {unknown} text - Texto externo (stdout/stderr do git, mensagem de erro).
 * @returns {string} O mesmo texto com os segredos substituídos por `***`.
 */
function redactSensitiveText(text) {
  return String(text ?? '')
    .replace(URL_CREDENTIALS, '$1***@')
    .replace(SECRET_PARAMETERS, '$1=***')
    .replace(KNOWN_TOKEN_FORMATS, '***')
}

module.exports = {
  redactSensitiveText,
}

/**
 * Compatibilidade para o Fetch All. A política fica compartilhada porque o
 * Fetch All e o System Design consomem erros externos do Git.
 */
const { redactSensitiveText } = require('../git-secret-redaction.cjs')

module.exports = {
  redactSensitiveText,
}

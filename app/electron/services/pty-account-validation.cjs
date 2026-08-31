'use strict'

const path = require('node:path')
const { getOfficialAiCliForCommand } = require('../core/official-cli-catalog.cjs')

/**
 * Resolve o id do provedor a partir do comando que o terminal realmente pediu.
 *
 * O providerId vindo do renderer é uma otimização para nodes novos, não uma
 * autorização: a combinação continua sendo conferida contra o comando. Isso
 * também permite reabrir nodes antigos, que ainda não tinham providerId salvo.
 *
 * @param {unknown} command
 * @returns {string | null}
 */
function resolveProviderIdForCommand(command) {
  if (typeof command !== 'string' || !command.trim()) {
    return null
  }

  const raw = command.trim()
  const candidates = [
    raw,
    path.basename(raw),
    path.win32.basename(raw),
    path.posix.basename(raw),
  ]

  for (const candidate of [...new Set(candidates)]) {
    const commandName = candidate.replace(/\.(?:cmd|exe|bat|ps1)$/i, '')
    const cli = getOfficialAiCliForCommand(commandName)

    if (cli) {
      return cli.id
    }
  }

  return null
}

/**
 * Checks the account/provider/command tuple before a PTY can compose env.
 *
 * @param {object} options
 * @param {unknown} options.accountId
 * @param {unknown} options.providerId
 * @param {unknown} options.command
 * @param {(accountId: string, providerId: string) => {ok: boolean, message?: string}} [options.validateAccount]
 * @returns {{ok: true, providerId?: string} | {ok: false, message: string}}
 */
function validatePtyAccountSelection({
  accountId,
  providerId,
  command,
  validateAccount = () => ({ ok: true }),
} = {}) {
  const hasAccount = accountId !== undefined && accountId !== null && accountId !== ''
  const hasProvider = providerId !== undefined && providerId !== null && providerId !== ''

  if (hasAccount && (typeof accountId !== 'string' || !accountId.trim())) {
    return { ok: false, message: 'O identificador da conta é inválido.' }
  }

  if (hasProvider && (typeof providerId !== 'string' || !providerId.trim())) {
    return { ok: false, message: 'O identificador do provedor é inválido.' }
  }

  const normalizedAccountId = hasAccount ? accountId.trim() : ''
  const requestedProviderId = hasProvider ? providerId.trim() : ''
  const commandProviderId = resolveProviderIdForCommand(command)

  if (
    requestedProviderId &&
    commandProviderId &&
    requestedProviderId !== commandProviderId
  ) {
    return {
      ok: false,
      message: 'A conta foi selecionada para um provedor incompatível com o comando do terminal.',
    }
  }

  const effectiveProviderId = requestedProviderId || commandProviderId || undefined

  // Sem conta não há ambiente de perfil para compor. Ainda validamos a
  // metadata quando ela contradiz o comando, mas preservamos shells e
  // comandos arbitrários que não usam conta própria.
  if (!normalizedAccountId) {
    return { ok: true, providerId: effectiveProviderId }
  }

  if (!effectiveProviderId || !commandProviderId) {
    return {
      ok: false,
      message: 'Não foi possível validar a conta porque o provedor do comando não foi reconhecido.',
    }
  }

  const accountValidation = validateAccount(normalizedAccountId, effectiveProviderId)
  if (accountValidation === false || accountValidation?.ok === false) {
    return {
      ok: false,
      message:
        accountValidation?.message ??
        'A conta selecionada não existe ou não pertence ao provedor do terminal.',
    }
  }

  return { ok: true, providerId: effectiveProviderId }
}

module.exports = {
  resolveProviderIdForCommand,
  validatePtyAccountSelection,
}

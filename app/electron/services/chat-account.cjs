'use strict'

/**
 * Em qual conta um pedido do chat (mensagem, turno do orquestrador ou
 * sub-agente) roda, e com qual ambiente.
 *
 * A pessoa escolhe no compositor, a qualquer momento (decisão de 15/11/2026):
 *  - `system`: Login do sistema, como sempre foi;
 *  - `pinned`: uma conta própria. Vale para o provedor dela; um sub-agente de
 *    outro provedor roda no Login do sistema;
 *  - `chain`: "Automática (cadeia)". Cada pedido pega a conta apta do próprio
 *    provedor, pelas regras da cadeia. Sem conta apta (cadeia desligada,
 *    provedor fora, todas em espera ou sem login), o pedido cai no Login do
 *    sistema com aviso — escolha do dono para o chat, diferente do bloco, que
 *    recusa a abertura.
 *
 * O ambiente sai do mesmo lugar que o do terminal da conta
 * (`createAccountCliEnv`): credenciais herdadas do app saem, a pasta do perfil
 * entra.
 */

const { CHAIN_PROVIDER_IDS } = require('./accounts/account-chain-constants.cjs')
const { getProviderIdForCliType } = require('./orchestration/provider-switch-record.cjs')

const CHAT_ACCOUNT_MODES = Object.freeze(['system', 'pinned', 'chain'])
const SYSTEM_SELECTION = Object.freeze({ mode: 'system' })

/** Provedores com conta própria no chat (o Openia não roda no chat). */
const CHAT_PROVIDER_IDS = Object.freeze(['claude', 'codex', 'gemini'])

const SYSTEM_LOGIN_LABEL = 'Login do sistema'

/** cliType do chat → provedor das contas (transporte não conta: codex-app-server é Codex). */
function providerForCliType(cliType) {
  const providerId = getProviderIdForCliType(cliType)
  return CHAT_PROVIDER_IDS.includes(providerId) ? providerId : null
}

/** O que veio do renderer vira uma das três escolhas; qualquer outra coisa é o Login do sistema. */
function normalizeChatAccountSelection(value) {
  if (!value || typeof value !== 'object' || !CHAT_ACCOUNT_MODES.includes(value.mode)) return SYSTEM_SELECTION
  if (value.mode === 'pinned') {
    const accountId = typeof value.accountId === 'string' ? value.accountId.trim() : ''
    return accountId && accountId.length <= 200 ? { mode: 'pinned', accountId } : SYSTEM_SELECTION
  }
  return value.mode === 'chain' ? { mode: 'chain' } : SYSTEM_SELECTION
}

function noChainAccountNotice(providerId, code) {
  if (code === 'CHAIN_DISABLED') return 'A cadeia de contas está desligada: este pedido foi pelo Login do sistema.'
  return `Nenhuma conta da cadeia do ${providerName(providerId)} estava apta: este pedido foi pelo Login do sistema.`
}

function providerName(providerId) {
  return { claude: 'Claude', codex: 'Codex', gemini: 'Gemini' }[providerId] ?? providerId
}

/**
 * @param {object} deps
 * @param {{ validateAccount: Function, buildEnv: Function }} deps.accounts - registro de contas (`cli-account-store`).
 * @param {() => ({ pickAccount: Function } | null)} [deps.getChain] - serviço da cadeia, quando existe.
 * @param {(providerId: string, profileEnv: object) => object} deps.accountEnv - `createAccountCliEnv`.
 * @param {() => object} deps.systemEnv - `createCliEnv`.
 */
function createChatAccountResolver({ accounts, getChain = () => null, accountEnv, systemEnv }) {
  function system(notice = null) {
    return { accountId: null, label: SYSTEM_LOGIN_LABEL, mode: 'system', env: systemEnv(), notice }
  }

  function inAccount(accountId, label, providerId, mode) {
    return { accountId, label, mode, env: accountEnv(providerId, accounts.buildEnv(accountId, providerId)), notice: null }
  }

  /**
   * @param {{ selection?: unknown, cliType: string, exclude?: string[], accountId?: string | null }} request
   *   `accountId` força a conta já confirmada (troca por limite aceita no card).
   * @returns {Promise<{ accountId: string | null, label: string, mode: string, env: object, notice: string | null }>}
   */
  async function resolve({ selection, cliType, exclude = [], accountId = null }) {
    const providerId = providerForCliType(cliType)
    const choice = normalizeChatAccountSelection(selection)
    if (!providerId || choice.mode === 'system') return system()

    if (accountId) {
      const checked = accounts.validateAccount(accountId, providerId)
      return checked.ok ? inAccount(accountId, checked.account?.label ?? null, providerId, 'chain') : system(`${checked.message} Este pedido foi pelo Login do sistema.`)
    }

    if (choice.mode === 'pinned') {
      const checked = accounts.validateAccount(choice.accountId, providerId)
      // Sub-agente de outro provedor: a conta escolhida não serve a ele, e isso é esperado.
      if (!checked.ok && checked.message === 'A conta selecionada pertence a outro provedor.') return system()
      return checked.ok
        ? inAccount(choice.accountId, checked.account?.label ?? null, providerId, 'pinned')
        : system(`${checked.message} Este pedido foi pelo Login do sistema.`)
    }

    const chain = getChain()
    if (!chain || !CHAIN_PROVIDER_IDS.includes(providerId)) return system(noChainAccountNotice(providerId, 'NO_CANDIDATE'))
    let picked
    try {
      picked = await chain.pickAccount({ providerId, exclude })
    } catch {
      picked = { ok: false, code: 'NO_CANDIDATE' }
    }
    if (!picked?.ok) return system(noChainAccountNotice(providerId, picked?.code))
    const checked = accounts.validateAccount(picked.accountId, providerId)
    return checked.ok
      ? inAccount(picked.accountId, picked.label ?? checked.account?.label ?? null, providerId, 'chain')
      : system(noChainAccountNotice(providerId, 'NO_CANDIDATE'))
  }

  return { resolve }
}

module.exports = {
  CHAT_ACCOUNT_MODES,
  SYSTEM_LOGIN_LABEL,
  createChatAccountResolver,
  normalizeChatAccountSelection,
  providerForCliType,
}

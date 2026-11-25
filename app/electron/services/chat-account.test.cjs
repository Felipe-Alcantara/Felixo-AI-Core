'use strict'
require('../../scripts/test-support/pasta-do-teste.cjs') // isola o temporário deste arquivo (ver pasta-do-teste.cjs)

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createChatAccountResolver,
  normalizeChatAccountSelection,
  providerForCliType,
} = require('./chat-account.cjs')

const ACCOUNTS = {
  'claude-max': { id: 'claude-max', providerId: 'claude', label: 'Claude Max' },
  'codex-a': { id: 'codex-a', providerId: 'codex', label: 'Codex Pessoal' },
  'codex-b': { id: 'codex-b', providerId: 'codex', label: 'Codex Trabalho' },
}

/** Registro de contas e cadeia de mentira; o ambiente marca de onde veio. */
function harness({ pick = async () => ({ ok: false, code: 'NO_CANDIDATE' }), chain = true } = {}) {
  const picks = []
  const resolver = createChatAccountResolver({
    accounts: {
      validateAccount(accountId, providerId) {
        const account = ACCOUNTS[accountId]
        if (!account) return { ok: false, message: 'A conta selecionada não existe mais.' }
        if (account.providerId !== providerId) return { ok: false, message: 'A conta selecionada pertence a outro provedor.' }
        return { ok: true, account }
      },
      buildEnv: (accountId, providerId) => ({ PERFIL: `${providerId}/${accountId}` }),
    },
    getChain: () =>
      chain
        ? {
            pickAccount: async (request) => {
              picks.push(request)
              return pick(request)
            },
          }
        : null,
    accountEnv: (providerId, profileEnv) => ({ origem: 'conta', providerId, ...profileEnv }),
    systemEnv: () => ({ origem: 'sistema' }),
  })
  return { resolver, picks }
}

test('a escolha do compositor vira system, pinned ou chain; o resto é o Login do sistema', () => {
  assert.deepEqual(normalizeChatAccountSelection(undefined), { mode: 'system' })
  assert.deepEqual(normalizeChatAccountSelection({ mode: 'pinned', accountId: '  codex-a ' }), { mode: 'pinned', accountId: 'codex-a' })
  assert.deepEqual(normalizeChatAccountSelection({ mode: 'pinned', accountId: '' }), { mode: 'system' })
  assert.deepEqual(normalizeChatAccountSelection({ mode: 'chain', accountId: 'ignorado' }), { mode: 'chain' })
  assert.deepEqual(normalizeChatAccountSelection({ mode: 'root' }), { mode: 'system' })
  assert.deepEqual(['claude', 'codex-app-server', 'gemini-acp', 'openia'].map(providerForCliType), ['claude', 'codex', 'gemini', null])
})

test('Login do sistema abre com o ambiente de sempre, sem consultar a cadeia', async () => {
  const { resolver, picks } = harness()
  const result = await resolver.resolve({ selection: { mode: 'system' }, cliType: 'claude' })
  assert.deepEqual(result, { accountId: null, label: 'Login do sistema', mode: 'system', env: { origem: 'sistema' }, notice: null })
  assert.equal(picks.length, 0)
})

test('conta fixa abre com o ambiente do perfil; sub-agente de outro provedor vai pelo sistema sem aviso', async () => {
  const { resolver } = harness()
  const own = await resolver.resolve({ selection: { mode: 'pinned', accountId: 'codex-a' }, cliType: 'codex-app-server' })
  assert.equal(own.accountId, 'codex-a')
  assert.equal(own.label, 'Codex Pessoal')
  assert.deepEqual(own.env, { origem: 'conta', providerId: 'codex', PERFIL: 'codex/codex-a' })

  const other = await resolver.resolve({ selection: { mode: 'pinned', accountId: 'codex-a' }, cliType: 'claude' })
  assert.equal(other.accountId, null)
  assert.equal(other.notice, null)

  const removed = await resolver.resolve({ selection: { mode: 'pinned', accountId: 'apagada' }, cliType: 'codex' })
  assert.equal(removed.accountId, null)
  assert.match(removed.notice, /não existe mais\. Este pedido foi pelo Login do sistema/)
})

test('cadeia: cada pedido pega a conta apta do próprio provedor', async () => {
  const { resolver, picks } = harness({
    pick: async ({ providerId }) => ({ ok: true, accountId: providerId === 'claude' ? 'claude-max' : 'codex-b', label: null }),
  })
  const claude = await resolver.resolve({ selection: { mode: 'chain' }, cliType: 'claude' })
  const codex = await resolver.resolve({ selection: { mode: 'chain' }, cliType: 'codex-app-server', exclude: ['codex-a'] })
  assert.deepEqual([claude.accountId, claude.label, claude.mode], ['claude-max', 'Claude Max', 'chain'])
  assert.deepEqual([codex.accountId, codex.env.PERFIL], ['codex-b', 'codex/codex-b'])
  assert.deepEqual(picks, [
    { providerId: 'claude', exclude: [] },
    { providerId: 'codex', exclude: ['codex-a'] },
  ])
})

test('cadeia sem conta apta, desligada ou ausente cai no Login do sistema com aviso (decisão do dono)', async () => {
  const semApta = await harness().resolver.resolve({ selection: { mode: 'chain' }, cliType: 'codex' })
  assert.deepEqual([semApta.accountId, semApta.env.origem], [null, 'sistema'])
  assert.match(semApta.notice, /Nenhuma conta da cadeia do Codex estava apta: este pedido foi pelo Login do sistema/)

  const desligada = await harness({ pick: async () => ({ ok: false, code: 'CHAIN_DISABLED' }) }).resolver.resolve({
    selection: { mode: 'chain' },
    cliType: 'claude',
  })
  assert.match(desligada.notice, /cadeia de contas está desligada/)

  const quebrada = await harness({
    pick: async () => {
      throw new Error('banco travado')
    },
  }).resolver.resolve({ selection: { mode: 'chain' }, cliType: 'claude' })
  assert.equal(quebrada.accountId, null)
  assert.ok(quebrada.notice)

  const semServico = await harness({ chain: false }).resolver.resolve({ selection: { mode: 'chain' }, cliType: 'gemini' })
  assert.equal(semServico.accountId, null)
  assert.ok(semServico.notice)
})

test('a conta confirmada numa troca por limite vale mesmo com a escolha em cadeia, sem nova escolha', async () => {
  const { resolver, picks } = harness({ pick: async () => ({ ok: true, accountId: 'codex-a', label: null }) })
  const forced = await resolver.resolve({ selection: { mode: 'chain' }, cliType: 'codex', accountId: 'codex-b' })
  assert.equal(forced.accountId, 'codex-b')
  assert.equal(picks.length, 0)
})

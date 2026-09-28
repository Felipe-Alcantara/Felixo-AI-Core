import { describe, expect, it } from 'vitest'
import type { CliAccount } from '../../shared/types/cli-accounts'
import {
  describeAccountSelectionIssue,
  resolveIssueAfterExplicitChoice,
  resolveOpeniaKeyStatus,
  selectAccountFromList,
  selectionAfterAccountRemoved,
  shouldApplyAccountListResult,
} from './agent-account-selection'

const codexAccount: CliAccount = {
  id: 'codex-conta',
  providerId: 'codex',
  label: 'Codex',
  createdAt: '2026-08-31T00:00:00.000Z',
}

const claudeAccount: CliAccount = {
  id: 'claude-conta',
  providerId: 'claude',
  label: 'Claude',
  createdAt: '2026-08-31T00:00:00.000Z',
}

const openiaAccountWithKey: CliAccount = {
  id: 'openia-chave',
  providerId: 'openia',
  label: 'Openia com chave',
  createdAt: '2026-08-31T00:00:00.000Z',
  secretConfigured: true,
}

const openiaAccountWithoutKey: CliAccount = {
  id: 'openia-sem-chave',
  providerId: 'openia',
  label: 'Openia sem chave',
  createdAt: '2026-08-31T00:00:00.000Z',
  secretConfigured: false,
}

describe('seleção de conta por agente', () => {
  it('ignora a resposta antiga quando a troca de agente já iniciou outra carga', () => {
    expect(
      shouldApplyAccountListResult({
        requestProviderId: 'claude',
        currentProviderId: 'codex',
        requestId: 1,
        latestRequestId: 2,
      }),
    ).toBe(false)

    expect(
      shouldApplyAccountListResult({
        requestProviderId: 'codex',
        currentProviderId: 'codex',
        requestId: 2,
        latestRequestId: 2,
      }),
    ).toBe(true)
  })

  it('escolhe a conta atual ou a salva quando elas estão na lista', () => {
    const codex = { ok: true as const, accounts: [codexAccount] }
    expect(selectAccountFromList(codex, '', 'codex-conta')).toEqual({ status: 'ok', accountId: 'codex-conta' })
    expect(selectAccountFromList({ ok: true, accounts: [claudeAccount] }, 'claude-conta', '')).toEqual({
      status: 'ok',
      accountId: 'claude-conta',
    })
    // Na troca de agente a seleção é limpa e a conta salva de outro provedor
    // não é passada: o novo provedor abre no login do sistema, sem aviso.
    expect(selectAccountFromList(codex, '', '')).toEqual({ status: 'ok', accountId: '' })
  })

  it('lista que falha mantém a seleção e bloqueia a abertura, sem cair no login do sistema', () => {
    const selection = selectAccountFromList(
      { ok: false, message: 'O registro de contas (cli-accounts.json) está ilegível.' },
      'codex-conta',
      'codex-conta',
    )
    expect(selection).toEqual({
      status: 'list-failed',
      accountId: 'codex-conta',
      message: 'O registro de contas (cli-accounts.json) está ilegível.',
    })

    const issue = describeAccountSelectionIssue(selection)
    expect(issue?.status).toBe('list-failed')
    expect(issue?.message).toContain('não vai abrir no login do sistema por engano')
    expect(issue?.message).toContain('ilegível')

    // Antes de a lista chegar a seleção era a conta salva; ela continua.
    expect(selectAccountFromList({ ok: false }, '', 'codex-conta').accountId).toBe('codex-conta')
  })

  it('conta salva que sumiu continua escolhida (a preferência não vira "") e avisa pelo nome guardado', () => {
    const selection = selectAccountFromList({ ok: true, accounts: [codexAccount] }, '', 'conta-removida')
    expect(selection).toEqual({ status: 'saved-missing', accountId: 'conta-removida' })

    expect(describeAccountSelectionIssue(selection, 'Trabalho')).toEqual({
      status: 'saved-missing',
      message: 'A conta salva "Trabalho" não existe mais. Escolha outra conta ou o login do sistema.',
    })
    expect(describeAccountSelectionIssue(selection)?.message).toBe(
      'A conta salva não existe mais. Escolha outra conta ou o login do sistema.',
    )
    // A conta escolhida que some depois (removida em outra janela) também avisa.
    expect(selectAccountFromList({ ok: true, accounts: [] }, 'codex-conta', '').status).toBe('saved-missing')
    expect(describeAccountSelectionIssue({ status: 'ok', accountId: '' })).toBeNull()
  })

  it('só uma escolha explícita resolve o aviso; lista ilegível só se resolve com o login do sistema', () => {
    const ausente = { status: 'saved-missing' as const, message: 'x' }
    expect(resolveIssueAfterExplicitChoice(ausente, 'codex-conta')).toBeNull()
    expect(resolveIssueAfterExplicitChoice(ausente, '')).toBeNull()

    const ilegivel = { status: 'list-failed' as const, message: 'y' }
    expect(resolveIssueAfterExplicitChoice(ilegivel, 'codex-conta')).toBe(ilegivel)
    expect(resolveIssueAfterExplicitChoice(ilegivel, '')).toBeNull()
    expect(resolveIssueAfterExplicitChoice(null, 'qualquer')).toBeNull()
  })

  it('remover a conta escolhida não grava o login do sistema: fica "Selecionar…" com a abertura bloqueada', () => {
    // Antes: removeAccount fazia `atual === id ? '' : atual`, e o efeito de
    // persistência gravava '' (login do sistema) sem a pessoa escolher.
    const depois = selectionAfterAccountRemoved('codex-conta', 'codex-conta', 'Pessoal')
    expect(depois?.accountId).toBe('codex-conta')
    expect(depois?.accountId).not.toBe('')
    expect(depois?.issue).toEqual({
      status: 'saved-missing',
      message: 'A conta "Pessoal" foi removida. Escolha outra conta ou o login do sistema.',
    })
    // Qualquer escolha explícita resolve, inclusive o login do sistema.
    expect(resolveIssueAfterExplicitChoice(depois!.issue, '')).toBeNull()
    expect(resolveIssueAfterExplicitChoice(depois!.issue, 'outra')).toBeNull()

    expect(selectionAfterAccountRemoved('outra', 'codex-conta', 'Pessoal')).toBeNull()
    expect(selectionAfterAccountRemoved('', 'codex-conta')).toBeNull()
  })

  it('usa a chave da conta selecionada e nunca herda a chave global', () => {
    expect(
      resolveOpeniaKeyStatus([openiaAccountWithKey], 'openia-chave', false),
    ).toEqual({
      source: 'account',
      accountId: 'openia-chave',
      configured: true,
    })

    expect(
      resolveOpeniaKeyStatus([openiaAccountWithoutKey], 'openia-sem-chave', true),
    ).toEqual({
      source: 'account',
      accountId: 'openia-sem-chave',
      configured: false,
    })
  })

  it('usa a chave global somente no login do sistema e troca de perfil é determinística', () => {
    const accounts = [openiaAccountWithKey, openiaAccountWithoutKey]

    expect(resolveOpeniaKeyStatus(accounts, '', true)).toEqual({
      source: 'system',
      configured: true,
    })
    expect(resolveOpeniaKeyStatus(accounts, 'openia-chave', false).configured).toBe(true)
    expect(resolveOpeniaKeyStatus(accounts, 'openia-sem-chave', false).configured).toBe(false)
  })
})

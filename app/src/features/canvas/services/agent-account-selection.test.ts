import { describe, expect, it } from 'vitest'
import type { CliAccount } from '../../shared/types/cli-accounts'
import {
  resolveOpeniaKeyStatus,
  selectAccountFromList,
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

  it('não carrega a conta stale para a lista do novo provedor', () => {
    expect(selectAccountFromList([codexAccount], 'claude-conta', 'claude-conta')).toBe('')
    expect(selectAccountFromList([codexAccount], '', 'codex-conta')).toBe('codex-conta')
    expect(selectAccountFromList([claudeAccount], 'claude-conta', '')).toBe('claude-conta')
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

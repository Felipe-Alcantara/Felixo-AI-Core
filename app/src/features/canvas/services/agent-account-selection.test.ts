import { describe, expect, it } from 'vitest'
import type { CliAccount } from '../../shared/types/cli-accounts'
import {
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
})

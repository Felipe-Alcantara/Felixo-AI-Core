import { describe, expect, it } from 'vitest'
import { checkChatThreadResume } from '../../../../electron/services/chat-resume-plan.cjs'
import { explainAgentResume, type AgentSessionReference } from '../../canvas/services/agent-session'
import { describeChatResumeNotice } from './chat-resume-notice'

const reference = (cwd: string, accountId?: string): AgentSessionReference => ({
  version: 1,
  provider: 'claude',
  sessionId: 'sessao-1234',
  cwd,
  capturedAt: 1,
  ...(accountId ? { accountId } : {}),
})

describe('retomada do chat × plano do canvas', () => {
  const cases: Array<[string, string, string | undefined, string | undefined, string[]]> = [
    ['mesma pasta e conta', 'C:/a', undefined, undefined, ['exact']],
    ['outra conta', 'C:/a', 'conta-1', undefined, ['account-mismatch']],
    ['outra pasta', 'C:/b', undefined, undefined, ['cwd-mismatch']],
    ['pasta e conta', 'C:/b', 'conta-1', undefined, ['cwd-mismatch', 'account-mismatch']],
  ]

  it.each(cases)('decide igual ao canvas: %s', (_nome, cwd, accountId, originAccount, reasons) => {
    const plan = explainAgentResume({
      command: 'claude',
      cwd,
      reference: reference('C:/a', originAccount),
      accountId,
      cliVersion: null,
    })
    const chat = checkChatThreadResume(
      { providerSessionId: 'sessao-1234', hasStarted: true, origin: { cwd: 'C:/a', accountId: originAccount ?? null } },
      { cwd, accountId: accountId ?? null },
    )
    expect(plan.reasons).toEqual(reasons)
    expect(chat?.reasons ?? ['exact']).toEqual(reasons)
  })

  it('escreve o aviso com o texto do canvas, em termos de chat e sem ID', () => {
    const notice = describeChatResumeNotice(
      { reasons: ['cwd-mismatch', 'account-mismatch'], previousCwd: 'C:/a' },
      { command: 'claude', cwd: 'C:/b' },
    )
    expect(notice).toContain('A conversa foi aberta em C:/a, e este chat está em C:/b.')
    expect(notice).toContain('A conversa é de outra conta')
    expect(notice).toContain('Volte o chat para a conta original')
    expect(notice).not.toContain('bloco')
    expect(notice).not.toContain('sessao-1234')
  })

  it('sem motivo, sem aviso', () => {
    expect(describeChatResumeNotice(undefined, {})).toBeNull()
    expect(describeChatResumeNotice({ reasons: [], previousCwd: '' }, {})).toBeNull()
  })
})

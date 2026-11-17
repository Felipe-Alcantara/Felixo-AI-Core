import { afterEach, describe, expect, it, vi } from 'vitest'
import { describeListedSession, loadAgentSessionList } from './agent-session-list'

const lookup = { command: 'codex', cwd: '/repo' }

function bridge(listSessions: unknown) {
  vi.stubGlobal('window', { felixo: { pty: { listSessions } } })
}

afterEach(() => vi.unstubAllGlobals())

describe('lista de conversas do renderer', () => {
  it('descarta o que o processo principal devolveu fora do formato', async () => {
    bridge(async () => ({
      ok: true,
      folder: [
        { sessionId: 'codex-aaaaaaaa', cwd: '/repo', modifiedAt: 10 },
        { sessionId: 'curto', cwd: '/repo', modifiedAt: 10 },
        { sessionId: 'codex-bbbbbbbb', cwd: '', modifiedAt: 10 },
        { sessionId: 'codex-cccccccc', cwd: '/repo', modifiedAt: Number.NaN },
        null,
      ],
      account: 'lixo',
    }))
    expect(await loadAgentSessionList(lookup)).toEqual({
      folder: [{ sessionId: 'codex-aaaaaaaa', cwd: '/repo', modifiedAt: 10 }],
      account: [],
    })
  })

  it('sem ponte, com recusa ou com erro, não há lista (a faixa segue com as outras saídas)', async () => {
    vi.stubGlobal('window', { felixo: {} })
    expect(await loadAgentSessionList(lookup)).toBeNull()
    bridge(async () => ({ ok: false, message: 'conta inválida' }))
    expect(await loadAgentSessionList(lookup)).toBeNull()
    bridge(async () => {
      throw new Error('ponte caiu')
    })
    expect(await loadAgentSessionList(lookup)).toBeNull()
  })

  it('o texto da linha traz a data e, fora da pasta do bloco, o nome da pasta — nunca o ID', () => {
    const session = {
      sessionId: 'codex-secreto-123',
      cwd: 'C:\\trabalho\\outro-projeto',
      modifiedAt: Date.UTC(2026, 10, 17, 17, 26),
    }
    expect(describeListedSession(session, true)).toMatch(/ · outro-projeto$/)
    expect(describeListedSession(session, false)).not.toContain('outro-projeto')
    expect(describeListedSession(session, true)).not.toContain('secreto')
  })
})

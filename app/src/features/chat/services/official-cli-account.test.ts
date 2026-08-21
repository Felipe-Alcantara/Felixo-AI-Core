import { describe, expect, it } from 'vitest'
import {
  describeSwitchImpact,
  formatAccountIdentity,
  formatSessionLabel,
  type OfficialCliAccountSession,
} from './official-cli-account'

function createSession(
  overrides: Partial<OfficialCliAccountSession> = {},
): OfficialCliAccountSession {
  return {
    sessionId: 'canvas:no-1',
    elementId: 'no-1',
    cwd: '/projetos/alpha',
    startedAt: 1,
    ...overrides,
  }
}

describe('formatAccountIdentity', () => {
  it('diz que a CLI não expõe a conta em vez de deixar a pessoa supor qual é', () => {
    expect(
      formatAccountIdentity('Codex CLI', {
        authStatus: 'logged_in',
        method: 'ChatGPT',
      }),
    ).toBe('Codex CLI: conectado — via ChatGPT.')

    expect(formatAccountIdentity('Codex CLI', { authStatus: 'logged_in' })).toBe(
      'Codex CLI: conectado. A CLI não expõe qual conta está em uso.',
    )
  })

  it('mostra conta e plano quando a CLI os informa', () => {
    expect(
      formatAccountIdentity('Codex CLI', {
        authStatus: 'logged_in',
        account: 'pessoa@example.com',
        plan: 'Pro',
        method: 'ChatGPT',
      }),
    ).toBe('Codex CLI: conectado — pessoa@example.com, plano Pro.')
  })

  it('não confunde estado desconhecido com desconectado', () => {
    expect(
      formatAccountIdentity('Codex CLI', {
        authStatus: 'unknown',
        output: 'saída inesperada',
      }),
    ).toBe(
      'Codex CLI: a CLI não informou um estado reconhecido — saída inesperada',
    )

    expect(formatAccountIdentity('Codex CLI', { authStatus: 'logged_out' })).toBe(
      'Codex CLI: nenhuma conta autenticada.',
    )
  })
})

describe('describeSwitchImpact', () => {
  it('não promete continuidade para sessões em andamento', () => {
    const lines = describeSwitchImpact('Codex CLI', [createSession()])
    const texto = lines.join(' ')

    expect(texto).toContain('1 terminal do canvas')
    expect(texto).toContain('o app não encerra nenhum processo')
    expect(texto).toContain('pode perder a autorização')
    // O canvas preserva o cartão; a autenticação de um processo já iniciado
    // não é preservada, e o aviso precisa dizer as duas coisas.
    expect(texto).toContain('o contexto interno da CLI, não')
  })

  it('avisa quando nenhum terminal está em risco', () => {
    expect(describeSwitchImpact('Codex CLI', []).join(' ')).toContain(
      'Nenhum terminal do canvas está rodando esta CLI agora',
    )
  })
})

describe('formatSessionLabel', () => {
  it('usa o nome do diretório e o id do elemento do canvas', () => {
    expect(formatSessionLabel(createSession())).toBe('alpha · no-1')
  })

  it('lida com sessão fora do canvas e sem diretório', () => {
    expect(
      formatSessionLabel(createSession({ elementId: null, cwd: '' })),
    ).toBe('diretório não informado')
  })

  it('lê caminho do Windows com barra invertida', () => {
    expect(
      formatSessionLabel(
        createSession({ cwd: 'C:\\projetos\\beta\\', elementId: null }),
      ),
    ).toBe('beta')
  })
})

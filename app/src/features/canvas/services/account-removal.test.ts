import { describe, expect, it, vi } from 'vitest'
import type {
  CliAccountAffectedSession,
  CliAccountRemoveOptions,
  CliAccountRemoveResult,
} from '../../shared/types/cli-accounts'
import {
  describeAccountRemoval,
  formatAffectedTerminal,
  removeAccountWithConfirmation,
} from './account-removal'

const horario = (startedAt: number) => `t${startedAt}`

const terminalA: CliAccountAffectedSession = {
  sessionId: 'canvas:terminal-a',
  cwd: '/projetos/felixo/',
  startedAt: 1_000,
}

const terminalB: CliAccountAffectedSession = {
  sessionId: 'canvas:terminal-b',
  cwd: 'C:\\projetos\\site',
  startedAt: null,
}

function ponte(respostas: Array<CliAccountRemoveResult | undefined>) {
  const pedidos: Array<CliAccountRemoveOptions | undefined> = []
  const remove = vi.fn(async (options?: CliAccountRemoveOptions) => {
    pedidos.push(options)
    return respostas.shift()
  })
  return { remove, pedidos }
}

describe('formatAffectedTerminal', () => {
  it('nomeia o bloco pela pasta e pela hora em que abriu, nos dois separadores', () => {
    expect(formatAffectedTerminal(terminalA, horario)).toBe('felixo · aberto às t1000')
    expect(formatAffectedTerminal(terminalB, horario)).toBe('site')
    expect(formatAffectedTerminal({ sessionId: 's', cwd: '  ', startedAt: null })).toBe(
      'diretório não informado',
    )
  })
})

describe('describeAccountRemoval', () => {
  it('sem terminal vivo, diz que nenhum bloco é afetado', () => {
    expect(describeAccountRemoval('pessoal', [])).toBe(
      'Remover a conta "pessoal"? A pasta de login dela será apagada.\n' +
        'Nenhum terminal está aberto nesta conta agora.',
    )
  })

  it('lista cada bloco afetado e não promete que o processo segue funcionando', () => {
    const texto = describeAccountRemoval('pessoal', [terminalA, terminalB], horario)

    expect(texto).toContain('2 terminais estão abertos nesta conta:')
    expect(texto).toContain('• felixo · aberto às t1000')
    expect(texto).toContain('• site')
    expect(texto).toContain('o app não encerra processo')
    expect(texto).toContain('perdem o login')
  })
})

describe('removeAccountWithConfirmation', () => {
  it('pergunta nomeando os terminais e confirma exatamente os que a pessoa viu', async () => {
    const { remove, pedidos } = ponte([
      { ok: false, requiresConfirmation: true, sessions: [terminalA, terminalB] },
      { ok: true, removed: true, sessions: [terminalA, terminalB] },
    ])
    const confirm = vi.fn(() => true)

    const resultado = await removeAccountWithConfirmation({
      accountLabel: 'pessoal',
      remove,
      confirm,
      formatTime: horario,
    })

    expect(resultado).toEqual({ status: 'removed' })
    expect(confirm).toHaveBeenCalledWith(describeAccountRemoval('pessoal', [terminalA, terminalB], horario))
    expect(pedidos).toEqual([
      undefined,
      { confirmed: true, acknowledgedSessionIds: ['canvas:terminal-a', 'canvas:terminal-b'] },
    ])
  })

  it('cancelar a pergunta não pede a remoção', async () => {
    const { remove } = ponte([{ ok: false, requiresConfirmation: true, sessions: [terminalA] }])

    const resultado = await removeAccountWithConfirmation({
      accountLabel: 'pessoal',
      remove,
      confirm: () => false,
    })

    expect(resultado).toEqual({ status: 'cancelled' })
    expect(remove).toHaveBeenCalledTimes(1)
  })

  it('terminal aberto durante a pergunta: nada é apagado e a pessoa é avisada para rever a lista', async () => {
    const { remove } = ponte([
      { ok: false, requiresConfirmation: true, sessions: [terminalA] },
      { ok: false, requiresConfirmation: true, sessions: [terminalA, terminalB] },
    ])

    const resultado = await removeAccountWithConfirmation({
      accountLabel: 'pessoal',
      remove,
      confirm: () => true,
    })

    expect(resultado.status).toBe('failed')
    expect(resultado).toMatchObject({ message: expect.stringContaining('Nada foi apagado') })
  })

  it('falha do principal antes da pergunta não abre confirmação e mostra a mensagem dele', async () => {
    const confirm = vi.fn(() => true)
    const { remove } = ponte([{ ok: false, message: 'O registro de contas está ilegível.' }])

    const resultado = await removeAccountWithConfirmation({ accountLabel: 'pessoal', remove, confirm })

    expect(resultado).toEqual({ status: 'failed', message: 'O registro de contas está ilegível.' })
    expect(confirm).not.toHaveBeenCalled()
  })

  it('conta que já não existe não pergunta nada', async () => {
    const confirm = vi.fn(() => true)
    const { remove } = ponte([{ ok: true, removed: false, sessions: [] }])

    const resultado = await removeAccountWithConfirmation({ accountLabel: 'pessoal', remove, confirm })

    expect(resultado).toEqual({ status: 'failed', message: 'A conta não existe mais.' })
    expect(confirm).not.toHaveBeenCalled()
  })

  it('falha na remoção confirmada devolve a mensagem do principal', async () => {
    const { remove } = ponte([
      { ok: false, requiresConfirmation: true, sessions: [] },
      { ok: false, message: 'Não foi possível apagar a pasta de login da conta.' },
    ])

    const resultado = await removeAccountWithConfirmation({
      accountLabel: 'pessoal',
      remove,
      confirm: async () => true,
    })

    expect(resultado).toEqual({
      status: 'failed',
      message: 'Não foi possível apagar a pasta de login da conta.',
    })
  })
})

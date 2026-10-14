import { describe, expect, it } from 'vitest'
import {
  cliSetupNoticeKey,
  describeCliUpdates,
  presentCliSetupStatus,
  type CliSetupStatus,
} from './cli-setup-presentation'

function createStatus(status: Partial<CliSetupStatus>): CliSetupStatus {
  return {
    state: 'idle',
    message: '',
    updatedAt: '2026-08-13T12:00:00.000Z',
    ...status,
  }
}

describe('cli-setup-presentation', () => {
  it('says nothing when there was nothing to install', () => {
    expect(presentCliSetupStatus(createStatus({ state: 'idle' })).showIndicator).toBe(
      false,
    )
    expect(presentCliSetupStatus(null).showIndicator).toBe(false)
  })

  it('names the CLI being installed and its place in the queue', () => {
    const presentation = presentCliSetupStatus(
      createStatus({
        state: 'installing',
        clis: [
          { id: 'codex', name: 'Codex CLI', state: 'installed' },
          { id: 'claude', name: 'Claude Code CLI', state: 'installing' },
          { id: 'gemini', name: 'Gemini CLI', state: 'present' },
        ],
      }),
    )

    // A CLI ja presente na maquina nao entra na conta: ela nunca foi fila.
    expect(presentation.indicatorLabel).toBe('Instalando Claude Code CLI (2/2)')
    expect(presentation.progress).toBe(50)
  })

  it('drops the counter when there is a single CLI to install', () => {
    const presentation = presentCliSetupStatus(
      createStatus({
        state: 'installing',
        clis: [{ id: 'claude', name: 'Claude Code CLI', state: 'installing' }],
      }),
    )

    expect(presentation.indicatorLabel).toBe('Instalando Claude Code CLI')
  })

  // Sem CLI o app nao tem o que orquestrar: a falha e o unico estado que
  // interrompe e oferece acao.
  it('offers a retry when the install fails', () => {
    const presentation = presentCliSetupStatus(
      createStatus({ state: 'error', message: 'Nao foi possivel instalar: Gemini CLI.' }),
    )

    expect(presentation.canRetry).toBe(true)
    expect(presentation.showToast).toBe(true)
    expect(presentation.toastDescription).toContain('Gemini CLI')
  })

  it('celebrates the end without asking for anything', () => {
    const presentation = presentCliSetupStatus(
      createStatus({ state: 'done', message: '2 CLIs de IA foram instaladas.' }),
    )

    expect(presentation.tone).toBe('success')
    expect(presentation.canRetry).toBe(false)
  })

  // Dispensar o andamento nao pode esconder o resultado: e ali que aparece a
  // falha, e com ela a unica acao disponivel.
  it('treats the result as a new notice, not as the one already dismissed', () => {
    const running = createStatus({ state: 'installing' })
    const failed = createStatus({ state: 'error' })

    expect(cliSetupNoticeKey(running)).toBe('em-andamento')
    expect(cliSetupNoticeKey(failed)).not.toBe(cliSetupNoticeKey(running))
  })
})

describe('aviso discreto de atualização das CLIs', () => {
  it('lista o que mudou de versão, separando a cópia do app da instalação do sistema', () => {
    const presentation = presentCliSetupStatus(
      createStatus({
        state: 'done',
        message: 'Codex CLI foi instalada e ja esta disponivel.',
        updates: [
          { id: 'codex', name: 'Codex CLI', scope: 'app', from: '0.150.1', to: '0.163.0-alpha.11' },
          { id: 'claude', name: 'Claude Code CLI', scope: 'sistema', from: '2.1.287', to: '2.1.300' },
        ],
      }),
    )

    expect(presentation.showToast).toBe(true)
    expect(presentation.tone).toBe('success')
    expect(presentation.toastTitle).toBe('CLIs de IA atualizadas')
    expect(presentation.indicatorLabel).toBe('CLIs atualizadas')
    expect(presentation.toastDescription).toBe(
      'Codex CLI 0.150.1 → 0.163.0-alpha.11 · Claude Code CLI do sistema 2.1.287 → 2.1.300',
    )
    expect(presentation.canRetry).toBe(false)
  })

  it('uma CLI que não existia aparece como instalada, sem seta', () => {
    expect(
      describeCliUpdates([{ id: 'gemini', name: 'Gemini CLI', scope: 'app', from: null, to: '0.65.0-preview.0' }]),
    ).toBe('Gemini CLI instalada (0.65.0-preview.0)')
  })

  it('sem atualização o fim continua sendo o aviso de CLIs prontas', () => {
    const presentation = presentCliSetupStatus(createStatus({ state: 'done', message: 'pronto', updates: [] }))

    expect(presentation.toastTitle).toBe('CLIs de IA prontas')
    expect(presentation.toastDescription).toBe('pronto')
  })
})

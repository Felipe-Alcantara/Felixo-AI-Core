import { describe, expect, it } from 'vitest'
import {
  cliSetupNoticeKey,
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

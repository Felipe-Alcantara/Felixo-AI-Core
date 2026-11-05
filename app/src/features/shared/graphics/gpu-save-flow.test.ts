import { describe, expect, it } from 'vitest'
import { runGpuSave, type GpuSaveStep } from './gpu-save-flow'

/** Os passos registrando a ordem em que o componente os receberia. */
function steps(save: GpuSaveStep['save']) {
  const events: string[] = []
  const step: GpuSaveStep = {
    holdField: (hold) => events.push(`holdField(${hold})`),
    setSaving: (saving) => events.push(`setSaving(${saving})`),
    setMessage: (message) => events.push(`setMessage(${message})`),
    clearDraft: () => events.push('clearDraft'),
    requestFocusRestore: () => events.push('requestFocusRestore'),
    save: async () => {
      events.push('save:início')
      const result = await save()
      events.push('save:fim')
      return result
    },
  }
  return { events, step }
}

describe('fluxo de salvar a placa de vídeo', () => {
  it('segura o campo ANTES de salvar: o store publica a escolha nova durante o salvamento', async () => {
    const { events, step } = steps(async () => ({ ok: true, message: 'Placa de vídeo salva.' }))
    await runGpuSave(step, false)

    // Sem isto, shouldShowGpuChoice passava a falso quando a escolha salva virava
    // Automático e o campo era desmontado (foco no BODY) antes de justSaved o segurar.
    expect(events.indexOf('holdField(true)')).toBeGreaterThanOrEqual(0)
    expect(events.indexOf('holdField(true)')).toBeLessThan(events.indexOf('save:início'))
  })

  it('devolve o foco ao seletor só DEPOIS de religá-lo', async () => {
    const { events, step } = steps(async () => ({ ok: true, message: 'Placa de vídeo salva.' }))
    await runGpuSave(step, false)

    expect(events).toEqual([
      'setSaving(true)',
      'holdField(true)',
      'save:início',
      'save:fim',
      'setMessage(Placa de vídeo salva.)',
      'clearDraft',
      'setSaving(false)',
      'requestFocusRestore',
    ])
  })

  it('salvamento recusado: mantém o rascunho, mostra o motivo e solta o campo como estava', async () => {
    const { events, step } = steps(async () => ({ ok: false, message: 'Não foi possível salvar a placa de vídeo.' }))
    await runGpuSave(step, false)

    expect(events).not.toContain('clearDraft')
    expect(events).toContain('holdField(false)')
    expect(events.at(-2)).toBe('setSaving(false)')
    expect(events.at(-1)).toBe('requestFocusRestore')

    // Se o campo já estava segurado (salvou antes), continua segurado.
    const held = steps(async () => ({ ok: false, message: 'Não foi possível salvar a placa de vídeo.' }))
    await runGpuSave(held.step, true)
    expect(held.events.filter((event) => event.startsWith('holdField'))).toEqual(['holdField(true)', 'holdField(true)'])
  })

  it('falha inesperada ao salvar vira mensagem, e o campo não fica preso desligado', async () => {
    const { events, step } = steps(async () => {
      throw new Error('IPC caiu')
    })
    await expect(runGpuSave(step, false)).resolves.toBeUndefined()

    expect(events).toContain('setMessage(Não foi possível salvar a placa de vídeo.)')
    expect(events).toContain('setSaving(false)')
  })
})

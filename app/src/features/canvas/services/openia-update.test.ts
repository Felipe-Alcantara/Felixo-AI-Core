import { describe, expect, it, vi } from 'vitest'

import { OPENIA_UPDATE_MESSAGES, needsOpeniaUpdate, updateOpenia } from './openia-update'

describe('needsOpeniaUpdate', () => {
  it('só oferece atualizar quando a geração falhou porque o Openia é antigo', () => {
    expect(needsOpeniaUpdate({ status: 'error', code: 'openia_outdated', message: 'x' })).toBe(true)
    expect(needsOpeniaUpdate({ status: 'error', code: 'minimum_balance', message: 'x' })).toBe(false)
    expect(needsOpeniaUpdate({ status: 'idle' })).toBe(false)
    expect(needsOpeniaUpdate({ status: 'success', requestId: 'r', count: 1 })).toBe(false)
  })
})

describe('updateOpenia', () => {
  it('atualiza pelo mesmo caminho de instalação das CLIs oficiais, já confirmado pelo clique', async () => {
    const installOfficial = vi.fn(async () => ({ ok: true }))

    const state = await updateOpenia({ installOfficial })

    expect(installOfficial).toHaveBeenCalledWith({ id: 'openia', confirmed: true })
    expect(state).toEqual({ status: 'done', message: OPENIA_UPDATE_MESSAGES.done })
  })

  it('mostra o motivo que o processo principal devolveu quando a instalação falha', async () => {
    const state = await updateOpenia({ installOfficial: async () => ({ ok: false, message: 'Falhou com pip.' }) })
    expect(state).toEqual({ status: 'failed', message: 'Falhou com pip.' })
  })

  it('sem motivo, ou se a chamada quebra, usa a mensagem fixa', async () => {
    expect(await updateOpenia({ installOfficial: async () => ({ ok: false }) })).toEqual({
      status: 'failed',
      message: OPENIA_UPDATE_MESSAGES.failed,
    })
    expect(
      await updateOpenia({
        installOfficial: async () => {
          throw new Error('ipc caiu')
        },
      }),
    ).toEqual({ status: 'failed', message: OPENIA_UPDATE_MESSAGES.failed })
  })

  it('fora do app desktop, não tenta e diz por quê', async () => {
    expect(await updateOpenia(undefined)).toEqual({ status: 'failed', message: OPENIA_UPDATE_MESSAGES.unavailable })
  })
})

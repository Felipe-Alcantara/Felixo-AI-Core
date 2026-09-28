import { describe, expect, it } from 'vitest'
import { createCliAccountLabelStore } from './cli-account-labels'

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('createCliAccountLabelStore', () => {
  it('carrega os rótulos na primeira leitura e avisa quem assina', async () => {
    let calls = 0
    const store = createCliAccountLabelStore(async () => {
      calls += 1
      return { ok: true, accounts: [{ id: 'a', providerId: 'codex', label: 'Pessoal', createdAt: '' }] }
    })
    let notified = 0
    store.subscribe(() => {
      notified += 1
    })
    store.request('a')
    await flush()
    expect(store.getLabels().get('a')).toBe('Pessoal')
    expect(notified).toBe(1)
    store.request('a')
    await flush()
    expect(calls).toBe(1)
  })

  it('id desconhecido pede uma nova carga uma vez só', async () => {
    let calls = 0
    const store = createCliAccountLabelStore(async () => {
      calls += 1
      return { ok: true, accounts: [] }
    })
    store.request('sumida')
    await flush()
    store.request('sumida')
    await flush()
    expect(calls).toBe(1)
    expect(store.getLabels().get('sumida')).toBeUndefined()
  })

  it('sem a ponte ou com falha, fica sem rótulo e não lança', async () => {
    const semPonte = createCliAccountLabelStore(null)
    semPonte.request('a')
    expect(semPonte.getLabels().size).toBe(0)
    const falha = createCliAccountLabelStore(async () => {
      throw new Error('ipc caiu')
    })
    falha.request('a')
    await flush()
    expect(falha.getLabels().size).toBe(0)
  })
})

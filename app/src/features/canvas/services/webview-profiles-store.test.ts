import { describe, expect, it, vi } from 'vitest'
import { createWebviewProfilesStore } from './webview-profiles-store'

type Bridge = NonNullable<NonNullable<Window['felixo']>['webviewProfiles']>

function fakeBridge(initial: Record<string, unknown>[] = []) {
  const saved: Record<string, unknown>[] = [...initial]
  const bridge: Bridge = {
    list: vi.fn(async () => ({ ok: true, profiles: [...saved] })),
    save: vi.fn(async (profile) => {
      saved.push(profile)
      return { ok: true, profile }
    }),
    delete: vi.fn(async (id) => {
      const index = saved.findIndex((item) => item.id === id)
      if (index >= 0) saved.splice(index, 1)
      return { ok: true, deleted: index >= 0 }
    }),
  }
  return { bridge, saved }
}

describe('webview profiles store', () => {
  it('carrega uma vez, na primeira assinatura, e descarta linha que não reconhece', async () => {
    const { bridge } = fakeBridge([
      { id: 'trabalho-ab12', name: 'Trabalho', color: 'sky' },
      { id: 'default', name: 'Padrão' },
      { id: '../x', name: 'ruim' },
    ])
    const store = createWebviewProfilesStore(() => bridge)
    store.subscribe(() => {})
    store.subscribe(() => {})
    await store.refresh()
    expect(bridge.list).toHaveBeenCalledTimes(2) // 1 da assinatura + 1 do refresh explícito
    expect(store.getSnapshot()).toEqual([{ id: 'trabalho-ab12', name: 'Trabalho', color: 'sky' }])
  })

  it('criar grava pela ponte e aparece para quem assinou', async () => {
    const { bridge, saved } = fakeBridge()
    const store = createWebviewProfilesStore(() => bridge)
    const seen = vi.fn()
    store.subscribe(seen)
    const result = await store.create('  Trabalho ', 'rose')
    expect(result.ok).toBe(true)
    expect(saved[0]).toMatchObject({ name: 'Trabalho', color: 'rose' })
    expect(store.getSnapshot()).toHaveLength(1)
    expect(seen).toHaveBeenCalled()
  })

  it('nome repetido/vazio/Padrão é recusado ANTES de chamar a ponte', async () => {
    const { bridge } = fakeBridge()
    const store = createWebviewProfilesStore(() => bridge)
    await store.create('Trabalho')
    for (const nome of ['trabalho', '  ', 'Padrão']) {
      const result = await store.create(nome)
      expect(result.ok).toBe(false)
    }
    expect(bridge.save).toHaveBeenCalledTimes(1)
  })

  it('excluir chama a ponte (que limpa a sessão) e tira da lista; se a ponte falha, o perfil fica', async () => {
    const { bridge } = fakeBridge()
    const store = createWebviewProfilesStore(() => bridge)
    const created = await store.create('Trabalho')
    if (!created.ok) throw new Error('setup')
    const id = created.value.id

    bridge.delete = vi.fn(async () => ({ ok: false, message: 'disco travado' }))
    const falhou = await store.remove(id)
    expect(falhou).toEqual({ ok: false, message: 'disco travado' })
    expect(store.getSnapshot()).toHaveLength(1)

    bridge.delete = vi.fn(async () => ({ ok: true, deleted: true }))
    expect((await store.remove(id)).ok).toBe(true)
    expect(bridge.delete).toHaveBeenCalledWith(id)
    expect(store.getSnapshot()).toEqual([])
  })

  it('sem a ponte (preview web) funciona só em memória', async () => {
    const store = createWebviewProfilesStore(() => undefined)
    expect((await store.create('Local')).ok).toBe(true)
    expect(store.getSnapshot()).toHaveLength(1)
  })

  it('isReady separa "ainda carregando" de "carregou": só vira true quando a lista chega', async () => {
    // Uma única promessa compartilhada: toda consulta espera o mesmo "libera".
    let liberar!: () => void
    const chegou = new Promise<{ ok: true; profiles: Record<string, unknown>[] }>((resolve) => {
      liberar = () => resolve({ ok: true, profiles: [] })
    })
    const bridge: Bridge = {
      list: vi.fn(() => chegou),
      save: vi.fn(async (profile) => ({ ok: true, profile })),
      delete: vi.fn(async () => ({ ok: true, deleted: true })),
    }
    const store = createWebviewProfilesStore(() => bridge)
    expect(store.isReady()).toBe(false)
    store.subscribe(() => {})
    expect(store.isReady()).toBe(false)
    liberar()
    await vi.waitFor(() => expect(store.isReady()).toBe(true))
  })

  it('sem a ponte já nasce pronto (não há nada para carregar)', () => {
    expect(createWebviewProfilesStore(() => undefined).isReady()).toBe(true)
  })
})

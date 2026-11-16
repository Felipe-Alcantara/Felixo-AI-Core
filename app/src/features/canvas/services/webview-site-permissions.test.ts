import { describe, expect, it, vi } from 'vitest'
import {
  createWebviewSitePermissionsStore,
  describeSitePermissionRequest,
  displayOrigin,
  groupSitePermissions,
  type SitePermissionRequest,
} from './webview-site-permissions'

const pedido = (overrides: Partial<SitePermissionRequest> = {}): SitePermissionRequest => ({
  id: 'pedido-1',
  webContentsId: 11,
  fromPopup: false,
  profileId: 'default',
  origin: 'https://meet.exemplo.com',
  permissions: [
    { key: 'media:audio', label: 'usar o microfone' },
    { key: 'media:video', label: 'usar a câmera' },
  ],
  requestedAt: '2026-11-16T05:00:00.000Z',
  ...overrides,
})

describe('texto da faixa de permissão', () => {
  it('diz o site e o que ele quer; http fica visível porque avisa', () => {
    expect(describeSitePermissionRequest(pedido())).toBe('meet.exemplo.com quer usar o microfone e usar a câmera.')
    expect(displayOrigin('http://127.0.0.1:8787')).toBe('http://127.0.0.1:8787')
    expect(
      describeSitePermissionRequest(
        pedido({
          fromPopup: true,
          origin: 'https://login.exemplo.com',
          permissions: [{ key: 'clipboard-read', label: 'ler a área de transferência' }],
        }),
      ),
    ).toBe('Uma janela aberta por esta página (login.exemplo.com) quer ler a área de transferência.')
  })

  it('agrupa as decisões por perfil e site', () => {
    const grupos = groupSitePermissions([
      { profileId: 'default', origin: 'https://a.com', permission: 'geolocation', label: 'saber a sua localização', decision: 'granted', decidedAt: 'x' },
      { profileId: 'default', origin: 'https://a.com', permission: 'notifications', label: 'mostrar notificações', decision: 'denied', decidedAt: 'x' },
      { profileId: 'trabalho', origin: 'https://a.com', permission: 'fullscreen', label: 'entrar em tela cheia', decision: 'granted', decidedAt: 'x' },
    ])
    expect(grupos.map((grupo) => [grupo.profileId, grupo.origin, grupo.items.length])).toEqual([
      ['default', 'https://a.com', 2],
      ['trabalho', 'https://a.com', 1],
    ])
  })
})

describe('store das permissões dos sites', () => {
  it('carrega os pendentes e as decisões, segue os avisos do main e responde/revoga pela ponte', async () => {
    let pushPending: (value: unknown) => void = () => {}
    let pushChanged: () => void = () => {}
    const bridge = {
      pending: vi.fn(async () => ({ ok: true, pending: [pedido(), { lixo: true }] })),
      respond: vi.fn(async () => ({ ok: true })),
      list: vi.fn(async () => ({
        ok: true,
        decisions: [{ profileId: 'default', origin: 'https://a.com', permission: 'geolocation', label: 'x', decision: 'granted', decidedAt: 'x' }],
      })),
      revoke: vi.fn(async () => ({ ok: false, message: 'Site ou perfil invalido.' })),
      onPending: (callback: (value: unknown) => void) => {
        pushPending = callback
        return () => {}
      },
      onChanged: (callback: () => void) => {
        pushChanged = callback
        return () => {}
      },
    }
    const store = createWebviewSitePermissionsStore(() => bridge)
    const unsubscribe = store.subscribe(() => {})
    await vi.waitFor(() => expect(store.getPending()).toHaveLength(1))
    expect(store.getDecisions()).toHaveLength(1)

    pushPending([])
    expect(store.getPending()).toEqual([])
    pushChanged()
    await vi.waitFor(() => expect(bridge.list).toHaveBeenCalledTimes(2))

    expect(await store.respond('pedido-1', true)).toBeNull()
    expect(bridge.respond).toHaveBeenCalledWith({ id: 'pedido-1', allow: true })
    expect(await store.revoke({ profileId: 'default', origin: 'https://a.com' })).toBe('Site ou perfil invalido.')
    unsubscribe()
  })

  it('sem a ponte (preview web) fica vazia', () => {
    const store = createWebviewSitePermissionsStore(() => undefined)
    store.subscribe(() => {})
    expect(store.getPending()).toEqual([])
    expect(store.getDecisions()).toEqual([])
  })
})

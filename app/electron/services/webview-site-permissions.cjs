'use strict'

const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { isValidProfileId, DEFAULT_PROFILE_ID } = require('./webview-profile-partition.cjs')

/**
 * Permissões dos sites abertos nos blocos Página Web (decisão de 16/11/2026):
 * toda permissão pede confirmação numa faixa do próprio bloco, e a resposta
 * fica lembrada por perfil do navegador e origem até a pessoa revogar. Sem
 * resposta, nada é concedido. A sessão do próprio app (ditado, clipboard) não
 * passa por aqui.
 */

/** Rótulo de cada permissão que o Electron pede, no texto da faixa. */
const PERMISSION_LABELS = Object.freeze({
  'media:audio': 'usar o microfone',
  'media:video': 'usar a câmera',
  geolocation: 'saber a sua localização',
  notifications: 'mostrar notificações',
  'clipboard-read': 'ler a área de transferência',
  'clipboard-sanitized-write': 'escrever na área de transferência',
  'display-capture': 'capturar a tela',
  fullscreen: 'entrar em tela cheia',
  pointerLock: 'travar o ponteiro do mouse',
  keyboardLock: 'capturar o teclado',
  midi: 'usar dispositivos MIDI',
  midiSysex: 'controlar dispositivos MIDI',
  mediaKeySystem: 'tocar conteúdo protegido (DRM)',
  'idle-detection': 'saber quando você está ausente',
  'speaker-selection': 'escolher a saída de som',
  'storage-access': 'usar os próprios cookies dentro de outro site',
  'top-level-storage-access': 'usar os próprios cookies dentro de outro site',
  'window-management': 'ver e posicionar janelas nas telas',
  fileSystem: 'acessar arquivos do computador',
})

const MAX_PENDING_PER_CONTENTS = 4

/**
 * Perfil dono de uma sessão, pelo diretório dela (`<userData>/Partitions/
 * felixo-webview[-<id>]`, medido no Electron 42). `null` = não é sessão de site.
 */
function profileIdFromStoragePath(storagePath) {
  if (typeof storagePath !== 'string' || !storagePath) return null
  const normalized = storagePath.replace(/[\\/]+$/, '')
  const dir = path.basename(normalized.replace(/\\/g, '/'))
  const parent = path.basename(path.dirname(normalized.replace(/\\/g, '/')))
  if (parent !== 'Partitions') return null
  if (dir === 'felixo-webview') return DEFAULT_PROFILE_ID
  const prefix = 'felixo-webview-'
  if (!dir.startsWith(prefix)) return null
  const id = dir.slice(prefix.length)
  return isValidProfileId(id) ? id : null
}

/** Origem (esquema + host + porta) de uma página web; o resto não recebe permissão. */
function siteOrigin(url) {
  try {
    const parsed = new URL(String(url ?? ''))
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.origin : null
  } catch {
    return null
  }
}

/** Chaves gravadas para um pedido: `media` vira microfone e/ou câmera. Vazio = negar. */
function permissionKeys(permission, details) {
  if (permission === 'media') {
    const types = Array.isArray(details?.mediaTypes) ? details.mediaTypes : []
    return ['audio', 'video'].filter((type) => types.includes(type)).map((type) => `media:${type}`)
  }
  return Object.hasOwn(PERMISSION_LABELS, permission) ? [permission] : []
}

/** Chave da consulta síncrona (`setPermissionCheckHandler`); `null` = negar. */
function checkKey(permission, details) {
  if (permission === 'media') {
    return details?.mediaType === 'audio' || details?.mediaType === 'video' ? `media:${details.mediaType}` : null
  }
  return Object.hasOwn(PERMISSION_LABELS, permission) ? permission : null
}

/**
 * Uma negação lembrada nega o pedido inteiro; tudo concedido concede; o que
 * falta decidir vai para a pergunta.
 * @param {string[]} keys
 * @param {(key: string) => 'granted' | 'denied' | null} lookup
 */
function decideSiteRequest(keys, lookup) {
  if (!keys.length) return { action: 'deny', missing: [] }
  const decisions = keys.map((key) => lookup(key))
  if (decisions.includes('denied')) return { action: 'deny', missing: [] }
  const missing = keys.filter((_key, index) => decisions[index] !== 'granted')
  return missing.length ? { action: 'ask', missing } : { action: 'grant', missing: [] }
}

/**
 * Pedidos pendentes e decisões. `notify(channel, payload)` avisa o renderer.
 * @param {{
 *   repository: ReturnType<typeof import('./storage/webview-site-permissions-repository.cjs').createWebviewSitePermissionsRepository>,
 *   notify?: (channel: string, payload: unknown) => void,
 *   now?: () => number,
 *   newId?: () => string,
 * }} options
 */
function createSitePermissionBroker({ repository, notify = () => {}, now = () => Date.now(), newId = randomUUID }) {
  /** @type {Map<string, { view: object, callbacks: Array<(granted: boolean) => void>, requesterId: number, profileId: string, origin: string, keys: string[] }>} */
  const pending = new Map()
  // Popup aberto por um bloco → webContents do bloco (a faixa aparece nele).
  const ownerOf = new Map()
  const watched = new WeakSet()

  const lookupFor = (profileId, origin) => (key) => repository.get(profileId, origin, key)
  const publicView = (entry) => entry.view
  const emitPending = () => notify('webview-permissions:pending', [...pending.values()].map(publicView))
  const emitChanged = () => notify('webview-permissions:changed', null)

  function settle(id, granted) {
    const entry = pending.get(id)
    if (!entry) return
    pending.delete(id)
    for (const callback of entry.callbacks) callback(granted)
  }

  /** Nega o que estava pendente num webContents que navegou, fechou ou sumiu. */
  function dropContents(contentsId) {
    let dropped = false
    for (const [id, entry] of pending) {
      if (entry.requesterId === contentsId) {
        settle(id, false)
        dropped = true
      }
    }
    if (dropped) emitPending()
  }

  function watch(webContents) {
    if (!webContents?.on || watched.has(webContents)) return
    watched.add(webContents)
    const contentsId = webContents.id
    webContents.on('destroyed', () => {
      dropContents(contentsId)
      ownerOf.delete(contentsId)
    })
    webContents.on('did-start-navigation', (details, ...rest) => {
      // Electron passa um objeto de detalhes (v25+) ou (event, url, isInPlace, isMainFrame).
      const info = details?.isMainFrame === undefined ? { isSameDocument: rest[1], isMainFrame: rest[2] } : details
      if (info.isMainFrame && !info.isSameDocument) dropContents(contentsId)
    })
  }

  /** Revê os pendentes do mesmo perfil e site depois de uma decisão nova. */
  function resolveDecided(profileId, origin) {
    let changed = false
    for (const [id, entry] of pending) {
      if (entry.profileId !== profileId || entry.origin !== origin) continue
      const decision = decideSiteRequest(entry.keys, lookupFor(profileId, origin))
      if (decision.action === 'ask') continue
      settle(id, decision.action === 'grant')
      changed = true
    }
    return changed
  }

  return {
    PERMISSION_LABELS,

    /** O popup herda o bloco de quem o abriu (a pergunta aparece no bloco). */
    linkPopup(childContents, parentContents) {
      if (!childContents || !parentContents) return
      ownerOf.set(childContents.id, ownerOf.get(parentContents.id) ?? parentContents.id)
    },

    request({ webContents, permission, details, profileId, callback }) {
      const origin = siteOrigin(details?.requestingUrl ?? webContents?.getURL?.())
      const keys = permissionKeys(permission, details)
      if (!origin || !webContents) return callback(false)
      const decision = decideSiteRequest(keys, lookupFor(profileId, origin))
      if (decision.action !== 'ask') return callback(decision.action === 'grant')

      const requesterId = webContents.id
      const blockContentsId = ownerOf.get(requesterId) ?? requesterId
      for (const entry of pending.values()) {
        if (entry.requesterId === requesterId && entry.origin === origin && entry.keys.join(',') === keys.join(',')) {
          entry.callbacks.push(callback)
          return undefined
        }
      }
      const ofContents = [...pending.values()].filter((entry) => entry.requesterId === requesterId).length
      if (ofContents >= MAX_PENDING_PER_CONTENTS) return callback(false)

      watch(webContents)
      const id = newId()
      pending.set(id, {
        requesterId,
        profileId,
        origin,
        keys,
        callbacks: [callback],
        view: {
          id,
          webContentsId: blockContentsId,
          fromPopup: blockContentsId !== requesterId,
          profileId,
          origin,
          permissions: decision.missing.map((key) => ({ key, label: PERMISSION_LABELS[key] ?? key })),
          requestedAt: new Date(now()).toISOString(),
        },
      })
      emitPending()
      return undefined
    },

    check({ profileId, permission, requestingOrigin, details }) {
      const key = checkKey(permission, details)
      const origin = siteOrigin(requestingOrigin)
      return Boolean(key && origin && repository.get(profileId, origin, key) === 'granted')
    },

    /** Resposta da faixa: a decisão vale para cada permissão do pedido. */
    respond({ id, allow }) {
      const entry = pending.get(id)
      if (!entry || typeof allow !== 'boolean') return { ok: false, message: 'Pedido de permissão não encontrado.' }
      const nowIso = new Date(now()).toISOString()
      const decision = allow ? 'granted' : 'denied'
      for (const key of entry.view.permissions.map((item) => item.key)) {
        repository.set({ profileId: entry.profileId, origin: entry.origin, permission: key, decision, nowIso })
      }
      settle(id, allow)
      resolveDecided(entry.profileId, entry.origin)
      emitPending()
      emitChanged()
      return { ok: true }
    },

    listPending: () => [...pending.values()].map(publicView),
    listDecisions: (profileId) =>
      repository.list(profileId).map((item) => ({ ...item, label: PERMISSION_LABELS[item.permission] ?? item.permission })),

    revoke({ profileId, origin, permission }) {
      const removed = repository.revoke({ profileId, origin, permission })
      if (removed) emitChanged()
      return { ok: true, removed }
    },

    forgetProfile(profileId) {
      const removed = repository.deleteProfile(profileId)
      if (removed) emitChanged()
      return removed
    },
  }
}

module.exports = {
  PERMISSION_LABELS,
  checkKey,
  createSitePermissionBroker,
  decideSiteRequest,
  permissionKeys,
  profileIdFromStoragePath,
  siteOrigin,
}

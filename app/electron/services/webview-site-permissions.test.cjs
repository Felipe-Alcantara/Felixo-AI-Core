const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { EventEmitter } = require('node:events')

const {
  checkKey,
  createSitePermissionBroker,
  decideSiteRequest,
  permissionKeys,
  profileIdFromStoragePath,
  siteOrigin,
} = require('./webview-site-permissions.cjs')
const { createStorageDatabase } = require('./storage/sqlite-database.cjs')
const { createWebviewSitePermissionsRepository } = require('./storage/webview-site-permissions-repository.cjs')

test('o perfil sai do diretório da sessão; só as partições do navegador interno são de site', () => {
  assert.equal(profileIdFromStoragePath('C:\\Users\\p\\AppData\\Roaming\\felixo\\Partitions\\felixo-webview'), 'default')
  assert.equal(profileIdFromStoragePath('/home/p/.config/felixo/Partitions/felixo-webview-trabalho'), 'trabalho')
  assert.equal(profileIdFromStoragePath('/home/p/.config/felixo/Partitions/felixo-webview-trabalho/'), 'trabalho')
  for (const outro of [
    '/home/p/.config/felixo',
    '/home/p/.config/felixo/Partitions/outra-coisa',
    '/home/p/.config/felixo/Partitions/felixo-webview-X!',
    '/home/p/.config/felixo/Partitions/felixo-webview-default',
    null,
    undefined,
    '',
  ]) {
    assert.equal(profileIdFromStoragePath(outro), null, String(outro))
  }
})

test('origem só de página web; microfone e câmera são chaves separadas; o resto desconhecido nega', () => {
  assert.equal(siteOrigin('https://meet.exemplo.com/sala?x=1#y'), 'https://meet.exemplo.com')
  assert.equal(siteOrigin('http://127.0.0.1:8787/'), 'http://127.0.0.1:8787')
  for (const url of ['file:///C:/x.html', 'about:blank', 'data:text/html,oi', 'não é url', undefined]) {
    assert.equal(siteOrigin(url), null, String(url))
  }
  assert.deepEqual(permissionKeys('media', { mediaTypes: ['audio'] }), ['media:audio'])
  assert.deepEqual(permissionKeys('media', { mediaTypes: ['video', 'audio'] }), ['media:audio', 'media:video'])
  assert.deepEqual(permissionKeys('media', {}), [])
  assert.deepEqual(permissionKeys('geolocation'), ['geolocation'])
  assert.deepEqual(permissionKeys('unknown'), [])
  assert.deepEqual(permissionKeys('openExternal'), [])
  assert.equal(checkKey('media', { mediaType: 'video' }), 'media:video')
  assert.equal(checkKey('media', { mediaType: 'unknown' }), null)
  assert.equal(checkKey('hid'), null)
})

test('negação lembrada nega o pedido inteiro; tudo concedido concede; o resto pergunta só o que falta', () => {
  const lookup = (map) => (key) => map[key] ?? null
  assert.deepEqual(decideSiteRequest([], lookup({})), { action: 'deny', missing: [] })
  assert.deepEqual(decideSiteRequest(['media:audio'], lookup({ 'media:audio': 'granted' })), { action: 'grant', missing: [] })
  assert.deepEqual(
    decideSiteRequest(['media:audio', 'media:video'], lookup({ 'media:audio': 'granted', 'media:video': 'denied' })),
    { action: 'deny', missing: [] },
  )
  assert.deepEqual(decideSiteRequest(['media:audio', 'media:video'], lookup({ 'media:audio': 'granted' })), {
    action: 'ask',
    missing: ['media:video'],
  })
})

function withBroker(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-site-perms-'))
  const database = createStorageDatabase({ databaseDir: dir })
  const repository = createWebviewSitePermissionsRepository(database)
  const sent = []
  let ids = 0
  const broker = createSitePermissionBroker({
    repository,
    notify: (channel, payload) => sent.push({ channel, payload }),
    now: () => Date.parse('2026-11-16T05:00:00.000Z'),
    newId: () => `pedido-${++ids}`,
  })
  try {
    return run({ broker, repository, sent })
  } finally {
    database.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

function fakeContents(id, url = 'https://meet.exemplo.com/sala') {
  const contents = new EventEmitter()
  contents.id = id
  contents.getURL = () => url
  return contents
}

const ask = (broker, contents, permission, details = {}, profileId = 'default') => {
  const answers = []
  broker.request({
    webContents: contents,
    permission,
    details: { requestingUrl: contents.getURL(), ...details },
    profileId,
    callback: (granted) => answers.push(granted),
  })
  return answers
}

test('sem decisão o site espera a faixa; Permitir concede, lembra por perfil e origem e responde a consulta', () => {
  withBroker(({ broker, repository, sent }) => {
    const bloco = fakeContents(11)
    const answers = ask(broker, bloco, 'media', { mediaTypes: ['audio', 'video'] })
    assert.deepEqual(answers, [], 'fica pendente até a resposta')
    const [pedido] = broker.listPending()
    assert.equal(pedido.origin, 'https://meet.exemplo.com')
    assert.equal(pedido.webContentsId, 11)
    assert.deepEqual(pedido.permissions.map((item) => item.label), ['usar o microfone', 'usar a câmera'])
    assert.ok(sent.some((item) => item.channel === 'webview-permissions:pending'))
    assert.equal(broker.check({ profileId: 'default', permission: 'media', requestingOrigin: 'https://meet.exemplo.com/', details: { mediaType: 'audio' } }), false)

    assert.deepEqual(broker.respond({ id: pedido.id, allow: true }), { ok: true })
    assert.deepEqual(answers, [true])
    assert.equal(repository.get('default', 'https://meet.exemplo.com', 'media:video'), 'granted')
    assert.equal(broker.check({ profileId: 'default', permission: 'media', requestingOrigin: 'https://meet.exemplo.com/', details: { mediaType: 'audio' } }), true)
    assert.deepEqual(ask(broker, fakeContents(12), 'media', { mediaTypes: ['audio'] }), [true], 'lembrada: não pergunta de novo')
    assert.equal(broker.check({ profileId: 'trabalho', permission: 'media', requestingOrigin: 'https://meet.exemplo.com/', details: { mediaType: 'audio' } }), false, 'outro perfil não herda')
  })
})

test('Negar também é lembrado até revogar; revogar volta a perguntar', () => {
  withBroker(({ broker }) => {
    const bloco = fakeContents(21)
    const primeira = ask(broker, bloco, 'notifications')
    broker.respond({ id: broker.listPending()[0].id, allow: false })
    assert.deepEqual(primeira, [false])
    assert.deepEqual(ask(broker, bloco, 'notifications'), [false], 'negação lembrada: sem nova faixa')
    assert.equal(broker.listPending().length, 0)

    assert.equal(broker.revoke({ profileId: 'default', origin: 'https://meet.exemplo.com', permission: 'notifications' }).removed, 1)
    assert.deepEqual(ask(broker, bloco, 'notifications'), [])
    assert.equal(broker.listPending().length, 1, 'depois de revogar, pergunta de novo')
  })
})

test('o mesmo pedido repetido vira uma faixa só; navegar ou fechar o bloco nega o que estava pendente', () => {
  withBroker(({ broker, sent }) => {
    const bloco = fakeContents(31)
    const a = ask(broker, bloco, 'geolocation')
    const b = ask(broker, bloco, 'geolocation')
    assert.equal(broker.listPending().length, 1)
    bloco.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false })
    assert.deepEqual([a, b], [[false], [false]])
    assert.equal(broker.listPending().length, 0)
    assert.deepEqual(sent.at(-1), { channel: 'webview-permissions:pending', payload: [] })

    const outro = fakeContents(32)
    const c = ask(broker, outro, 'clipboard-read')
    outro.emit('did-start-navigation', { isMainFrame: true, isSameDocument: true })
    assert.deepEqual(c, [], 'âncora na mesma página não cancela')
    outro.emit('destroyed')
    assert.deepEqual(c, [false])
  })
})

test('popup de um bloco pergunta no bloco que o abriu; página que não é web e permissão desconhecida negam', () => {
  withBroker(({ broker }) => {
    const bloco = fakeContents(41)
    const popup = fakeContents(42, 'https://login.exemplo.com/oauth')
    broker.linkPopup(popup, bloco)
    ask(broker, popup, 'clipboard-sanitized-write')
    const [pedido] = broker.listPending()
    assert.equal(pedido.webContentsId, 41)
    assert.equal(pedido.fromPopup, true)
    assert.equal(pedido.origin, 'https://login.exemplo.com')

    assert.deepEqual(ask(broker, fakeContents(43, 'file:///C:/x.html'), 'geolocation'), [false])
    assert.deepEqual(ask(broker, fakeContents(44), 'unknown'), [false])
  })
})

test('uma decisão resolve os outros pedidos pendentes do mesmo site e perfil; excluir o perfil apaga as decisões', () => {
  withBroker(({ broker, repository }) => {
    const a = ask(broker, fakeContents(51), 'geolocation')
    const b = ask(broker, fakeContents(52), 'geolocation')
    assert.equal(broker.listPending().length, 2)
    broker.respond({ id: broker.listPending()[0].id, allow: true })
    assert.deepEqual([a, b], [[true], [true]])
    assert.equal(broker.listPending().length, 0)

    repository.set({ profileId: 'trabalho', origin: 'https://x.com', permission: 'fullscreen', decision: 'granted' })
    assert.equal(broker.forgetProfile('trabalho'), 1)
    assert.deepEqual(broker.listDecisions('trabalho'), [])
    assert.equal(broker.listDecisions().length, 1, 'o Padrão continua com a decisão dele')
  })
})

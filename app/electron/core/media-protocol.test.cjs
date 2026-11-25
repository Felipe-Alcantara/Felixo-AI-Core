'use strict'
require('../../scripts/test-support/pasta-do-teste.cjs')

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { createAppProtocolHandler, MEDIA_PATH_PREFIX } = require('./app-protocol.cjs')
const { parseRange } = require('./media-response.cjs')
const { createMediaRegistry } = require('../services/media-registry.cjs')

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-midia-'))
const pastaAutorizada = path.join(base, 'Pasta com acento é espaço')
const pastaFora = path.join(base, 'fora')
fs.mkdirSync(pastaAutorizada)
fs.mkdirSync(pastaFora)
const bytes = Buffer.from('0123456789'.repeat(10)) // 100 bytes
const mp3 = path.join(pastaAutorizada, 'áudio gerado.mp3')
fs.writeFileSync(mp3, bytes)
fs.writeFileSync(path.join(pastaFora, 'segredo.mp3'), 'segredo')
fs.writeFileSync(path.join(pastaAutorizada, 'nota.txt'), 'texto')

const authorize = (filePath) => {
  const real = fs.realpathSync(path.resolve(String(filePath)))
  const rel = path.relative(pastaAutorizada, real)
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('fora')
  return real
}
const registry = createMediaRegistry({ authorize })
const handler = createAppProtocolHandler({
  distDir: base,
  fetchFile: () => new Response('x'),
  resolveMedia: (id) => registry.resolve(id),
})
const pedir = (id, range, method = 'GET') =>
  handler({
    url: `app://felixo${MEDIA_PATH_PREFIX}${id}`,
    method,
    headers: new Headers(range ? { range } : {}),
  })

test('Range no começo, no meio, no fim e sem Range', async () => {
  const { id } = registry.issue(mp3)
  const inteiro = await pedir(id)
  assert.equal(inteiro.status, 200)
  assert.equal(inteiro.headers.get('accept-ranges'), 'bytes')
  assert.equal(inteiro.headers.get('content-type'), 'audio/mpeg')
  assert.equal(Buffer.from(await inteiro.arrayBuffer()).length, 100)

  for (const [range, esperado, contentRange] of [
    ['bytes=0-9', bytes.subarray(0, 10), 'bytes 0-9/100'],
    ['bytes=40-49', bytes.subarray(40, 50), 'bytes 40-49/100'],
    ['bytes=90-', bytes.subarray(90), 'bytes 90-99/100'],
    ['bytes=-5', bytes.subarray(95), 'bytes 95-99/100'],
    ['bytes=95-9999', bytes.subarray(95), 'bytes 95-99/100'],
  ]) {
    const res = await pedir(id, range)
    assert.equal(res.status, 206, range)
    assert.equal(res.headers.get('content-range'), contentRange)
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), esperado, range)
  }
})

test('Range fora do arquivo vira 416 e HEAD não manda corpo', async () => {
  const { id } = registry.issue(mp3)
  const res = await pedir(id, 'bytes=100-')
  assert.equal(res.status, 416)
  assert.equal(res.headers.get('content-range'), 'bytes */100')
  const head = await pedir(id, undefined, 'HEAD')
  assert.equal(head.status, 200)
  assert.equal(head.headers.get('content-length'), '100')
  assert.equal((await head.arrayBuffer()).byteLength, 0)
  assert.equal(parseRange('bytes=0-1,5-6', 100), null)
  assert.equal(parseRange('bytes=-', 100), 'invalid')
})

test('id desconhecido, inventado ou com caminho dentro é recusado', async () => {
  for (const id of ['', 'nao-existe', '..%2f..%2fsegredo.mp3', encodeURIComponent(mp3), 'a/b']) {
    assert.equal((await pedir(id)).status, 403, id)
  }
  assert.equal((await pedir(registry.issue(mp3).id, undefined, 'POST')).status, 403)
})

test('arquivo fora das pastas autorizadas e não-mídia não ganham id', () => {
  assert.throws(() => registry.issue(path.join(pastaFora, 'segredo.mp3')))
  assert.throws(() => registry.issue(path.join(pastaAutorizada, 'nota.txt')), /áudio ou vídeo/)
  assert.throws(() => registry.issue(path.join(pastaAutorizada, '..', 'fora', 'segredo.mp3')))
})

test('a autorização é conferida de novo a cada pedido e a URL não revela o caminho', async () => {
  let aberto = true
  const reg = createMediaRegistry({ authorize: (p) => (aberto ? authorize(p) : (() => { throw new Error('revogado') })()) })
  const { id } = reg.issue(mp3)
  assert.doesNotMatch(id, /mp3|áudio|felixo/i)
  assert.ok(reg.resolve(id))
  aberto = false
  assert.equal(reg.resolve(id), null)
  reg.clear()
  aberto = true
  assert.equal(reg.resolve(id), null)
})

test('o mesmo arquivo reaproveita o id e o limite descarta o mais antigo', () => {
  const reg = createMediaRegistry({ authorize, max: 2 })
  const a = reg.issue(mp3).id
  assert.equal(reg.issue(mp3).id, a)
  const extras = ['b', 'c'].map((n) => {
    const f = path.join(pastaAutorizada, `${n}.wav`)
    fs.writeFileSync(f, 'x')
    return reg.issue(f).id
  })
  assert.equal(reg.resolve(a), null)
  assert.ok(reg.resolve(extras[1]))
})

test.after(() => fs.rmSync(base, { recursive: true, force: true }))

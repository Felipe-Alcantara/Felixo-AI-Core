'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { main, parseArgs } = require('./packaged-canvas-smoke.cjs')

test('lê a pasta da release e o artefato explícito; argumento desconhecido falha dizendo o uso', () => {
  assert.deepEqual(parseArgs([]), { releaseDir: 'release', artifact: '' })
  assert.deepEqual(parseArgs(['--release-dir', 'saida', '--artifact', 'x.AppImage']), { releaseDir: 'saida', artifact: 'x.AppImage' })
  assert.throws(() => parseArgs(['--pacote']), /Uso: --release-dir/)
})

test('sem artefato empacotado, falha antes de abrir o app (código 1)', () => {
  const vazia = fs.mkdtempSync(path.join(os.tmpdir(), 'release-vazia-'))
  const erros = []
  const original = console.error
  console.error = (mensagem) => erros.push(String(mensagem))
  try {
    assert.equal(main(['--release-dir', vazia]), 1)
  } finally {
    console.error = original
    fs.rmSync(vazia, { recursive: true, force: true })
  }
  assert.match(erros.join('\n'), /Nenhum artefato empacotado encontrado/)
})

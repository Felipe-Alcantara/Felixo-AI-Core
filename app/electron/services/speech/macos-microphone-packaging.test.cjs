require('../../../scripts/test-support/pasta-do-teste.cjs') // isola o temporário deste arquivo (ver pasta-do-teste.cjs)
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'package.json'), 'utf8'))

test('o app do macOS declara por que usa o microfone (sem isso o sistema nega o acesso sem avisar)', () => {
  const texto = pkg.build?.mac?.extendInfo?.NSMicrophoneUsageDescription
  assert.equal(typeof texto, 'string')
  assert.ok(texto.trim().length >= 20, 'a descrição precisa explicar o uso, não ser um placeholder')
})

test('o macOS assinado (runtime reforçado é o padrão) mantém a permissão de áudio de entrada', () => {
  const mac = pkg.build.mac
  assert.notEqual(mac.hardenedRuntime, false, 'se desligar o runtime reforçado, revise este teste')
  for (const chave of ['entitlements', 'entitlementsInherit']) {
    const arquivo = path.join(__dirname, '..', '..', '..', mac[chave])
    const plist = fs.readFileSync(arquivo, 'utf8')
    assert.match(plist, /<key>com\.apple\.security\.device\.audio-input<\/key>\s*<true\/>/, chave)
    // Entitlements próprios substituem o padrão do electron-builder: o JIT do V8 não pode sumir.
    assert.match(plist, /<key>com\.apple\.security\.cs\.allow-jit<\/key>\s*<true\/>/, chave)
  }
})

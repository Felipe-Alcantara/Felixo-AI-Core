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

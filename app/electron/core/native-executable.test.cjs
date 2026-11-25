'use strict'
require('../../scripts/test-support/pasta-do-teste.cjs') // isola o temporário deste arquivo (ver pasta-do-teste.cjs)

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { inspectNativeExecutable } = require('./native-executable.cjs')
const {
  NPM_PLACEHOLDER_STUB,
  buildElf,
  buildFatMachO,
  buildMachO,
  buildPe,
} = require('../__fixtures__/native-executables.cjs')

function withFile(content, run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-native-exe-'))
  const file = path.join(dir, 'cli.exe')
  try {
    if (content !== null) fs.writeFileSync(file, content)
    return run(file)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

const inspect = (content, platformName, arch) =>
  withFile(content, (file) => inspectNativeExecutable(file, { platformName, arch }))

test('aceita o executável completo de cada sistema na arquitetura dele', () => {
  assert.equal(inspect(buildPe({ arch: 'x64' }), 'win32', 'x64').ok, true)
  assert.equal(inspect(buildPe({ arch: 'arm64', certificateSize: 0x80 }), 'win32', 'arm64').ok, true)
  assert.equal(inspect(buildElf({ arch: 'x64' }), 'linux', 'x64').ok, true)
  assert.equal(inspect(buildElf({ arch: 'arm64' }), 'linux', 'arm64').ok, true)
  assert.equal(inspect(buildMachO({ arch: 'arm64' }), 'darwin', 'arm64').ok, true)
  assert.equal(inspect(buildFatMachO(), 'darwin', 'x64').ok, true)
})

test('o placeholder de texto do npm no lugar do .exe é recusado como stub', () => {
  const result = inspect(NPM_PLACEHOLDER_STUB, 'win32', 'x64')
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'stub')
})

test('arquivo ausente ou vazio não passa', () => {
  assert.equal(inspect(null, 'win32', 'x64').reason, 'ausente')
  assert.equal(inspect('', 'linux', 'x64').reason, 'stub')
})

test('um executável cortado no meio da extração é recusado em cada formato', () => {
  const cut = (buffer) => buffer.subarray(0, buffer.length - 1)
  assert.equal(inspect(cut(buildPe()), 'win32', 'x64').reason, 'truncado')
  assert.equal(inspect(cut(buildElf()), 'linux', 'x64').reason, 'truncado')
  assert.equal(inspect(cut(buildMachO()), 'darwin', 'arm64').reason, 'truncado')
  assert.equal(inspect(cut(buildFatMachO()), 'darwin', 'arm64').reason, 'truncado')
})

test('a assinatura Authenticode cortada também conta como executável incompleto', () => {
  const signed = buildPe({ certificateSize: 0x100 })
  const result = inspect(signed.subarray(0, signed.length - 0x10), 'win32', 'x64')
  assert.equal(result.reason, 'truncado')
})

test('cabeçalho cortado antes das tabelas é incompleto, não formato desconhecido', () => {
  assert.equal(inspect(buildPe().subarray(0, 0x50), 'win32', 'x64').reason, 'truncado')
  assert.equal(inspect(buildElf().subarray(0, 0x30), 'linux', 'x64').reason, 'truncado')
})

test('o binário de outro sistema é recusado como formato', () => {
  assert.equal(inspect(buildElf(), 'win32', 'x64').reason, 'formato')
  assert.equal(inspect(buildPe(), 'linux', 'x64').reason, 'formato')
  assert.equal(inspect(buildPe(), 'darwin', 'arm64').reason, 'formato')
})

test('arquitetura: x64 roda emulado no Windows e no macOS ARM, nunca no Linux ARM', () => {
  assert.equal(inspect(buildPe({ arch: 'x64' }), 'win32', 'arm64').ok, true)
  assert.equal(inspect(buildMachO({ arch: 'x64' }), 'darwin', 'arm64').ok, true)
  assert.equal(inspect(buildElf({ arch: 'x64' }), 'linux', 'arm64').reason, 'arquitetura')
  assert.equal(inspect(buildPe({ arch: 'arm64' }), 'win32', 'x64').reason, 'arquitetura')
})

test('confere o executável real deste processo (o Node) como válido', () => {
  const result = inspectNativeExecutable(process.execPath)
  assert.equal(result.ok, true, JSON.stringify(result))
})

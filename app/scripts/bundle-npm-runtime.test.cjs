'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const {
  NPM_RUNTIME_POLICIES,
  copyNpmRuntime,
  shouldCopy,
} = require('./bundle-npm-runtime.cjs')

function writeFile(filePath, contents = '') {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, contents, 'utf8')
}

test('a política atual mantém o runtime e remove artefatos de desenvolvimento', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-npm-runtime-test-'))
  const source = path.join(temporaryRoot, 'source')
  const target = path.join(temporaryRoot, 'current', 'npm')

  try {
    writeFile(path.join(source, 'bin', 'npm-cli.js'), '#!/usr/bin/env node\n')
    writeFile(path.join(source, 'lib', 'runtime.js'), 'module.exports = true\n')
    writeFile(path.join(source, 'lib', 'runtime.py'), 'print("runtime")\n')
    writeFile(path.join(source, 'package.json'), '{}\n')
    writeFile(path.join(source, 'LICENSE'), 'license\n')
    writeFile(path.join(source, 'docs', 'README.md'), 'docs\n')
    writeFile(path.join(source, 'lib', 'README.md'), 'docs\n')
    writeFile(path.join(source, 'lib', 'runtime.map'), '{}\n')
    writeFile(path.join(source, 'node_modules', 'fixture', 'index.js'), 'fixture\n')
    writeFile(path.join(source, 'node_modules', 'fixture', 'test', 'unit.js'), 'test\n')
    writeFile(path.join(source, 'node_modules', 'fixture', 'examples', 'demo.js'), 'demo\n')
    writeFile(path.join(source, 'node_modules', 'fixture', 'fixtures', 'input.json'), '{}\n')

    copyNpmRuntime({ source, target, policy: NPM_RUNTIME_POLICIES.current })

    assert.equal(fs.existsSync(path.join(target, 'bin', 'npm-cli.js')), true)
    assert.equal(fs.existsSync(path.join(target, 'lib', 'runtime.js')), true)
    assert.equal(fs.existsSync(path.join(target, 'lib', 'runtime.py')), true)
    assert.equal(fs.existsSync(path.join(target, 'package.json')), true)
    assert.equal(fs.existsSync(path.join(target, 'LICENSE')), true)
    assert.equal(fs.existsSync(path.join(target, 'node_modules', 'fixture', 'index.js')), true)
    assert.equal(fs.existsSync(path.join(target, 'docs')), false)
    assert.equal(fs.existsSync(path.join(target, 'lib', 'README.md')), false)
    assert.equal(fs.existsSync(path.join(target, 'lib', 'runtime.map')), false)
    assert.equal(fs.existsSync(path.join(target, 'node_modules', 'fixture', 'test')), false)
    assert.equal(fs.existsSync(path.join(target, 'node_modules', 'fixture', 'examples')), false)
    assert.equal(fs.existsSync(path.join(target, 'node_modules', 'fixture', 'fixtures')), false)
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('a política baseline conserva os diretórios não runtime para medir a comparação', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-npm-runtime-baseline-test-'))
  const source = path.join(temporaryRoot, 'source')
  const target = path.join(temporaryRoot, 'baseline', 'npm')

  try {
    writeFile(path.join(source, 'bin', 'npm-cli.js'))
    writeFile(path.join(source, 'node_modules', 'fixture', 'test', 'unit.js'))
    writeFile(path.join(source, 'node_modules', 'fixture', 'examples', 'demo.js'))
    writeFile(path.join(source, 'node_modules', 'fixture', 'fixtures', 'input.json'))
    writeFile(path.join(source, 'docs', 'README.md'))
    writeFile(path.join(source, 'README.md'))

    copyNpmRuntime({ source, target, policy: NPM_RUNTIME_POLICIES.baseline })

    assert.equal(fs.existsSync(path.join(target, 'node_modules', 'fixture', 'test', 'unit.js')), true)
    assert.equal(fs.existsSync(path.join(target, 'node_modules', 'fixture', 'examples', 'demo.js')), true)
    assert.equal(fs.existsSync(path.join(target, 'node_modules', 'fixture', 'fixtures', 'input.json')), true)
    assert.equal(fs.existsSync(path.join(target, 'docs')), false)
    assert.equal(fs.existsSync(path.join(target, 'README.md')), false)
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('a política nunca descarta arquivos executáveis pelo tipo de extensão', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-npm-runtime-policy-test-'))

  try {
    const runtimeJs = path.join(temporaryRoot, 'runtime.js')
    const runtimeJson = path.join(temporaryRoot, 'package.json')
    const runtimePython = path.join(temporaryRoot, 'gyp.py')

    writeFile(runtimeJs)
    writeFile(runtimeJson)
    writeFile(runtimePython)

    assert.equal(shouldCopy(runtimeJs, NPM_RUNTIME_POLICIES.current), true)
    assert.equal(shouldCopy(runtimeJson, NPM_RUNTIME_POLICIES.current), true)
    assert.equal(shouldCopy(runtimePython, NPM_RUNTIME_POLICIES.current), true)
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

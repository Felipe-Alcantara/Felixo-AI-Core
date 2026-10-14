'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  CODEX_REINSTALL_COMMAND,
  getManagedCliPackageVersion,
  verifyManagedCliInstallation,
} = require('./managed-cli-health.cjs')

function createLayout() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-cli-health-'))
  return {
    root,
    packagesBin: path.join(root, 'bin'),
    runtimeBin: path.join(root, 'runtime-bin'),
  }
}

function writePackage(layout, packageName) {
  const packageDir = path.join(layout.root, 'node_modules', ...packageName.split('/'))
  fs.mkdirSync(packageDir, { recursive: true })
  fs.writeFileSync(path.join(packageDir, 'package.json'), '{}', 'utf8')
}

function writeManagedCliPackage(layout, packageName, version) {
  const packageDir = path.join(layout.root, 'node_modules', ...packageName.split('/'))
  fs.mkdirSync(packageDir, { recursive: true })
  fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify({ version }), 'utf8')
}

test('le a versao da CLI principal materializada pelo npm', () => {
  const layout = createLayout()

  try {
    writeManagedCliPackage(layout, '@google/gemini-cli', '0.64.0')

    assert.equal(
      getManagedCliPackageVersion({
        providerId: 'gemini',
        layout,
      }),
      '0.64.0',
    )
  } finally {
    fs.rmSync(layout.root, { recursive: true, force: true })
  }
})

test('trata manifesto ausente ou ilegivel como versao desconhecida', () => {
  const layout = createLayout()

  try {
    assert.equal(
      getManagedCliPackageVersion({
        providerId: 'gemini',
        layout,
      }),
      null,
    )

    writeManagedCliPackage(layout, '@google/gemini-cli', 'nao-e-json')
    fs.writeFileSync(
      path.join(layout.root, 'node_modules', '@google', 'gemini-cli', 'package.json'),
      '{ quebrado',
      'utf8',
    )

    assert.equal(
      getManagedCliPackageVersion({
        providerId: 'gemini',
        layout,
      }),
      null,
    )
  } finally {
    fs.rmSync(layout.root, { recursive: true, force: true })
  }
})

test('detecta o pacote nativo do Codex ausente no Windows', () => {
  const layout = createLayout()

  try {
    const result = verifyManagedCliInstallation({
      providerId: 'codex',
      layout,
      platformName: 'win32',
      arch: 'x64',
    })

    assert.equal(result.ok, false)
    assert.equal(result.requiredPackage, '@openai/codex-win32-x64')
    assert.equal(
      result.message,
      `Missing optional dependency @openai/codex-win32-x64. Reinstall Codex: ${CODEX_REINSTALL_COMMAND}`,
    )
  } finally {
    fs.rmSync(layout.root, { recursive: true, force: true })
  }
})

test('aceita o pacote nativo do Codex quando ele foi materializado', () => {
  const layout = createLayout()

  try {
    writePackage(layout, '@openai/codex-win32-x64')

    const result = verifyManagedCliInstallation({
      providerId: 'codex',
      layout,
      platformName: 'win32',
      arch: 'x64',
    })

    assert.equal(result.ok, true)
    assert.equal(result.requiredPackage, '@openai/codex-win32-x64')
  } finally {
    fs.rmSync(layout.root, { recursive: true, force: true })
  }
})

test('não exige pacote de plataforma para uma CLI sem dependência declarada', () => {
  const layout = createLayout()

  try {
    const result = verifyManagedCliInstallation({
      providerId: 'gemini',
      layout,
      platformName: 'win32',
      arch: 'x64',
    })

    assert.deepEqual(result, {
      ok: true,
      requiredPackage: null,
      packagePath: null,
    })
  } finally {
    fs.rmSync(layout.root, { recursive: true, force: true })
  }
})

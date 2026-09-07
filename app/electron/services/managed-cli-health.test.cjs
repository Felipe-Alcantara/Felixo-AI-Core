'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  CODEX_REINSTALL_COMMAND,
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

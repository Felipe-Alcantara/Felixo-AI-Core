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
const {
  NPM_PLACEHOLDER_STUB,
  buildElf,
  buildMachO,
  buildPe,
} = require('../__fixtures__/native-executables.cjs')

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

/** O `codex.exe` (ou `codex`) no pacote da plataforma, onde o `bin/codex.js` o procura. */
function writeCodexNative(packageDir, triple, content, fileName = 'codex.exe') {
  const binDir = path.join(packageDir, 'vendor', triple, 'bin')
  fs.mkdirSync(binDir, { recursive: true })
  fs.writeFileSync(path.join(binDir, fileName), content)
}

function writeClaude(layout, content) {
  writePackage(layout, '@anthropic-ai/claude-code')
  const binDir = path.join(layout.root, 'node_modules', '@anthropic-ai', 'claude-code', 'bin')
  fs.mkdirSync(binDir, { recursive: true })
  fs.writeFileSync(path.join(binDir, 'claude.exe'), content)
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

test('aceita o pacote nativo do Codex aninhado dentro do pacote principal', () => {
  // Regressão medida numa instalação real (Codex 0.150.1, Windows): o npm pôs o
  // pacote da plataforma em node_modules/@openai/codex/node_modules/, onde o Node
  // o encontra e o Codex roda. Reprovada aqui, a cópia passava por CLI externa e
  // nunca era atualizada.
  const layout = createLayout()

  try {
    writePackage(layout, '@openai/codex')
    writePackage(layout, '@openai/codex/node_modules/@openai/codex-win32-x64')
    writeCodexNative(
      path.join(layout.root, 'node_modules', '@openai', 'codex', 'node_modules', '@openai', 'codex-win32-x64'),
      'x86_64-pc-windows-msvc',
      buildPe(),
    )

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

test('o pacote nativo aninhado em outro pacote não conta para o Codex', () => {
  const layout = createLayout()

  try {
    writePackage(layout, '@openai/codex')
    writePackage(layout, '@google/gemini-cli/node_modules/@openai/codex-win32-x64')

    const result = verifyManagedCliInstallation({
      providerId: 'codex',
      layout,
      platformName: 'win32',
      arch: 'x64',
    })

    assert.equal(result.ok, false)
  } finally {
    fs.rmSync(layout.root, { recursive: true, force: true })
  }
})

test('aceita o pacote nativo do Codex quando ele foi materializado', () => {
  const layout = createLayout()

  try {
    writePackage(layout, '@openai/codex-win32-x64')
    writeCodexNative(
      path.join(layout.root, 'node_modules', '@openai', 'codex-win32-x64'),
      'x86_64-pc-windows-msvc',
      buildPe(),
    )

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

// O caso relatado em 15/11/2026 ("não é compatível com a versão do Windows"): o
// npm termina com sucesso, o package.json diz que a versão está instalada, mas o
// `bin/claude.exe` continua o placeholder de texto, porque o `postinstall` não
// rodou (`ignore-scripts=true` no .npmrc da pessoa) ou o pacote da plataforma não
// baixou. Antes, o Claude passava sem conferência nenhuma e nunca era reparado.
test('o Claude com o placeholder do npm no lugar do executável não conta como instalado', () => {
  const layout = createLayout()

  try {
    writeClaude(layout, NPM_PLACEHOLDER_STUB)

    const result = verifyManagedCliInstallation({
      providerId: 'claude',
      layout,
      platformName: 'win32',
      arch: 'x64',
    })

    assert.equal(result.ok, false)
    assert.equal(result.reason, 'stub')
    assert.match(result.message, /bin[\\/]claude\.exe/)
    assert.match(result.message, /provisório do npm/)
  } finally {
    fs.rmSync(layout.root, { recursive: true, force: true })
  }
})

test('o Claude com o executável cortado no meio da extração não conta como instalado', () => {
  const layout = createLayout()

  try {
    const complete = buildPe()
    writeClaude(layout, complete.subarray(0, complete.length / 2))

    const result = verifyManagedCliInstallation({
      providerId: 'claude',
      layout,
      platformName: 'win32',
      arch: 'x64',
    })

    assert.equal(result.ok, false)
    assert.equal(result.reason, 'truncado')
  } finally {
    fs.rmSync(layout.root, { recursive: true, force: true })
  }
})

test('o Claude com o executável inteiro do sistema passa', () => {
  const layout = createLayout()

  try {
    writeClaude(layout, buildPe())
    assert.equal(
      verifyManagedCliInstallation({ providerId: 'claude', layout, platformName: 'win32', arch: 'x64' }).ok,
      true,
    )

    writeClaude(layout, buildMachO({ arch: 'arm64' }))
    assert.equal(
      verifyManagedCliInstallation({ providerId: 'claude', layout, platformName: 'darwin', arch: 'arm64' }).ok,
      true,
    )
  } finally {
    fs.rmSync(layout.root, { recursive: true, force: true })
  }
})

test('o Codex com o pacote da plataforma mas sem o codex.exe inteiro não conta como instalado', () => {
  // Estado medido no prefixo gerenciado desta máquina em 15/11/2026: a extração
  // do pacote nativo parou com 68 de 80 MB de outro executável e sem o codex.exe.
  const layout = createLayout()
  const nativeDir = path.join(layout.root, 'node_modules', '@openai', 'codex-win32-x64')

  try {
    writePackage(layout, '@openai/codex-win32-x64')
    const missing = verifyManagedCliInstallation({ providerId: 'codex', layout, platformName: 'win32', arch: 'x64' })
    assert.equal(missing.ok, false)
    assert.equal(missing.reason, 'ausente')

    writeCodexNative(nativeDir, 'x86_64-pc-windows-msvc', buildPe().subarray(0, 0x300))
    const cut = verifyManagedCliInstallation({ providerId: 'codex', layout, platformName: 'win32', arch: 'x64' })
    assert.equal(cut.ok, false)
    assert.equal(cut.reason, 'truncado')
  } finally {
    fs.rmSync(layout.root, { recursive: true, force: true })
  }
})

test('no Linux e no macOS o Codex também precisa do executável nativo, em lib/node_modules', () => {
  const layout = { ...createLayout() }
  layout.nodeModules = path.join(layout.root, 'lib', 'node_modules')
  const nativeDir = path.join(layout.nodeModules, '@openai', 'codex', 'node_modules', '@openai', 'codex-linux-arm64')

  try {
    const missing = verifyManagedCliInstallation({ providerId: 'codex', layout, platformName: 'linux', arch: 'arm64' })
    assert.equal(missing.ok, false)
    assert.equal(missing.requiredPackage, '@openai/codex-linux-arm64')

    fs.mkdirSync(nativeDir, { recursive: true })
    fs.writeFileSync(path.join(nativeDir, 'package.json'), '{}')
    writeCodexNative(nativeDir, 'aarch64-unknown-linux-musl', buildElf({ arch: 'arm64' }), 'codex')
    assert.equal(
      verifyManagedCliInstallation({ providerId: 'codex', layout, platformName: 'linux', arch: 'arm64' }).ok,
      true,
    )
    assert.equal(
      verifyManagedCliInstallation({ providerId: 'codex', layout, platformName: 'darwin', arch: 'arm64' }).ok,
      false,
      'no macOS o pacote é outro (@openai/codex-darwin-arm64)',
    )
  } finally {
    fs.rmSync(layout.root, { recursive: true, force: true })
  }
})

test('a versão gerenciada é lida de layout.nodeModules, onde o npm global grava no POSIX', () => {
  const layout = { ...createLayout() }
  layout.nodeModules = path.join(layout.root, 'lib', 'node_modules')

  try {
    const packageDir = path.join(layout.nodeModules, '@google', 'gemini-cli')
    fs.mkdirSync(packageDir, { recursive: true })
    fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify({ version: '0.64.0' }))

    assert.equal(getManagedCliPackageVersion({ providerId: 'gemini', layout }), '0.64.0')
  } finally {
    fs.rmSync(layout.root, { recursive: true, force: true })
  }
})

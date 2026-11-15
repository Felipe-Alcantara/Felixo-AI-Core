'use strict'

/**
 * A instalação gerenciada de ponta a ponta, com o npm que vai dentro do app,
 * contra um registry local: nada sai da máquina e o teste roda igual no
 * Windows, no macOS e no Linux do CI (`npm run test:native`, que trava o Release).
 *
 * O pacote imita o `@anthropic-ai/claude-code`: `bin/claude.exe` publicado como
 * placeholder de texto, o binário de cada plataforma numa optionalDependency
 * (`os`/`cpu`) e um `postinstall` que copia o binário por cima do placeholder.
 * O "binário" é o próprio Node desta máquina, então `claude --version` responde
 * a versão do Node quando a instalação ficou certa.
 *
 * Guarda as quatro premissas do relato de 15/11/2026 ("não é compatível com a
 * versão do Windows") em cada SO:
 * 1. `ignore-scripts=true` na configuração da pessoa não deixa o placeholder;
 * 2. o pacote da plataforma que não baixa faz o npm dar sucesso com o
 *    placeholder, e a verificação recusa;
 * 3. reinstalar a mesma versão roda o `postinstall` de novo (o reparo);
 * 4. a versão e o executável são lidos onde o npm grava (`lib/node_modules` no POSIX).
 */

const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const zlib = require('node:zlib')
const { spawnSync } = require('node:child_process')

const { installManagedPackage } = require('./managed-cli-installer.cjs')
const {
  getManagedCliPackageVersion,
  verifyManagedCliInstallation,
} = require('./managed-cli-health.cjs')
const { getManagedCliLayout } = require('../core/managed-cli-paths.cjs')
const { resolveNpmCliPath } = require('../core/node-runtime.cjs')
const { NPM_PLACEHOLDER_STUB } = require('../__fixtures__/native-executables.cjs')

const MAIN = '@anthropic-ai/claude-code'
const VERSION = '1.0.0'
const HOST_NATIVE = `${MAIN}-${process.platform}-${process.arch}`
const PLATFORMS = ['win32', 'linux', 'darwin'].flatMap((os_) => ['x64', 'arm64'].map((cpu) => [os_, cpu]))

// O `install.cjs` real, reduzido ao que importa: acha o pacote da plataforma e
// copia o binário por cima do placeholder; sem o pacote, avisa e sai com 0.
const INSTALL_SCRIPT = `
const fs = require('fs')
const path = require('path')
const name = '${MAIN}-' + process.platform + '-' + process.arch
let dir
try {
  dir = path.dirname(require.resolve(name + '/package.json'))
} catch {
  console.error('Native package ' + name + ' not found')
  process.exit(0)
}
const dest = path.join(__dirname, 'bin', 'claude.exe')
fs.copyFileSync(path.join(dir, process.platform === 'win32' ? 'claude.exe' : 'claude'), dest)
fs.chmodSync(dest, 0o755)
`

function tarEntry(name, content, mode) {
  const header = Buffer.alloc(512)
  header.write(name, 0, 100, 'utf8')
  header.write(`${mode.toString(8).padStart(7, '0')}\0`, 100)
  header.write('0000000\0', 108)
  header.write('0000000\0', 116)
  header.write(`${content.length.toString(8).padStart(11, '0')}\0`, 124)
  header.write('00000000000\0', 136)
  header.write('        ', 148)
  header.write('0', 156)
  header.write('ustar\0', 257)
  header.write('00', 263)
  const checksum = header.reduce((sum, byte) => sum + byte, 0)
  header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148)
  return Buffer.concat([header, content, Buffer.alloc((512 - (content.length % 512)) % 512)])
}

function packTarball(files) {
  const entries = files.map(({ name, content, mode = 0o644 }) =>
    tarEntry(`package/${name}`, Buffer.isBuffer(content) ? content : Buffer.from(content), mode),
  )
  return zlib.gzipSync(Buffer.concat([...entries, Buffer.alloc(1024)]), { level: 1 })
}

function definePackages() {
  const nativeNames = PLATFORMS.map(([platform, cpu]) => `${MAIN}-${platform}-${cpu}`)
  const packages = new Map()
  packages.set(MAIN, () => ({
    manifest: {
      name: MAIN,
      version: VERSION,
      bin: { claude: 'bin/claude.exe' },
      scripts: { postinstall: 'node install.cjs' },
      optionalDependencies: Object.fromEntries(nativeNames.map((name) => [name, VERSION])),
    },
    files: [
      { name: 'bin/claude.exe', content: NPM_PLACEHOLDER_STUB, mode: 0o755 },
      { name: 'install.cjs', content: INSTALL_SCRIPT },
    ],
  }))
  for (const [platform, cpu] of PLATFORMS) {
    const name = `${MAIN}-${platform}-${cpu}`
    packages.set(name, () => ({
      manifest: { name, version: VERSION, os: [platform], cpu: [cpu] },
      files: [
        {
          name: platform === 'win32' ? 'claude.exe' : 'claude',
          // Só o da máquina chega a ser baixado; os outros o npm pula por `os`/`cpu`.
          content: name === HOST_NATIVE ? fs.readFileSync(process.execPath) : 'outra plataforma',
          mode: 0o755,
        },
      ],
    }))
  }
  return packages
}

async function startRegistry() {
  const definitions = definePackages()
  const built = new Map()
  const failing = new Set()
  const build = (name) => {
    if (!built.has(name)) {
      const { manifest, files } = definitions.get(name)()
      const tarball = packTarball([{ name: 'package.json', content: JSON.stringify(manifest) }, ...files])
      const integrity = `sha512-${crypto.createHash('sha512').update(tarball).digest('base64')}`
      built.set(name, { manifest, tarball, integrity })
    }
    return built.get(name)
  }

  const server = http.createServer((request, response) => {
    const url = decodeURIComponent(request.url.split('?')[0]).replace(/^\//, '')
    if (url.startsWith('-/tarball/')) {
      const name = url.slice('-/tarball/'.length).replace(/\.tgz$/, '')
      if (failing.has(name) || !definitions.has(name)) {
        response.writeHead(500)
        response.end()
        return
      }
      response.writeHead(200, { 'content-type': 'application/octet-stream' })
      response.end(build(name).tarball)
      return
    }
    if (!definitions.has(url)) {
      response.writeHead(404, { 'content-type': 'application/json' })
      response.end('{"error":"not found"}')
      return
    }
    const { manifest, integrity } = build(url)
    const base = `http://127.0.0.1:${server.address().port}`
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(
      JSON.stringify({
        name: url,
        'dist-tags': { latest: VERSION },
        versions: {
          [VERSION]: {
            ...manifest,
            dist: { tarball: `${base}/-/tarball/${encodeURIComponent(url)}.tgz`, integrity },
          },
        },
      }),
    )
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { url: `http://127.0.0.1:${server.address().port}/`, failing, close: () => server.close() }
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-npm-real-'))
const savedEnv = { ...process.env }
let registry

test.before(async () => {
  registry = await startRegistry()
  const userConfig = path.join(work, 'npmrc-usuario')
  const globalConfig = path.join(work, 'npmrc-global')
  fs.writeFileSync(userConfig, '')
  fs.writeFileSync(globalConfig, '')
  // O npm do teste não lê a configuração de quem roda a suíte (registry,
  // credencial) e não espera minutos repetindo o erro 500 de propósito.
  Object.assign(process.env, {
    npm_config_registry: registry.url,
    npm_config_userconfig: userConfig,
    npm_config_globalconfig: globalConfig,
    npm_config_fetch_retries: '0',
    npm_config_logs_max: '0',
  })
})

test.after(() => {
  registry?.close()
  for (const key of Object.keys(process.env)) {
    if (!(key in savedEnv)) delete process.env[key]
  }
  Object.assign(process.env, savedEnv)
  fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
})

function newLayout(name) {
  return getManagedCliLayout({ userData: path.join(work, name), env: {} })
}

async function install(layout) {
  fs.mkdirSync(layout.root, { recursive: true })
  return installManagedPackage({
    npmPackage: `${MAIN}@${VERSION}`,
    npmCliPath: resolveNpmCliPath(),
    nodeExecutable: process.execPath,
    layout,
    // Cache por cenário: com um só, o `--prefer-offline` pegava o binário já
    // baixado e o "pacote que não baixa" nunca chegava ao registry.
    cacheDir: path.join(layout.root, '..', 'npm-cache'),
    timeoutMs: 120000,
  })
}

/** Abre `claude --version` como o terminal abre: pelo atalho do npm, achado no PATH. */
function runClaude(layout) {
  if (process.platform === 'win32') {
    return spawnSync('cmd.exe', ['/d', '/s', '/c', 'claude --version'], {
      env: { ...process.env, PATH: `${layout.packagesBin};${process.env.PATH}` },
      encoding: 'utf8',
      timeout: 60000,
      windowsHide: true,
    })
  }
  return spawnSync(path.join(layout.packagesBin, 'claude'), ['--version'], { encoding: 'utf8', timeout: 60000 })
}

test(
  'com ignore-scripts=true na configuração da pessoa, a instalação gerenciada deixa um claude que abre',
  { timeout: 240000 },
  async () => {
    const layout = newLayout('ignore-scripts')
    process.env.npm_config_ignore_scripts = 'true'
    try {
      const result = await install(layout)
      assert.equal(result.ok, true, result.output)
    } finally {
      delete process.env.npm_config_ignore_scripts
    }

    const verification = verifyManagedCliInstallation({ providerId: 'claude', layout })
    assert.equal(verification.ok, true, verification.message)
    assert.equal(getManagedCliPackageVersion({ providerId: 'claude', layout }), VERSION)
    const run = runClaude(layout)
    assert.equal(run.status, 0, `${run.error ?? ''}${run.stderr}`)
    assert.equal(run.stdout.trim(), process.version)
  },
)

test(
  'o pacote da plataforma que não baixa deixa o placeholder com o npm dando sucesso; a verificação recusa e reinstalar repara',
  { timeout: 240000 },
  async () => {
    const layout = newLayout('nativo-falhou')
    registry.failing.add(HOST_NATIVE)
    let broken
    try {
      broken = await install(layout)
    } finally {
      registry.failing.delete(HOST_NATIVE)
    }

    // A premissa do bug: o npm trata a optionalDependency que falhou como opcional.
    assert.equal(broken.ok, true, broken.output)
    const verification = verifyManagedCliInstallation({ providerId: 'claude', layout })
    assert.equal(verification.ok, false)
    assert.equal(verification.reason, 'stub')
    const brokenRun = runClaude(layout)
    assert.notEqual(brokenRun.status, 0, 'o placeholder não pode responder como se fosse o Claude')

    // O reparo: a reinstalação explícita da mesma versão extrai e roda o `postinstall` de novo.
    const repaired = await install(layout)
    assert.equal(repaired.ok, true, repaired.output)
    assert.equal(verifyManagedCliInstallation({ providerId: 'claude', layout }).ok, true)
    const run = runClaude(layout)
    assert.equal(run.status, 0, `${run.error ?? ''}${run.stderr}`)
    assert.equal(run.stdout.trim(), process.version)
  },
)

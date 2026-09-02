const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { EventEmitter } = require('node:events')

const {
  createManagedInstallEnv,
  createNpmInstallArgs,
  installManagedPackage,
} = require('./managed-cli-installer.cjs')

const LAYOUT = {
  root: '/data/clis',
  packagesBin: '/data/clis/bin',
  runtimeBin: '/data/clis/runtime-bin',
}

function createFakeChild({ code = 0, stdout = '' } = {}) {
  const child = new EventEmitter()
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = () => {}

  setImmediate(() => {
    if (stdout) child.stdout.emit('data', stdout)
    child.emit('close', code)
  })

  return child
}

describe('managed-cli-installer', () => {
  it('installs into the app folder instead of the system global', () => {
    const args = createNpmInstallArgs({
      npmCliPath: '/opt/app/resources/npm/bin/npm-cli.js',
      npmPackage: '@anthropic-ai/claude-code',
      prefix: LAYOUT.root,
    })

    assert.equal(args[0], '/opt/app/resources/npm/bin/npm-cli.js')
    assert.deepEqual(args.slice(1, 5), ['install', '--global', '--prefix', '/data/clis'])
    assert.equal(args.at(-1), '@anthropic-ai/claude-code')
  })

  // O npm precisa de um `node` para rodar os scripts de instalacao dos
  // pacotes, e numa maquina sem Node o unico disponivel e o atalho do app —
  // por isso ele vem na frente aqui, ao contrario do PATH normal das CLIs.
  it('puts the app runtime first in the PATH while installing', () => {
    const env = createManagedInstallEnv({
      layout: LAYOUT,
      baseEnv: { PATH: '/usr/bin' },
      platformName: 'linux',
    })

    assert.equal(env.PATH.split(path.posix.delimiter)[0], LAYOUT.runtimeBin)
    assert.equal(env.ELECTRON_RUN_AS_NODE, '1')
  })

  // Um `.npmrc` com `prefix` configurado mandaria os pacotes para fora da
  // pasta do app, justamente onde eles poderiam sobrescrever a instalacao
  // que a pessoa ja tinha.
  // No Windows o npm precisa de um shell explicito para rodar os scripts de
  // instalacao (`.cmd`/`.bat` dos pacotes): sem isso alguns pacotes falham
  // silenciosamente porque o npm nao sabe qual shell usar para executa-los.
  it('sets npm_config_script_shell to cmd.exe on Windows', () => {
    const env = createManagedInstallEnv({
      layout: LAYOUT,
      baseEnv: { Path: 'C:\\Windows\\System32', ComSpec: 'C:\\Windows\\System32\\cmd.exe' },
      platformName: 'win32',
    })

    assert.equal(env.npm_config_script_shell, 'C:\\Windows\\System32\\cmd.exe')
  })

  it('does not set npm_config_script_shell outside Windows', () => {
    const env = createManagedInstallEnv({
      layout: LAYOUT,
      baseEnv: { PATH: '/usr/bin' },
      platformName: 'linux',
    })

    assert.equal(env.npm_config_script_shell, undefined)
  })

  // No Windows o PATH some do ambiente e vira `Path` (case-insensitive), e o
  // separador de entradas e `;`, nao `:` — um codigo que so soubesse ler
  // `PATH`/`:` deixaria a instalacao sem o node/npm do app na frente.
  it('prepends the runtime bin to Path using the Windows separator', () => {
    const env = createManagedInstallEnv({
      layout: LAYOUT,
      baseEnv: { Path: 'C:\\Windows\\System32;C:\\Windows' },
      platformName: 'win32',
    })

    assert.deepEqual(env.PATH.split(';').slice(0, 1), [LAYOUT.runtimeBin])
    assert.ok(env.PATH.includes('C:\\Windows\\System32'))
  })

  it('pins the prefix so user npm config cannot redirect the install', () => {
    const env = createManagedInstallEnv({
      layout: LAYOUT,
      baseEnv: { PATH: '/usr/bin' },
      platformName: 'linux',
    })

    assert.equal(env.npm_config_prefix, LAYOUT.root)
  })

  it('reports success when npm exits cleanly', async () => {
    const result = await installManagedPackage({
      npmPackage: '@google/gemini-cli',
      npmCliPath: '/npm/bin/npm-cli.js',
      nodeExecutable: '/opt/app/felixo',
      layout: LAYOUT,
      spawn: () => createFakeChild({ stdout: 'added 1 package' }),
    })

    assert.equal(result.ok, true)
    assert.match(result.message, /@google\/gemini-cli/)
    assert.equal(result.output, 'added 1 package')
  })

  it('turns a non-zero exit into a readable failure', async () => {
    const result = await installManagedPackage({
      npmPackage: '@google/gemini-cli',
      npmCliPath: '/npm/bin/npm-cli.js',
      nodeExecutable: '/opt/app/felixo',
      layout: LAYOUT,
      spawn: () => createFakeChild({ code: 1, stdout: 'ENOTFOUND registry' }),
    })

    assert.equal(result.ok, false)
    assert.match(result.message, /Nao foi possivel instalar/)
    assert.match(result.output, /ENOTFOUND/)
  })

  it('gives up after the timeout instead of hanging the setup forever', async () => {
    const killed = []
    const result = await installManagedPackage({
      npmPackage: '@openai/codex',
      npmCliPath: '/npm/bin/npm-cli.js',
      nodeExecutable: '/opt/app/felixo',
      layout: LAYOUT,
      timeoutMs: 5,
      spawn: () => {
        const child = new EventEmitter()
        child.stdout = new EventEmitter()
        child.stderr = new EventEmitter()
        child.kill = (signal) => killed.push(signal)
        return child
      },
    })

    assert.equal(result.ok, false)
    assert.match(result.message, /tempo limite/)
    assert.deepEqual(killed, ['SIGKILL'])
  })
})

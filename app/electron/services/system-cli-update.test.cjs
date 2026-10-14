'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { EventEmitter, once } = require('node:events')
const { spawn: spawnProcess } = require('node:child_process')
const crossSpawn = require('cross-spawn')

const {
  createSystemNpmEnv,
  installSystemNpmPackage,
  readSystemNpmInstall,
  resolveSystemNpmGlobalRoot,
} = require('./system-cli-update.cjs')

function fakeChild({ code = 0, stdout = '' } = {}) {
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

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

test('o npm do sistema não herda o prefixo que o app usa para a própria cópia', () => {
  const env = createSystemNpmEnv({ PATH: '/usr/bin', npm_config_prefix: '/app/clis', npm_config_global: 'true', ELECTRON_RUN_AS_NODE: '1' })

  assert.equal(env.PATH, '/usr/bin')
  assert.equal(env.npm_config_prefix, undefined)
  assert.equal(env.npm_config_global, undefined)
  assert.equal(env.ELECTRON_RUN_AS_NODE, undefined)
})

test('acha a pasta global do npm do sistema', async () => {
  const globalRoot = tempDir('felixo-npm-global-')
  const managedRoot = tempDir('felixo-clis-')
  const calls = []

  try {
    const root = await resolveSystemNpmGlobalRoot({
      managedRoot,
      spawn: (command, args) => {
        calls.push([command, ...args])
        return fakeChild({ stdout: `${globalRoot}\n` })
      },
    })

    assert.equal(root, globalRoot)
    assert.deepEqual(calls, [['npm', 'root', '--global']])
  } finally {
    fs.rmSync(globalRoot, { recursive: true, force: true })
    fs.rmSync(managedRoot, { recursive: true, force: true })
  }
})

test('a pasta do próprio app nunca conta como instalação do sistema', async () => {
  const managedRoot = tempDir('felixo-clis-')
  const inside = path.join(managedRoot, 'node_modules')
  fs.mkdirSync(inside)

  try {
    const root = await resolveSystemNpmGlobalRoot({
      managedRoot,
      spawn: () => fakeChild({ stdout: `${inside}\n` }),
    })
    assert.equal(root, null)
  } finally {
    fs.rmSync(managedRoot, { recursive: true, force: true })
  }
})

test('sem npm no sistema não há instalação do sistema', async () => {
  const root = await resolveSystemNpmGlobalRoot({
    managedRoot: tempDir('felixo-clis-'),
    spawn: () => fakeChild({ code: 1, stdout: "'npm' não é reconhecido" }),
  })
  assert.equal(root, null)
})

test('lê a versão instalada no npm global, e só quando o pacote está lá', () => {
  const globalRoot = tempDir('felixo-npm-global-')
  try {
    const packageDir = path.join(globalRoot, '@anthropic-ai', 'claude-code')
    fs.mkdirSync(packageDir, { recursive: true })
    fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify({ version: '2.1.287' }))

    assert.deepEqual(readSystemNpmInstall({ globalRoot, npmPackage: '@anthropic-ai/claude-code' }), {
      version: '2.1.287',
      packageDir,
    })
    assert.equal(readSystemNpmInstall({ globalRoot, npmPackage: '@openai/codex' }), null)
  } finally {
    fs.rmSync(globalRoot, { recursive: true, force: true })
  }
})

// Medido em 14/10/2026 com o Claude Code real: o `claude.exe --chrome-native-host`
// que o navegador mantém aberto não impede a troca. O npm renomeia a pasta antiga
// e instala a nova ao lado, com o executável antigo rodando. Por isso a rodada não
// espera a CLI fechar; este teste guarda essa premissa com um npm de verdade.
test(
  'no Windows, o npm do sistema atualiza o pacote com o executável dele rodando',
  { skip: process.platform !== 'win32' && 'só o Windows trava executável aberto', timeout: 120000 },
  async () => {
    const base = tempDir('felixo-npm-trava-')
    const prefix = path.join(base, 'prefixo')
    // Prefixo e cache do teste: o npm global de quem roda a suíte não é tocado.
    const env = { ...createSystemNpmEnv(), npm_config_prefix: prefix, npm_config_cache: path.join(base, 'cache') }
    const tarballs = ['1.0.0', '1.0.1'].map((version) => {
      const dir = path.join(base, `pacote-${version}`)
      fs.mkdirSync(path.join(dir, 'bin'), { recursive: true })
      fs.copyFileSync(path.join(process.env.SystemRoot, 'System32', 'PING.EXE'), path.join(dir, 'bin', 'ferramenta.exe'))
      fs.writeFileSync(
        path.join(dir, 'package.json'),
        JSON.stringify({ name: 'felixo-teste-trava', version, bin: { ferramenta: 'bin/ferramenta.exe' } }),
      )
      const packed = crossSpawn.sync('npm', ['pack', dir, '--pack-destination', base, '--loglevel=error'], {
        cwd: base,
        env,
        encoding: 'utf8',
      })
      assert.equal(packed.status, 0, packed.stderr)
      return path.join(base, `felixo-teste-trava-${version}.tgz`)
    })
    const globalRoot = path.join(prefix, 'node_modules')
    let aberto = null

    try {
      const primeira = await installSystemNpmPackage({ npmPackage: tarballs[0], cwd: base, env })
      assert.equal(primeira.ok, true, primeira.output)

      aberto = spawnProcess(path.join(globalRoot, 'felixo-teste-trava', 'bin', 'ferramenta.exe'), ['-n', '60', '127.0.0.1'], {
        stdio: 'ignore',
        windowsHide: true,
      })
      await once(aberto, 'spawn')

      const segunda = await installSystemNpmPackage({ npmPackage: tarballs[1], cwd: base, env })

      assert.deepEqual({ ok: segunda.ok, busy: segunda.busy }, { ok: true, busy: false }, segunda.output)
      assert.equal(readSystemNpmInstall({ globalRoot, npmPackage: 'felixo-teste-trava' }).version, '1.0.1')
      assert.equal(aberto.exitCode, null, 'o executável antigo deveria continuar rodando')
    } finally {
      if (aberto && aberto.exitCode === null) {
        aberto.kill()
        await once(aberto, 'exit')
      }
      fs.rmSync(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    }
  },
)

test('instala a versão exata no npm global e marca como passageira a falha de arquivo em uso', async () => {
  const calls = []
  const ok = await installSystemNpmPackage({
    npmPackage: '@anthropic-ai/claude-code@2.1.300',
    cwd: os.tmpdir(),
    spawn: (command, args) => {
      calls.push([command, ...args])
      return fakeChild({ stdout: 'changed 2 packages' })
    },
  })
  const busy = await installSystemNpmPackage({
    npmPackage: '@anthropic-ai/claude-code@2.1.300',
    cwd: os.tmpdir(),
    spawn: () => fakeChild({ code: 1, stdout: 'npm error code EBUSY\nresource busy or locked' }),
  })
  const denied = await installSystemNpmPackage({
    npmPackage: '@anthropic-ai/claude-code@2.1.300',
    cwd: os.tmpdir(),
    spawn: () => fakeChild({ code: 1, stdout: 'npm error code EACCES' }),
  })

  // `--prefer-online`: a versão acabou de vir do registry; o cache do npm não pode
  // responder com uma lista de versões de antes dela (ETARGET).
  assert.deepEqual(calls, [
    ['npm', 'install', '--global', '--prefer-online', '--no-audit', '--no-fund', '--loglevel=error', '@anthropic-ai/claude-code@2.1.300'],
  ])
  assert.equal(ok.ok, true)
  assert.deepEqual({ ok: busy.ok, busy: busy.busy }, { ok: false, busy: true })
  assert.deepEqual({ ok: denied.ok, busy: denied.busy }, { ok: false, busy: false })
})

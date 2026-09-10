'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  executarDevtools,
  formatState,
  parseArgs,
  profileLooksInUse,
  readState,
  requirePackagedExecutable,
} = require('./felixo-devtools.cjs')

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-devtools-test-'))
  const stateFile = path.join(root, 'state.json')
  let killed = []
  return {
    root,
    stateFile,
    killed,
    fs,
    kill(pid, signal) {
      if (signal === 0) return
      killed.push({ pid, signal })
    },
  }
}

test('interpreta as opções do DevTools sem transformar texto em flag', () => {
  assert.deepEqual(parseArgs(['launch', '--visible', '--port', '9223']), {
    command: 'launch', positional: [], options: { visible: true, realProfile: false, port: 9223, out: '', packaged: '' },
  })
  assert.deepEqual(parseArgs(['click-text', 'Abrir', 'agente']), {
    command: 'click-text', positional: ['Abrir', 'agente'], options: { visible: false, realProfile: false, port: null, out: '', packaged: '' },
  })
})

test('parseArgs reconhece --packaged com o mesmo formato de --port/--out', () => {
  assert.deepEqual(parseArgs(['launch', '--packaged', '/opt/Felixo AI Core/felixo-ai-core']), {
    command: 'launch',
    positional: [],
    options: { visible: false, realProfile: false, port: null, out: '', packaged: '/opt/Felixo AI Core/felixo-ai-core' },
  })
})

test('requirePackagedExecutable recusa um caminho que não existe, antes de tentar abrir', () => {
  const env = setup()
  assert.throws(
    () => requirePackagedExecutable(path.join(env.root, 'nao-existe'), env),
    /executável não encontrado/,
  )
})

test('requirePackagedExecutable aceita um caminho real', () => {
  const env = setup()
  const exe = path.join(env.root, 'felixo-ai-core')
  fs.writeFileSync(exe, '')
  assert.equal(requirePackagedExecutable(exe, env), exe)
})

test('launch --packaged sobe o binário real, sem Vite e sem VITE_DEV_SERVER_URL', async () => {
  const env = setup()
  const exe = path.join(env.root, 'felixo-ai-core')
  fs.writeFileSync(exe, '')
  let viteChamado = false
  const result = await executarDevtools(['launch', '--port', '9333', '--packaged', exe], {
    ...env,
    getAppPaths: () => ({ userData: path.join(env.root, 'real') }),
    probeVite: async () => {
      viteChamado = true
      return { status: 'felixo' }
    },
    appDir: env.root,
    spawn(command, args, options) {
      assert.equal(command, exe)
      assert.deepEqual(args, [])
      assert.equal('VITE_DEV_SERVER_URL' in options.env, false)
      assert.equal(options.env.FELIXO_DEVTOOLS_PORT, '9333')
      return { pid: 5555, unref() {} }
    },
    waitForCdp: async (port) => assert.equal(port, 9333),
  })
  assert.equal(result.codigo, 0)
  assert.equal(viteChamado, false)
  const state = readState(env)
  assert.equal(state.pid, 5555)
  assert.equal(state.packaged, exe)
  assert.match(formatState(state, true), /origem: empacotado/)
})

test('launch sem --packaged continua subindo da fonte, com origem "fonte (dev)"', async () => {
  const env = setup()
  const result = await executarDevtools(['launch', '--port', '9333'], {
    ...env,
    getAppPaths: () => ({ userData: path.join(env.root, 'real') }),
    probeVite: async () => ({ status: 'felixo' }),
    electronPath: 'electron-falso',
    appDir: env.root,
    spawn: () => ({ pid: 4321, unref() {} }),
    waitForCdp: async () => {},
  })
  assert.equal(result.codigo, 0)
  assert.match(result.saida, /Origem: fonte \(dev\)/)
  assert.equal(readState(env).packaged, null)
})

test('aceita --help diretamente depois de devtools', async () => {
  const result = await executarDevtools(['--help'])
  assert.equal(result.codigo, 0)
  assert.match(result.saida, /felixo devtools/)
})

test('recusa perfil real quando os arquivos de singleton indicam app em uso', async () => {
  const env = setup()
  const profile = path.join(env.root, 'real')
  fs.mkdirSync(profile)
  fs.writeFileSync(path.join(profile, 'SingletonLock'), '')
  const result = await executarDevtools(['launch', '--real-profile'], {
    ...env,
    getAppPaths: () => ({ userData: profile }),
  })
  assert.equal(result.codigo, 1)
  assert.match(result.erro, /em uso/)
  assert.equal(profileLooksInUse(profile), true)
})

test('launch cria perfil isolado, espera CDP e persiste apenas metadados da sessão', async () => {
  const env = setup()
  const result = await executarDevtools(['launch', '--port', '9333'], {
    ...env,
    getAppPaths: () => ({ userData: path.join(env.root, 'real') }),
    probeVite: async () => ({ status: 'felixo' }),
    electronPath: 'electron-falso',
    appDir: env.root,
    spawn(_command, _args, options) {
      assert.equal(options.env.FELIXO_DEVTOOLS_HEADLESS, '1')
      assert.equal(options.env.FELIXO_DEVTOOLS_PORT, '9333')
      return { pid: 4321, unref() {} }
    },
    waitForCdp: async (port) => assert.equal(port, 9333),
  })
  assert.equal(result.codigo, 0)
  const state = readState(env)
  assert.equal(state.pid, 4321)
  assert.equal(state.port, 9333)
  assert.equal(state.realProfile, false)
  assert.match(state.userData, /profile-/)
})

test('falha de CDP encerra a tentativa e descarta o perfil isolado', async () => {
  const env = setup()
  const result = await executarDevtools(['launch', '--port', '9333'], {
    ...env,
    getAppPaths: () => ({ userData: path.join(env.root, 'real') }),
    probeVite: async () => ({ status: 'felixo' }),
    electronPath: 'electron-falso',
    appDir: env.root,
    spawn: () => ({ pid: 4321, unref() {} }),
    waitForCdp: async () => { throw new Error('CDP indisponível') },
    platform: 'linux',
  })
  assert.equal(result.codigo, 1)
  assert.match(result.erro, /CDP indisponível/)
  assert.equal(readState(env), null)
  assert.deepEqual(env.killed, [{ pid: 4321, signal: 'SIGTERM' }])
  assert.deepEqual(fs.readdirSync(env.root), [])
})

test('quit só remove o perfil isolado que a própria sessão criou', async () => {
  const env = setup()
  const isolated = path.join(env.root, 'isolated')
  fs.mkdirSync(isolated)
  fs.writeFileSync(path.join(isolated, 'state'), 'ok')
  fs.writeFileSync(env.stateFile, JSON.stringify({ pid: 4321, port: 9333, userData: isolated, realProfile: false, createdAt: 'agora' }))
  const result = await executarDevtools(['quit'], { ...env, platform: 'linux' })
  assert.equal(result.codigo, 0)
  assert.equal(fs.existsSync(isolated), false)
  assert.equal(fs.existsSync(env.stateFile), false)
  assert.deepEqual(env.killed, [{ pid: 4321, signal: 'SIGTERM' }])
})

test('status informa sessão encerrada sem fingir que ela está utilizável', async () => {
  const env = setup()
  fs.writeFileSync(env.stateFile, JSON.stringify({ pid: 999, port: 9333, userData: '/tmp/x', realProfile: false, createdAt: 'agora' }))
  const result = await executarDevtools(['status'], { ...env, kill: () => { throw new Error('gone') } })
  assert.equal(result.codigo, 1)
  assert.match(result.saida, /encerrada/)
})

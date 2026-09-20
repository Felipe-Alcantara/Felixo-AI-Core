'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  captureHeapSnapshot,
  executarDevtools,
  formatState,
  metricsListToObject,
  parseArgs,
  profileLooksInUse,
  readState,
  requirePackagedExecutable,
  waitForCdp,
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
    command: 'launch', positional: [], options: { visible: true, realProfile: false, port: 9223, out: '', packaged: '', timeout: null },
  })
  assert.deepEqual(parseArgs(['click-text', 'Abrir', 'agente']), {
    command: 'click-text', positional: ['Abrir', 'agente'], options: { visible: false, realProfile: false, port: null, out: '', packaged: '', timeout: null },
  })
})

test('parseArgs reconhece --packaged com o mesmo formato de --port/--out', () => {
  assert.deepEqual(parseArgs(['launch', '--packaged', '/opt/Felixo AI Core/felixo-ai-core']), {
    command: 'launch',
    positional: [],
    options: { visible: false, realProfile: false, port: null, out: '', packaged: '/opt/Felixo AI Core/felixo-ai-core', timeout: null },
  })
})

test('parseArgs reconhece --timeout com o mesmo formato de --port', () => {
  assert.deepEqual(parseArgs(['launch', '--timeout', '60000']), {
    command: 'launch',
    positional: [],
    options: { visible: false, realProfile: false, port: null, out: '', packaged: '', timeout: 60000 },
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
  let spawnOptions
  const result = await executarDevtools(['launch', '--port', '9333'], {
    ...env,
    getAppPaths: () => ({ userData: path.join(env.root, 'real') }),
    probeVite: async () => ({ status: 'felixo' }),
    electronPath: 'electron-falso',
    appDir: env.root,
    spawn: (_command, _args, options) => {
      spawnOptions = options
      return { pid: 4321, unref() {} }
    },
    waitForCdp: async () => {},
  })
  assert.equal(result.codigo, 0)
  assert.match(result.saida, /Origem: fonte \(dev\)/)
  assert.equal(readState(env).packaged, null)
  assert.equal(spawnOptions.windowsHide, true)
})

test('launch --visible permite que a janela Electron seja mostrada no Windows', async () => {
  const env = setup()
  let spawnOptions
  const result = await executarDevtools(['launch', '--visible', '--port', '9333'], {
    ...env,
    getAppPaths: () => ({ userData: path.join(env.root, 'real') }),
    probeVite: async () => ({ status: 'felixo' }),
    electronPath: 'electron-falso',
    appDir: env.root,
    spawn: (_command, _args, options) => {
      spawnOptions = options
      return { pid: 4321, unref() {} }
    },
    waitForCdp: async () => {},
  })
  assert.equal(result.codigo, 0)
  assert.equal(spawnOptions.windowsHide, false)
  assert.equal(spawnOptions.env.FELIXO_DEVTOOLS_HEADLESS, '0')
})

test('aceita --help diretamente depois de devtools', async () => {
  const result = await executarDevtools(['--help'])
  assert.equal(result.codigo, 0)
  assert.match(result.saida, /felixo devtools/)
})

test('waitForCdp aborta uma porta ocupada que aceita a conexao mas nao responde', async () => {
  await assert.rejects(
    waitForCdp(9333, {
      timeoutMs: 50,
      fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('request aborted')), { once: true })
      }),
      sleep: async () => {},
    }),
    /Electron.*CDP/,
  )
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

test('relaunch remove perfil isolado encerrado e retoma Vite criado pela sessao anterior', async () => {
  const env = setup()
  const oldProfile = path.join(env.root, 'old-profile')
  fs.mkdirSync(oldProfile)
  fs.writeFileSync(path.join(oldProfile, 'lock'), 'old')
  fs.writeFileSync(env.stateFile, JSON.stringify({ pid: 0, port: 9333, userData: oldProfile, realProfile: false, vitePid: 6666, createdAt: 'agora' }))
  const result = await executarDevtools(['launch', '--port', '9333'], {
    ...env,
    platform: 'linux',
    sleep: async () => {},
    kill: () => {},
    getAppPaths: () => ({ userData: path.join(env.root, 'real') }),
    probeVite: async () => ({ status: 'felixo' }),
    electronPath: 'electron-falso',
    appDir: env.root,
    spawn: () => ({ pid: 8888, unref() {} }),
    waitForCdp: async () => {},
  })
  assert.equal(result.codigo, 0)
  assert.equal(fs.existsSync(oldProfile), false)
  assert.equal(readState(env).vitePid, 6666)
  await executarDevtools(['quit'], { ...env, platform: 'linux', sleep: async () => {} })
  assert.equal(fs.existsSync(env.stateFile), false)
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

test('metricsListToObject achata o formato {name,value}[] do CDP num objeto indexável por nome', () => {
  assert.deepEqual(
    metricsListToObject([{ name: 'JSHeapUsedSize', value: 123 }, { name: 'Nodes', value: 45 }]),
    { JSHeapUsedSize: 123, Nodes: 45 },
  )
  assert.deepEqual(metricsListToObject(undefined), {})
  assert.deepEqual(metricsListToObject([{ value: 1 }]), {})
})

test('captureHeapSnapshot concatena os chunks na ordem de chegada e grava o arquivo', async () => {
  const env = setup()
  const output = path.join(env.root, 'snapshots', 'baseline.heapsnapshot')
  const handlers = {}
  const fakeSession = {
    on(event, handler) { handlers[event] = handler },
    async send(method) {
      if (method === 'HeapProfiler.takeHeapSnapshot') {
        handlers['HeapProfiler.addHeapSnapshotChunk']({ chunk: '{"snapshot":' })
        handlers['HeapProfiler.addHeapSnapshotChunk']({ chunk: '{}}' })
      }
    },
    async detach() {},
  }
  const fakePage = {}
  const result = await captureHeapSnapshot(fakePage, output, { fs, newCDPSession: async () => fakeSession })
  assert.equal(result.arquivo, output)
  assert.equal(fs.readFileSync(output, 'utf8'), '{"snapshot":{}}')
})

function setupWithPage(page) {
  const env = setup()
  fs.writeFileSync(env.stateFile, JSON.stringify({ pid: 555, port: 9444, userData: '/tmp/x', realProfile: false, createdAt: 'agora' }))
  const browser = { contexts: () => [{ pages: () => [page] }], close: async () => {} }
  return {
    ...env,
    kill: () => {},
    playwright: { chromium: { connectOverCDP: async () => browser } },
  }
}

test('comando heap-snapshot grava um .heapsnapshot real via CDP', async () => {
  const output = path.join(os.tmpdir(), `felixo-devtools-heap-test-${Date.now()}.heapsnapshot`)
  const handlers = {}
  const fakeSession = {
    on(event, handler) { handlers[event] = handler },
    async send(method) {
      if (method === 'HeapProfiler.takeHeapSnapshot') handlers['HeapProfiler.addHeapSnapshotChunk']({ chunk: '{"ok":true}' })
    },
    async detach() {},
  }
  const page = { url: () => 'http://localhost/', context: () => ({ newCDPSession: async () => fakeSession }) }
  const env = setupWithPage(page)
  try {
    const result = await executarDevtools(['heap-snapshot', output], env)
    assert.equal(result.codigo, 0)
    assert.equal(fs.readFileSync(output, 'utf8'), '{"ok":true}')
  } finally {
    fs.rmSync(output, { force: true })
  }
})

test('comando metrics devolve o objeto achatado do Performance.getMetrics', async () => {
  const fakeSession = {
    on() {},
    async send(method) {
      if (method === 'Performance.getMetrics') return { metrics: [{ name: 'JSHeapUsedSize', value: 42 }] }
      return {}
    },
    async detach() {},
  }
  const page = { url: () => 'http://localhost/', context: () => ({ newCDPSession: async () => fakeSession }) }
  const env = setupWithPage(page)
  const result = await executarDevtools(['metrics'], env)
  assert.equal(result.codigo, 0)
  assert.deepEqual(JSON.parse(result.saida), { JSHeapUsedSize: 42 })
})

function launchDeps(env, extra = {}) {
  return {
    ...env,
    getAppPaths: () => ({ userData: path.join(env.root, 'real') }),
    probeVite: async () => ({ status: 'felixo' }),
    electronPath: 'electron-falso',
    appDir: env.root,
    ...extra,
  }
}

test('sem FELIXO_DEVTOOLS_DEBUG_LOG o Electron continua silencioso (stdio ignore)', async () => {
  const env = setup()
  let stdio
  const result = await executarDevtools(['launch', '--port', '9333'], launchDeps(env, {
    spawn: (_c, _a, options) => { stdio = options.stdio; return { pid: 4321, unref() {} } },
    waitForCdp: async () => {},
  }))
  assert.equal(result.codigo, 0)
  assert.equal(stdio, 'ignore')
})

test('com FELIXO_DEVTOOLS_DEBUG_LOG a saída do Electron vai para o arquivo e aparece no erro do launch', async () => {
  const env = setup()
  const log = path.join(env.root, 'electron.log')
  let stdio
  const result = await executarDevtools(['launch', '--port', '9333'], launchDeps(env, {
    env: { FELIXO_DEVTOOLS_DEBUG_LOG: log },
    spawn: (_c, _a, options) => {
      stdio = options.stdio
      fs.writeSync(options.stdio[2], 'FATAL: The SUID sandbox helper binary was found, but is not configured correctly.\n')
      return { pid: 4321, unref() {}, once() {} }
    },
    waitForCdp: async () => { throw new Error('O Electron não abriu CDP na porta 9333. fetch failed') },
  }))
  assert.equal(Array.isArray(stdio), true)
  assert.equal(stdio[0], 'ignore')
  assert.equal(stdio[1], stdio[2])
  assert.notEqual(result.codigo, 0)
  assert.match(result.erro, /fetch failed/)
  assert.match(result.erro, /SUID sandbox helper/)
  assert.match(result.erro, /seguia vivo, mas não abriu o CDP/)
})

test('o erro do launch diz quando o Electron MORREU ao subir (código e sinal), sem log ligado', async () => {
  const env = setup()
  let onExit
  const result = await executarDevtools(['launch', '--port', '9333'], launchDeps(env, {
    spawn: () => ({ pid: 4321, unref() {}, once: (_evento, fn) => { onExit = fn } }),
    waitForCdp: async () => {
      onExit(133, null)
      throw new Error('O Electron não abriu CDP na porta 9333. fetch failed')
    },
  }))
  assert.notEqual(result.codigo, 0)
  assert.match(result.erro, /ENCERROU antes de abrir o CDP \(código 133, sinal nenhum\)/)
  assert.doesNotMatch(result.erro, /Saída do Electron/)
})

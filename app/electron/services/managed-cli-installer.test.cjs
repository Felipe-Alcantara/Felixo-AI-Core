const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { EventEmitter } = require('node:events')

const {
  chooseNewestPublishedVersion,
  createManagedInstallEnv,
  createNpmInstallArgs,
  createNpmViewChannelsArgs,
  createNpmViewIntegrityArgs,
  installManagedPackage,
  resolveLatestManagedPackage,
  verifyManagedPackageIntegrity,
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

  // Fatia 2/5 e 4/5 de "cache offline por perfil": sem cacheDir, nada muda —
  // o comportamento de antes continua valendo pra quem não passa a opção.
  it('não usa cache offline quando cacheDir não é passado', () => {
    const args = createNpmInstallArgs({
      npmCliPath: '/opt/app/resources/npm/bin/npm-cli.js',
      npmPackage: '@anthropic-ai/claude-code',
      prefix: LAYOUT.root,
    })

    assert.ok(!args.includes('--cache'))
    assert.ok(!args.includes('--prefer-offline'))
  })

  it('aponta o npm pro cache offline do app quando cacheDir é passado', () => {
    const args = createNpmInstallArgs({
      npmCliPath: '/opt/app/resources/npm/bin/npm-cli.js',
      npmPackage: '@anthropic-ai/claude-code',
      prefix: LAYOUT.root,
      cacheDir: '/data/cli-cache/npm-registry-cache',
    })

    const cacheIndex = args.indexOf('--cache')
    assert.ok(cacheIndex !== -1)
    assert.equal(args[cacheIndex + 1], '/data/cli-cache/npm-registry-cache')
    assert.ok(args.includes('--prefer-offline'))
    // O cache vem antes do pacote-alvo, nunca depois — senão o npm o
    // interpretaria como argumento do próprio pacote.
    assert.ok(args.indexOf('--prefer-offline') < args.indexOf('@anthropic-ai/claude-code'))
  })

  // Fatia 3/5 de "cache offline por perfil": auditoria com teste, não
  // afirmação — confirma que o ambiente da instalação gerenciada (a mesma
  // que escreve no cache offline) nunca carrega nenhuma das variáveis de
  // credencial/login por conta que cli-account-profiles.cjs usa. Login vive
  // isolado num processo completamente separado (o próprio PTY da CLI,
  // depois de instalada) — a instalação nunca deveria nem ver essas chaves.
  it('o ambiente da instalação gerenciada nunca carrega credencial de conta', () => {
    const CHAVES_DE_CREDENCIAL = [
      'CODEX_HOME',
      'CLAUDE_CONFIG_DIR',
      'OPENROUTER_API_KEY',
      'FELIXO_REAL_HOME',
    ]

    const env = createManagedInstallEnv({
      layout: LAYOUT,
      baseEnv: {
        PATH: '/usr/bin',
        // Simula o processo principal já ter essas variáveis setadas por
        // outra sessão (cenário realista: terminais de contas diferentes
        // rodando ao mesmo tempo) — a instalação não deveria herdá-las.
        CODEX_HOME: '/home/pessoa/.config/felixo-ai-core/cli-profiles/codex/perfil-x',
        CLAUDE_CONFIG_DIR: '/home/pessoa/.config/felixo-ai-core/cli-profiles/claude/perfil-y',
        OPENROUTER_API_KEY: 'segredo-de-teste',
      },
      platformName: 'linux',
    })

    for (const chave of CHAVES_DE_CREDENCIAL) {
      assert.ok(
        !(chave in env),
        `env da instalação não deveria carregar ${chave}`,
      )
    }
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

  it('builds a plain "npm view dist.integrity" query, without touching disk', () => {
    const args = createNpmViewIntegrityArgs({
      npmCliPath: '/opt/app/resources/npm/bin/npm-cli.js',
      npmPackage: '@anthropic-ai/claude-code@2.1.263',
    })

    assert.deepEqual(args, [
      '/opt/app/resources/npm/bin/npm-cli.js',
      'view',
      '--prefer-online',
      '@anthropic-ai/claude-code@2.1.263',
      'dist.integrity',
    ])
  })

  it('consulta os canais online e o hash da versão mais nova entre eles', async () => {
    const integrity = 'sha512-NWZdi/kxyjv/8EUGFupziGU38YyleugZRM4JXgY5XFH7FUmaFA33NZS2Bmq0HPazf7S3jJQQWsZ/jAK9jsrV3Q=='
    const calls = []

    const result = await resolveLatestManagedPackage({
      npmPackage: '@anthropic-ai/claude-code',
      npmCliPath: '/npm/bin/npm-cli.js',
      nodeExecutable: '/opt/app/felixo',
      layout: LAYOUT,
      spawn: (command, args) => {
        calls.push(args)
        return createFakeChild({
          stdout: args.includes('dist-tags')
            ? JSON.stringify(CANAIS_CLAUDE)
            : `${integrity}\n`,
        })
      },
    })

    assert.deepEqual(calls, [
      createNpmViewChannelsArgs({ npmCliPath: '/npm/bin/npm-cli.js', npmPackage: '@anthropic-ai/claude-code' }),
      createNpmViewIntegrityArgs({ npmCliPath: '/npm/bin/npm-cli.js', npmPackage: '@anthropic-ai/claude-code@2.1.300' }),
    ])
    assert.deepEqual(
      { ok: result.ok, npmPackage: result.npmPackage, version: result.version, integrity: result.integrity },
      { ok: true, npmPackage: '@anthropic-ai/claude-code', version: '2.1.300', integrity },
    )
    assert.match(result.message, /canal next/)
  })

  it('falha legível quando o registry não devolve canal válido', async () => {
    const result = await resolveLatestManagedPackage({
      npmPackage: '@openai/codex',
      npmCliPath: '/npm/bin/npm-cli.js',
      nodeExecutable: '/opt/app/felixo',
      layout: LAYOUT,
      spawn: () => createFakeChild({ stdout: '{"latest":"não é versão"}' }),
    })

    assert.equal(result.ok, false)
    assert.match(result.message, /canais inválidos/)
  })

  it('falha legível quando o hash da versão escolhida não vem', async () => {
    const result = await resolveLatestManagedPackage({
      npmPackage: '@google/gemini-cli',
      npmCliPath: '/npm/bin/npm-cli.js',
      nodeExecutable: '/opt/app/felixo',
      layout: LAYOUT,
      spawn: (command, args) =>
        createFakeChild({ stdout: args.includes('dist-tags') ? JSON.stringify(CANAIS_GEMINI) : 'sem hash' }),
    })

    assert.equal(result.ok, false)
    assert.match(result.message, /hash/)
  })
})

// Canais reais medidos no registry em 14/10/2026 (o Codex resumido: ele publica
// também um canal por plataforma para cada versão).
const CANAIS_CLAUDE = { stable: '2.1.287', latest: '2.1.299', next: '2.1.300' }
const CANAIS_GEMINI = {
  false: '0.42.0-nightly.20260512.g11a9edc80',
  nightly: '0.65.0-nightly.20261014.g42c518220',
  preview: '0.65.0-preview.0',
  latest: '0.64.0',
  'staging-tmp': '0.65.0-nightly.20261014.g42c518220',
}
// Datas reais de publicação (registry, 14/10/2026). A 0.64.0 saiu depois da preview.
const DATAS_GEMINI = {
  '0.42.0-nightly.20260512.g11a9edc80': '2026-05-12T18:26:43.837Z',
  '0.64.0': '2026-10-13T20:48:24.183Z',
  '0.65.0-preview.0': '2026-10-13T20:31:28.212Z',
  '0.65.0-nightly.20261014.g42c518220': '2026-10-14T01:33:01.285Z',
}
const CANAIS_CODEX = {
  beta: '0.1.2505172116',
  native: '0.1.2505291658',
  latest: '0.162.1',
  'win32-x64': '0.162.1-win32-x64',
  alpha: '0.163.0-alpha.11',
  'alpha-win32-x64': '0.163.0-alpha.11-win32-x64',
  'alpha-linux-arm64': '0.163.0-alpha.11-linux-arm64',
  'release-0.162.0-alpha.17.2-alpha-darwin-arm64': '0.162.0-alpha.17.2-darwin-arm64',
}

describe('chooseNewestPublishedVersion', () => {
  it('pega o pré-lançamento mais novo do Claude (next)', () => {
    assert.deepEqual(chooseNewestPublishedVersion(CANAIS_CLAUDE), { version: '2.1.300', tag: 'next' })
  })

  it('pega a nightly do Gemini: dentro da maior versão principal vale a publicada por último', () => {
    assert.deepEqual(chooseNewestPublishedVersion(CANAIS_GEMINI, DATAS_GEMINI), {
      version: '0.65.0-nightly.20261014.g42c518220',
      tag: 'nightly',
    })
  })

  it('a escolha não depende da ordem em que o registry lista os canais', () => {
    const entradas = Object.entries(CANAIS_GEMINI)
    for (const ordem of [entradas, [...entradas].reverse(), [entradas[2], entradas[1], entradas[3], entradas[0], entradas[4]]]) {
      assert.deepEqual(chooseNewestPublishedVersion(Object.fromEntries(ordem), DATAS_GEMINI)?.version, '0.65.0-nightly.20261014.g42c518220')
    }
  })

  it('a estável publicada depois da preview não vence: a versão principal dela é menor', () => {
    const semNightly = { latest: '0.64.0', preview: '0.65.0-preview.0' }
    assert.deepEqual(chooseNewestPublishedVersion(semNightly, DATAS_GEMINI), {
      version: '0.65.0-preview.0',
      tag: 'preview',
    })
  })

  it('sem as datas vale o semver dentro da mesma versão principal', () => {
    assert.deepEqual(chooseNewestPublishedVersion(CANAIS_GEMINI), { version: '0.65.0-preview.0', tag: 'preview' })
  })

  it('pega o alpha do Codex e nunca um pacote de plataforma, mesmo que ele ordene acima', () => {
    assert.deepEqual(chooseNewestPublishedVersion(CANAIS_CODEX), { version: '0.163.0-alpha.11', tag: 'alpha' })
  })

  it('sem canal válido não inventa versão', () => {
    assert.equal(chooseNewestPublishedVersion({}), null)
    assert.equal(chooseNewestPublishedVersion({ latest: 'x' }), null)
    assert.equal(chooseNewestPublishedVersion(null), null)
  })

  it('confirms integrity when the registry hash matches the manifest', async () => {
    const result = await verifyManagedPackageIntegrity({
      npmPackage: '@google/gemini-cli@0.58.0',
      expectedIntegrity: 'sha512-abc==',
      npmCliPath: '/npm/bin/npm-cli.js',
      nodeExecutable: '/opt/app/felixo',
      env: {},
      cwd: LAYOUT.root,
      spawn: () => createFakeChild({ stdout: 'sha512-abc==\n' }),
    })

    assert.equal(result.ok, true)
    assert.equal(result.output, 'sha512-abc==')
  })

  it('refuses a diverging hash instead of trusting the registry blindly', async () => {
    const result = await verifyManagedPackageIntegrity({
      npmPackage: '@google/gemini-cli@0.58.0',
      expectedIntegrity: 'sha512-abc==',
      npmCliPath: '/npm/bin/npm-cli.js',
      nodeExecutable: '/opt/app/felixo',
      env: {},
      cwd: LAYOUT.root,
      spawn: () => createFakeChild({ stdout: 'sha512-outro==\n' }),
    })

    assert.equal(result.ok, false)
    assert.match(result.message, /divergiu do manifesto/)
    assert.equal(result.output, 'sha512-outro==')
  })

  it('never spawns npm install when the pinned hash diverges', async () => {
    const spawnCalls = []
    const spawn = (command, args) => {
      spawnCalls.push(args[1]) // 'view' ou 'install'
      return createFakeChild({ stdout: 'sha512-outro==\n' })
    }

    const result = await installManagedPackage({
      npmPackage: '@google/gemini-cli@0.58.0',
      expectedIntegrity: 'sha512-abc==',
      npmCliPath: '/npm/bin/npm-cli.js',
      nodeExecutable: '/opt/app/felixo',
      layout: LAYOUT,
      spawn,
    })

    assert.equal(result.ok, false)
    assert.deepEqual(spawnCalls, ['view'])
  })

  it('installs normally when the pinned hash matches, checking before installing', async () => {
    const spawnCalls = []
    const spawn = (command, args) => {
      const stdout = args[1] === 'view' ? 'sha512-abc==\n' : 'added 1 package'
      spawnCalls.push(args[1])
      return createFakeChild({ stdout })
    }

    const result = await installManagedPackage({
      npmPackage: '@google/gemini-cli@0.58.0',
      expectedIntegrity: 'sha512-abc==',
      npmCliPath: '/npm/bin/npm-cli.js',
      nodeExecutable: '/opt/app/felixo',
      layout: LAYOUT,
      spawn,
    })

    assert.equal(result.ok, true)
    assert.deepEqual(spawnCalls, ['view', 'install'])
  })

  it('skips the hash check for a package outside the manifest (no expectedIntegrity)', async () => {
    const spawnCalls = []
    const spawn = (command, args) => {
      spawnCalls.push(args[1])
      return createFakeChild({ stdout: 'added 1 package' })
    }

    const result = await installManagedPackage({
      npmPackage: '@google/gemini-cli',
      npmCliPath: '/npm/bin/npm-cli.js',
      nodeExecutable: '/opt/app/felixo',
      layout: LAYOUT,
      spawn,
    })

    assert.equal(result.ok, true)
    assert.deepEqual(spawnCalls, ['install'])
  })

  it('gives up after the timeout instead of hanging the setup forever, matando a ARVORE do processo (nao so o npm)', async () => {
    const killTreeCalls = []
    const result = await installManagedPackage({
      npmPackage: '@openai/codex',
      npmCliPath: '/npm/bin/npm-cli.js',
      nodeExecutable: '/opt/app/felixo',
      layout: LAYOUT,
      timeoutMs: 5,
      spawn: () => {
        const child = new EventEmitter()
        child.pid = 4242
        child.stdout = new EventEmitter()
        child.stderr = new EventEmitter()
        child.kill = () => assert.fail('o timeout deveria matar pela arvore (killTree), nao por child.kill direto')
        return child
      },
      killTree: async (options) => {
        killTreeCalls.push(options)
      },
    })

    assert.equal(result.ok, false)
    assert.match(result.message, /tempo limite/)
    assert.deepEqual(killTreeCalls, [{ pid: 4242, platformName: killTreeCalls[0]?.platformName }])
  })

  // Nasce com `detached: true` no POSIX: é o que torna o processo lider de um
  // grupo proprio, que `killProcessTree` consegue matar por inteiro (`process.kill(-pid)`).
  // No Windows isso nao importa — o `killProcessTree` la usa `taskkill /T`, que nao
  // depende de grupo de processo nenhum — entao o spawn continua sem `detached` la.
  it('spawna detached no POSIX para o kill de grupo alcancar os netos; nao no Windows', () => {
    for (const [platformName, esperado] of [['linux', true], ['darwin', true], ['win32', false]]) {
      let spawnOptions
      void installManagedPackage({
        npmPackage: '@openai/codex',
        npmCliPath: '/npm/bin/npm-cli.js',
        nodeExecutable: '/opt/app/felixo',
        layout: LAYOUT,
        platformName,
        spawn: (command, args, options) => {
          spawnOptions = options
          return createFakeChild({ stdout: 'ok' })
        },
      })

      assert.equal(spawnOptions.detached, esperado, `platformName=${platformName}`)
    }
  })

  it('a instalacao ja cancelada nem chega a nascer o processo', async () => {
    const controller = new AbortController()
    controller.abort()
    let spawnFoiChamado = false

    const result = await installManagedPackage({
      npmPackage: '@openai/codex',
      npmCliPath: '/npm/bin/npm-cli.js',
      nodeExecutable: '/opt/app/felixo',
      layout: LAYOUT,
      signal: controller.signal,
      spawn: () => {
        spawnFoiChamado = true
        return createFakeChild({ stdout: 'ok' })
      },
    })

    assert.equal(spawnFoiChamado, false)
    assert.equal(result.ok, false)
    assert.equal(result.cancelled, true)
    assert.match(result.message, /cancelada/)
  })

  it('cancelar no meio da instalacao mata a arvore do processo e devolve cancelled:true', async () => {
    const controller = new AbortController()
    const killTreeCalls = []

    const promessa = installManagedPackage({
      npmPackage: '@openai/codex',
      npmCliPath: '/npm/bin/npm-cli.js',
      nodeExecutable: '/opt/app/felixo',
      layout: LAYOUT,
      signal: controller.signal,
      spawn: () => {
        const child = new EventEmitter()
        child.pid = 9911
        child.stdout = new EventEmitter()
        child.stderr = new EventEmitter()
        child.kill = () => assert.fail('cancelamento deveria matar pela arvore (killTree)')
        return child
      },
      killTree: async (options) => {
        killTreeCalls.push(options)
      },
    })

    controller.abort()
    const result = await promessa

    assert.equal(result.ok, false)
    assert.equal(result.cancelled, true)
    assert.match(result.message, /cancelada/)
    assert.deepEqual(killTreeCalls.map((call) => call.pid), [9911])
  })

  it('cancelar DEPOIS que a instalacao ja terminou nao muda o resultado (nao ha corrida)', async () => {
    const controller = new AbortController()
    const killTreeCalls = []

    const result = await installManagedPackage({
      npmPackage: '@openai/codex',
      npmCliPath: '/npm/bin/npm-cli.js',
      nodeExecutable: '/opt/app/felixo',
      layout: LAYOUT,
      signal: controller.signal,
      spawn: () => createFakeChild({ stdout: 'added 1 package' }),
      killTree: async (options) => {
        killTreeCalls.push(options)
      },
    })

    controller.abort() // depois do close: o listener de abort já foi removido

    assert.equal(result.ok, true)
    assert.deepEqual(killTreeCalls, [])
  })
})

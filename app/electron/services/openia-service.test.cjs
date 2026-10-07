const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')

// O serviço roda no processo principal do Electron; o teste injeta apenas o
// pequeno contrato de ipcMain para poder verificar a ponte sem abrir uma janela.
const handlers = new Map()
const originalLoad = Module._load
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') {
    return { ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) } }
  }
  return originalLoad.call(this, request, parent, isMain)
}
const {
  createOpeniaService,
  registerOpeniaIpcHandlers,
  resolveOpeniaSpawn,
  runOpeniaCommand,
} = require('./openia-service.cjs')
Module._load = originalLoad

test('lista interfaces pelo contrato JSON e remove campos não públicos', async () => {
  const chamadas = []
  const service = createOpeniaService({
    runCommand: async (args, options) => {
      chamadas.push({ args, options })
      return {
        ok: true,
        stdout: JSON.stringify({
          interfaces: [
            {
              key: 'orchat',
              name: 'OrChat',
              description: 'chat',
              ecosystem: 'python',
              command: 'orchat',
              homepage: 'https://example.com',
              modelPrefix: '',
              supportsModelSelection: true,
              modelSelection: 'automatic',
              env_keys: ['OPENROUTER_API_KEY'],
              apiKey: 'sk-nunca-deve-sair',
            },
            { key: '', name: 'invalida' },
          ],
        }),
      }
    },
  })

  const result = await service.listInterfaces()

  assert.equal(result.ok, true)
  assert.deepEqual(chamadas[0].args, ['list', '--json'])
  assert.deepEqual(result.interfaces, [{
    key: 'orchat',
    name: 'OrChat',
    description: 'chat',
    ecosystem: 'python',
    command: 'orchat',
    homepage: 'https://example.com',
    modelPrefix: '',
    supportsModelSelection: true,
    modelSelection: 'automatic',
    supportsSubscription: false,
    isCodeAgent: false,
    emoji: '',
  }])
  assert.equal(JSON.stringify(result).includes('sk-nunca'), false)
})

test('lista modelos e encaminha refresh sem aceitar payload arbitrário', async () => {
  let chamada
  const service = createOpeniaService({
    runCommand: async (args, options) => {
      chamada = { args, options }
      return {
        ok: true,
        stdout: JSON.stringify({
          models: [{
            id: 'anthropic/claude-sonnet-4',
            vendor: 'anthropic',
            name: 'Claude Sonnet 4',
            completionPrice: '0.000015',
            secret: 'ignorar',
          }],
        }),
      }
    },
  })

  const result = await service.listModels({ refresh: true })

  assert.equal(result.ok, true)
  assert.deepEqual(chamada.args, ['models', '--json', '--refresh'])
  assert.deepEqual(result.models, [{
    id: 'anthropic/claude-sonnet-4',
    vendor: 'anthropic',
    name: 'Claude Sonnet 4',
    completionPrice: 0.000015,
  }])
  assert.equal(JSON.stringify(result).includes('ignorar'), false)
})

test('envia a chave apenas por stdin e nunca devolve a saída do processo', async () => {
  const chave = 'sk-or-v1-chave-descartavel-de-teste'
  let chamada
  const service = createOpeniaService({
    runCommand: async (args, options) => {
      chamada = { args, options }
      return { ok: true, stdout: chave, stderr: `eco: ${chave}` }
    },
  })

  const result = await service.setKey({ name: 'felixo', key: `  ${chave}  ` })

  assert.deepEqual(chamada.args, ['key', 'set-stdin', 'felixo', '--json'])
  assert.equal(chamada.options.input, chave)
  assert.deepEqual(result, { ok: true, configured: true })
  assert.equal(JSON.stringify(result).includes(chave), false)
})

test('registra somente os quatro canais da ponte Openia', async () => {
  const calls = []
  registerOpeniaIpcHandlers({
    service: {
      listInterfaces: async () => ({ ok: true, interfaces: [] }),
      listModels: async (params) => {
        calls.push(['models', params])
        return { ok: true, models: [] }
      },
      keyStatus: async () => ({ ok: true, configured: false }),
      setKey: async (params) => {
        calls.push(['key', params])
        return { ok: true, configured: true }
      },
    },
  })

  assert.deepEqual(
    [...handlers.keys()].filter((channel) => channel.startsWith('openia:')).sort(),
    ['openia:key-status', 'openia:list-interfaces', 'openia:list-models', 'openia:set-key'],
  )
  await handlers.get('openia:list-models')({}, { refresh: true })
  await handlers.get('openia:set-key')({}, { name: 'felixo', key: 'segredo' })
  assert.deepEqual(calls, [
    ['models', { refresh: true }],
    ['key', { name: 'felixo', key: 'segredo' }],
  ])
})

// Aliases do Openia no Windows, medidos em 07/10/2026 com `list --json`:
// `openia.cmd` numa pasta com espaço falhava (o `shell: true` repassava o
// caminho sem aspas ao `cmd.exe`) e `openia.ps1` nunca rodava. Agora o `.cmd`
// vai direto pelo `cross-spawn`, que cita o caminho, e o `.ps1` pelo PowerShell.
test('resolveOpeniaSpawn roda o alias .ps1 pelo PowerShell e o .cmd sem shell', () => {
  const powerShell = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
  const env = { PATH: 'C:\\x', SystemRoot: 'C:\\Windows' }

  const ps1 = resolveOpeniaSpawn({
    platformName: 'win32',
    env,
    resolvePath: () => 'C:\\Users\\Pessoa Teste\\openia.ps1',
    exists: (candidate) => candidate === powerShell,
  })
  assert.equal(ps1.executable, powerShell)
  assert.equal(ps1.needsShell, false)
  assert.deepEqual(ps1.prefixArgs, [
    '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-NonInteractive',
    '-File', 'C:\\Users\\Pessoa Teste\\openia.ps1',
  ])

  const cmd = resolveOpeniaSpawn({
    platformName: 'win32',
    env,
    resolvePath: () => 'C:\\Users\\Pessoa Teste\\openia.cmd',
  })
  assert.equal(cmd.executable, 'C:\\Users\\Pessoa Teste\\openia.cmd')
  assert.equal(cmd.needsShell, false)
  assert.deepEqual(cmd.prefixArgs, [])
})

test('list --json roda de verdade pelos aliases .cmd (pasta com espaço) e .ps1', { skip: process.platform !== 'win32' }, async () => {
  const fs = require('node:fs')
  const os = require('node:os')
  const path = require('node:path')
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo openia '))
  try {
    // O falso repassa argv a um script Node, como o launcher real repassa ao
    // Python: assim o teste mede o caminho do spawn, não a leitura de `%1`.
    const falso = path.join(raiz, 'falso-openia.js')
    fs.writeFileSync(
      falso,
      "const a = process.argv.slice(2)\n" +
        "if (a[0] === 'list' && a.includes('--json')) console.log(JSON.stringify({ interfaces: [{ key: 'llm', name: 'LLM' }] }))\n" +
        "else { console.error(JSON.stringify(a)); process.exit(2) }\n",
      'utf8',
    )
    const pastaCmd = path.join(raiz, 'com espaço cmd')
    const pastaPs1 = path.join(raiz, 'com espaço ps1')
    fs.mkdirSync(pastaCmd)
    fs.mkdirSync(pastaPs1)
    fs.writeFileSync(path.join(pastaCmd, 'openia.cmd'), `@echo off\r\n"${process.execPath}" "${falso}" %*\r\n`, 'utf8')
    fs.writeFileSync(
      path.join(pastaPs1, 'openia.ps1'),
      `& "${process.execPath}" "${falso}" @args\r\nexit $LASTEXITCODE\r\n`,
      'utf8',
    )

    for (const pasta of [pastaCmd, pastaPs1]) {
      const env = { ...process.env, PATH: [pasta, path.join(process.env.SystemRoot || 'C:\\Windows', 'System32')].join(';') }
      const service = createOpeniaService({
        runCommand: (args, options) =>
          runOpeniaCommand(args, { ...options, resolveSpawn: () => resolveOpeniaSpawn({ platformName: 'win32', env }) }),
      })

      const result = await service.listInterfaces()

      assert.equal(result.ok, true, `list --json falhou pelo alias de ${path.basename(pasta)}`)
      assert.deepEqual(result.interfaces.map((item) => item.key), ['llm'])
    }
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true })
  }
})

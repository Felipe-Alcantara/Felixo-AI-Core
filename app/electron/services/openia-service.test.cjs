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

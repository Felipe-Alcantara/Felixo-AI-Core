const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const Module = require('node:module')
const originalLoad = Module._load
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') {
    return { shell: { openExternal: async () => {} }, ipcMain: { handle: () => {} } }
  }
  return originalLoad.call(this, request, parent, isMain)
}
const {
  BROWSER_OPEN_CHANNEL,
  BROWSER_REQUESTS_CHANNEL,
  registerAgentBrowserIpcHandlers,
} = require('./agent-browser-ipc-handlers.cjs')
Module._load = originalLoad

function appPaths() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-agent-browser-'))
  return { root, agentRequests: path.join(root, 'agent-requests') }
}

function janelaFalsa(events) {
  return {
    isDestroyed: () => false,
    webContents: {
      isDestroyed: () => false,
      isLoadingMainFrame: () => false,
      send: (channel, data) => events.push({ channel, data }),
    },
  }
}

/** Monta o controlador num diretório temporário e garante a limpeza. */
async function comControlador(options, run) {
  const paths = appPaths()
  const events = []
  const opened = []
  const handlers = new Map()
  const controller = registerAgentBrowserIpcHandlers(
    options.semJanela ? () => undefined : () => janelaFalsa(events),
    paths,
    {
      openExternal: async (url) => {
        if (options.falharAoAbrir) throw new Error('navegador indisponível')
        opened.push(url)
      },
      ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
      ...(options.findProfileByName ? { findProfileByName: options.findProfileByName } : {}),
    },
  )
  try {
    await run({ controller, events, opened, handlers, paths })
  } finally {
    controller.pararDeObservarPedidos()
    fs.rmSync(paths.root, { recursive: true, force: true })
  }
}

const aberturas = (events) => events.filter((event) => event.channel === BROWSER_OPEN_CHANNEL)

test('pedido válido NÃO abre sozinho: fica pendente e aparece para a pessoa', async () => {
  await comControlador({}, async ({ controller, events, opened }) => {
    const pedido = controller.pedidos.registrar('abrir-pagina', { url: 'https://Example.com', origem: '/projeto' })
    controller.processPending()

    assert.deepEqual(opened, [])
    assert.deepEqual(aberturas(events), [])
    assert.equal(controller.pedidos.ler(pedido.id).estado, 'pendente')
    assert.deepEqual(controller.listRequests(), [
      {
        id: pedido.id,
        url: 'https://example.com/',
        modo: 'externo',
        origem: '/projeto',
        pedidoEm: pedido.pedidoEm,
      },
    ])
    // A interface é avisada da fila, com a URL já serializada.
    const aviso = events.findLast((event) => event.channel === BROWSER_REQUESTS_CHANNEL)
    assert.equal(aviso.data.requests[0].url, 'https://example.com/')
  })
})

test('a pessoa escolhe o navegador: abre a URL do pedido gravado, pela política', async () => {
  await comControlador({}, async ({ controller, opened }) => {
    const pedido = controller.pedidos.registrar('abrir-pagina', { url: 'https://example.com/a', modo: 'embutido' })
    controller.processPending()

    const result = await controller.decide({ id: pedido.id, destino: 'externo' })

    assert.deepEqual(opened, ['https://example.com/a'])
    const resolvido = controller.pedidos.ler(pedido.id)
    assert.equal(result.resolved.estado, 'aceito')
    assert.equal(resolvido.resultado.modo, 'externo')
    // O agente sugeriu a Página Web; a resposta diz o que ele pediu e o que a pessoa escolheu.
    assert.equal(resolvido.resultado.modoPedido, 'embutido')
  })
})

test('a pessoa escolhe a Página Web: o renderer recebe o bloco e o pedido é aceito', async () => {
  await comControlador({}, async ({ controller, events, opened }) => {
    const pedido = controller.pedidos.registrar('abrir-pagina', { url: 'http://localhost:4173' })
    controller.processPending()

    await controller.decide({ id: pedido.id, destino: 'embutido' })

    assert.deepEqual(opened, [])
    assert.deepEqual(aberturas(events), [
      { channel: BROWSER_OPEN_CHANNEL, data: { requestId: pedido.id, url: 'http://localhost:4173/' } },
    ])
    const resolvido = controller.pedidos.ler(pedido.id)
    assert.equal(resolvido.estado, 'aceito')
    assert.equal(resolvido.resultado.modo, 'embutido')
    assert.equal(resolvido.resultado.modoPedido, 'externo')
  })
})

test('recusar resolve o pedido sem abrir nada, e o agente fica sabendo', async () => {
  await comControlador({}, async ({ controller, events, opened }) => {
    const pedido = controller.pedidos.registrar('abrir-pagina', { url: 'https://example.com' })
    controller.processPending()

    await controller.decide({ id: pedido.id, destino: null })

    assert.deepEqual(opened, [])
    assert.deepEqual(aberturas(events), [])
    const resolvido = controller.pedidos.ler(pedido.id)
    assert.equal(resolvido.estado, 'recusado')
    assert.match(resolvido.resultado.message, /recusou/)
    assert.deepEqual(controller.listRequests(), [])
  })
})

test('o renderer nunca escolhe o endereço: a URL aberta é relida do pedido', async () => {
  await comControlador({}, async ({ controller, opened }) => {
    const pedido = controller.pedidos.registrar('abrir-pagina', { url: 'https://example.com' })
    controller.processPending()

    await controller.decide({ id: pedido.id, destino: 'externo', url: 'https://evil.example/' })

    assert.deepEqual(opened, ['https://example.com/'])
  })
})

test('decidir de novo, id desconhecido ou destino inventado não fazem nada', async () => {
  await comControlador({}, async ({ controller, opened }) => {
    const pedido = controller.pedidos.registrar('abrir-pagina', { url: 'https://example.com' })
    controller.processPending()
    await controller.decide({ id: pedido.id, destino: 'externo' })

    assert.equal((await controller.decide({ id: pedido.id, destino: 'externo' })).resolved, null)
    assert.equal((await controller.decide({ id: 'nao-existe', destino: 'externo' })).resolved, null)

    const outro = controller.pedidos.registrar('abrir-pagina', { url: 'https://example.com/b' })
    const invalido = await controller.decide({ id: outro.id, destino: 'shell' })
    assert.equal(invalido.resolved, null)
    assert.equal(controller.pedidos.ler(outro.id).estado, 'pendente')
    assert.deepEqual(opened, ['https://example.com/'])
  })
})

test('pedido de outra intenção (Fetch All, pergunta) não é decidido por aqui', async () => {
  await comControlador({}, async ({ controller }) => {
    const fetchAll = controller.pedidos.registrar('executar-plano')
    controller.processPending()

    assert.equal((await controller.decide({ id: fetchAll.id, destino: 'externo' })).resolved, null)
    assert.equal(controller.pedidos.ler(fetchAll.id).estado, 'pendente')
    assert.deepEqual(controller.listRequests(), [])
  })
})

test('navegador que recusa abrir: o pedido sai recusado com o motivo', async () => {
  await comControlador({ falharAoAbrir: true }, async ({ controller }) => {
    const pedido = controller.pedidos.registrar('abrir-pagina', { url: 'https://example.com' })
    controller.processPending()

    await controller.decide({ id: pedido.id, destino: 'externo' })

    const resolvido = controller.pedidos.ler(pedido.id)
    assert.equal(resolvido.estado, 'recusado')
    assert.match(resolvido.resultado.message, /navegador indisponível/)
  })
})

test('Página Web sem janela pronta: falha explicada e o pedido continua esperando', async () => {
  await comControlador({ semJanela: true }, async ({ controller, handlers }) => {
    const pedido = controller.pedidos.registrar('abrir-pagina', { url: 'https://example.com' })
    controller.processPending()

    const result = await handlers.get('agent-browser:decide')({}, { id: pedido.id, destino: 'embutido' })

    assert.equal(result.ok, false)
    assert.match(result.message, /janela/)
    assert.equal(controller.pedidos.ler(pedido.id).estado, 'pendente')
  })
})

test('os canais do IPC listam e decidem pelo mesmo controlador', async () => {
  await comControlador({}, async ({ controller, handlers, opened }) => {
    const pedido = controller.pedidos.registrar('abrir-pagina', { url: 'https://example.com' })
    controller.processPending()

    const lista = await handlers.get('agent-browser:list-requests')()
    assert.equal(lista.ok, true)
    assert.deepEqual(lista.requests.map((item) => item.id), [pedido.id])

    const decisao = await handlers.get('agent-browser:decide')({}, { id: pedido.id, destino: 'externo' })
    assert.equal(decisao.ok, true)
    assert.deepEqual(opened, ['https://example.com/'])
  })
})

test('URL fora da web é recusada na hora: não há o que perguntar', async () => {
  await comControlador({}, async ({ controller, paths, opened }) => {
    // O CLI já recusa, mas um arquivo escrito à mão na pasta chega até aqui.
    const id = 'pedido-a-mao'
    fs.mkdirSync(paths.agentRequests, { recursive: true })
    fs.writeFileSync(
      path.join(paths.agentRequests, `${id}.json`),
      JSON.stringify({
        id,
        acao: 'abrir-pagina',
        url: 'file:///etc/passwd',
        modo: 'externo',
        estado: 'pendente',
        pedidoEm: new Date().toISOString(),
        origem: '',
      }),
    )
    controller.processPending()

    const resolvido = controller.pedidos.ler(id)
    assert.equal(resolvido.estado, 'recusado')
    assert.match(resolvido.resultado.message, /http/)
    assert.deepEqual(controller.listRequests(), [])
    assert.deepEqual(opened, [])
  })
})

test('perfil inexistente FALHA na hora em vez de cair no Padrão (que abriria numa sessão logada não escolhida)', async () => {
  await comControlador({ findProfileByName: () => null }, async ({ controller, events }) => {
    const pedido = controller.pedidos.registrar('abrir-pagina', {
      url: 'https://example.com', modo: 'embutido', perfil: 'Fantasma',
    })
    controller.processPending()

    assert.deepEqual(aberturas(events), [])
    const resolvido = controller.pedidos.ler(pedido.id)
    assert.equal(resolvido.estado, 'recusado')
    assert.match(resolvido.resultado.message, /"Fantasma" nao existe/)
    assert.deepEqual(controller.listRequests(), [])
  })
})

test('perfil pedido pelo nome chega ao bloco com o id resolvido, quando a pessoa escolhe a Página Web', async () => {
  await comControlador(
    { findProfileByName: (nome) => (nome.toLowerCase() === 'trabalho' ? { id: 'trabalho-ab12', name: 'Trabalho' } : null) },
    async ({ controller, events }) => {
      const pedido = controller.pedidos.registrar('abrir-pagina', {
        url: 'https://example.com', modo: 'embutido', perfil: 'Trabalho',
      })
      controller.processPending()
      assert.deepEqual(controller.listRequests().map((item) => item.perfil), ['Trabalho'])

      await controller.decide({ id: pedido.id, destino: 'embutido' })

      assert.deepEqual(aberturas(events)[0].data, {
        requestId: pedido.id,
        url: 'https://example.com/',
        profileId: 'trabalho-ab12',
      })
      assert.equal(controller.pedidos.ler(pedido.id).resultado.profileId, 'trabalho-ab12')
    },
  )
})

test('"Padrão" pedido pelo nome vira o perfil default, sem consultar o banco', async () => {
  await comControlador(
    { findProfileByName: () => { throw new Error('não devia consultar') } },
    async ({ controller, events }) => {
      const pedido = controller.pedidos.registrar('abrir-pagina', {
        url: 'https://example.com', modo: 'embutido', perfil: 'Padrão',
      })
      controller.processPending()
      await controller.decide({ id: pedido.id, destino: 'embutido' })
      assert.equal(aberturas(events)[0].data.profileId, 'default')
    },
  )
})

test('sem perfil no pedido o evento não traz profileId (comportamento de sempre)', async () => {
  await comControlador({}, async ({ controller, events }) => {
    const pedido = controller.pedidos.registrar('abrir-pagina', { url: 'https://example.com', modo: 'embutido' })
    controller.processPending()
    await controller.decide({ id: pedido.id, destino: 'embutido' })
    assert.equal('profileId' in aberturas(events)[0].data, false)
  })
})

test('contrato: o preload expõe listar, decidir e ouvir, e o vite-env.d.ts declara a ponte', () => {
  const preload = fs.readFileSync(path.join(__dirname, '../preload.cjs'), 'utf8')
  assert.match(preload, /listBrowserRequests: \(\) => ipcRenderer\.invoke\('agent-browser:list-requests'\)/)
  assert.match(preload, /decideBrowserRequest: \(params\) => ipcRenderer\.invoke\('agent-browser:decide', params\)/)
  assert.match(preload, new RegExp(`ipcRenderer\\.on\\('${BROWSER_REQUESTS_CHANNEL}', handler\\)`))
  const types = fs.readFileSync(path.join(__dirname, '../../src/vite-env.d.ts'), 'utf8')
  assert.match(types, /listBrowserRequests: \(\) => Promise</)
  assert.match(types, /decideBrowserRequest: \(params: \{/)
  assert.match(types, /onBrowserRequests: \(/)
})

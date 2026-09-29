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
const { VALIDADE_MS, criarRepositorioDePedidos } = require('./fetch-all/agent-requests.cjs')

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
  const avisos = []
  const handlers = new Map()
  // Arquivos que já estão na pasta quando o app sobe (o registro os processa).
  if (options.preparar) {
    fs.mkdirSync(paths.agentRequests, { recursive: true })
    options.preparar(paths.agentRequests)
  }
  const controller = registerAgentBrowserIpcHandlers(
    options.semJanela ? () => undefined : () => janelaFalsa(events),
    paths,
    {
      openExternal: async (url) => {
        const falhar = typeof options.falharAoAbrir === 'function' ? options.falharAoAbrir() : options.falharAoAbrir
        if (falhar) throw new Error('navegador indisponível')
        opened.push(url)
      },
      ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
      logger: { warn: (message) => avisos.push(message) },
      ...(options.findProfileByName ? { findProfileByName: options.findProfileByName } : {}),
      ...(options.relogio ? { agora: options.relogio.agora, timers: options.relogio.timers } : {}),
      ...(options.observeRequests ? { observeRequests: options.observeRequests } : {}),
      ...(options.createRequests ? { createRequests: options.createRequests } : {}),
    },
  )
  try {
    await run({ controller, events, opened, avisos, handlers, paths })
  } finally {
    controller.pararDeObservarPedidos()
    fs.rmSync(paths.root, { recursive: true, force: true })
  }
}

/**
 * Relógio e timers de mentira: o teste anda o tempo até um vencimento sem
 * esperar uma hora. `andar` dispara, em ordem, o que vence no caminho;
 * `pular` só muda a hora, como se o timer ainda não tivesse rodado.
 */
function relogioFalso(inicio = Date.parse('2026-09-29T12:00:00.000Z')) {
  let agora = inicio
  let proximoId = 1
  const agendados = new Map()
  const proximoVencido = (ate) =>
    [...agendados].filter(([, timer]) => timer.quando <= ate).sort((a, b) => a[1].quando - b[1].quando)[0]
  return {
    agora: () => agora,
    timers: {
      setTimeout: (callback, ms) => {
        agendados.set(proximoId, { callback, ms, quando: agora + ms })
        return proximoId++
      },
      clearTimeout: (id) => agendados.delete(id),
    },
    andar(ms) {
      const fim = agora + ms
      for (let vencido = proximoVencido(fim); vencido; vencido = proximoVencido(fim)) {
        agendados.delete(vencido[0])
        agora = Math.max(agora, vencido[1].quando)
        vencido[1].callback()
      }
      agora = fim
    },
    pular(ms) {
      agora += ms
    },
    /** Os atrasos pedidos pelos timers ainda agendados. */
    esperas: () => [...agendados.values()].map((timer) => timer.ms),
  }
}

/** Um pedido gravado à mão na pasta, como um arquivo que não passou pelo CLI. */
function gravarAMao(pasta, pedido) {
  fs.mkdirSync(pasta, { recursive: true })
  const completo = {
    acao: 'abrir-pagina',
    modo: 'externo',
    estado: 'pendente',
    pedidoEm: new Date().toISOString(),
    origem: '',
    ...pedido,
  }
  fs.writeFileSync(path.join(pasta, `${completo.id}.json`), JSON.stringify(completo))
  return completo
}

const aberturas = (events) => events.filter((event) => event.channel === BROWSER_OPEN_CHANNEL)
const avisosDaFila = (events) => events.filter((event) => event.channel === BROWSER_REQUESTS_CHANNEL)

/** O que o cartão manda ao decidir: o id, o destino e o que ele mostrou. */
function paramsDoCartao(controller, id, destino) {
  const item = controller.listRequests().find((request) => request.id === id)
  assert.ok(item, `o cartão não mostra o pedido ${id}`)
  return { id, destino, url: item.url, ...(item.perfil ? { perfil: item.perfil } : {}) }
}

const decidirComoOCartao = (controller, id, destino) => controller.decide(paramsDoCartao(controller, id, destino))

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

    const result = await decidirComoOCartao(controller, pedido.id, 'externo')

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

    await decidirComoOCartao(controller, pedido.id, 'embutido')

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

    await decidirComoOCartao(controller, pedido.id, null)

    assert.deepEqual(opened, [])
    assert.deepEqual(aberturas(events), [])
    const resolvido = controller.pedidos.ler(pedido.id)
    assert.equal(resolvido.estado, 'recusado')
    assert.match(resolvido.resultado.message, /recusou/)
    assert.deepEqual(controller.listRequests(), [])
  })
})

test('o renderer só confirma o que viu: outra URL, ou nenhuma, não abre nada', async () => {
  await comControlador({}, async ({ controller, opened }) => {
    const pedido = controller.pedidos.registrar('abrir-pagina', { url: 'https://example.com' })
    controller.processPending()

    for (const url of ['https://evil.example/', undefined, 'https://example.com']) {
      const result = await controller.decide({ id: pedido.id, destino: 'externo', url })
      assert.equal(result.resolved, null, String(url))
      assert.match(result.message, /mudou depois de aparecer no cartão/)
    }
    assert.deepEqual(opened, [])
    assert.equal(controller.pedidos.ler(pedido.id).estado, 'pendente')

    // A URL aberta continua sendo a do pedido gravado, na forma serializada.
    await controller.decide({ id: pedido.id, destino: 'externo', url: 'https://example.com/' })
    assert.deepEqual(opened, ['https://example.com/'])
  })
})

test('decidir de novo, id desconhecido ou destino inventado não fazem nada', async () => {
  await comControlador({}, async ({ controller, opened }) => {
    const pedido = controller.pedidos.registrar('abrir-pagina', { url: 'https://example.com' })
    controller.processPending()
    await decidirComoOCartao(controller, pedido.id, 'externo')

    const url = 'https://example.com/'
    assert.equal((await controller.decide({ id: pedido.id, destino: 'externo', url })).resolved, null)
    assert.equal((await controller.decide({ id: 'nao-existe', destino: 'externo', url })).resolved, null)

    const outro = controller.pedidos.registrar('abrir-pagina', { url: 'https://example.com/b' })
    const invalido = await controller.decide(paramsDoCartao(controller, outro.id, 'shell'))
    assert.equal(invalido.resolved, null)
    assert.equal(controller.pedidos.ler(outro.id).estado, 'pendente')
    assert.deepEqual(opened, ['https://example.com/'])
  })
})

test('pedido de outra intenção (Fetch All, pergunta) não é decidido por aqui', async () => {
  await comControlador({}, async ({ controller }) => {
    const fetchAll = controller.pedidos.registrar('executar-plano')
    controller.processPending()

    assert.equal((await controller.decide({ id: fetchAll.id, destino: 'externo', url: 'https://example.com/' })).resolved, null)
    assert.equal(controller.pedidos.ler(fetchAll.id).estado, 'pendente')
    assert.deepEqual(controller.listRequests(), [])
  })
})

test('navegador que não abre: o pedido continua esperando e o cartão recebe o motivo', async () => {
  const navegador = { falhar: true }
  await comControlador({ falharAoAbrir: () => navegador.falhar }, async ({ controller, handlers, opened }) => {
    const pedido = controller.pedidos.registrar('abrir-pagina', { url: 'https://example.com' })
    controller.processPending()

    const result = await handlers.get('agent-browser:decide')({}, paramsDoCartao(controller, pedido.id, 'externo'))

    assert.deepEqual(result, { ok: false, message: 'navegador indisponível' })
    assert.equal(controller.pedidos.ler(pedido.id).estado, 'pendente')
    // A pessoa pode tentar de novo (a reserva do id foi solta) ou escolher outra opção.
    navegador.falhar = false
    await decidirComoOCartao(controller, pedido.id, 'externo')
    assert.deepEqual(opened, ['https://example.com/'])
    assert.equal(controller.pedidos.ler(pedido.id).estado, 'aceito')
  })
})

test('perfil que some depois de o pedido chegar: nada é resolvido pelas costas da pessoa', async () => {
  const perfis = new Set(['Trabalho'])
  await comControlador(
    { findProfileByName: (nome) => (perfis.has(nome) ? { id: `id-${nome}` } : null) },
    async ({ controller, events, opened }) => {
      const pedido = controller.pedidos.registrar('abrir-pagina', { url: 'https://example.com', modo: 'embutido', perfil: 'Trabalho' })
      controller.processPending()
      perfis.delete('Trabalho')

      // Outra rodada (outro pedido chegou): o pedido já estava no cartão, fica.
      controller.processPending()
      assert.equal(controller.pedidos.ler(pedido.id).estado, 'pendente')

      const result = await decidirComoOCartao(controller, pedido.id, 'embutido')
      assert.equal(result.ok, false)
      assert.match(result.message, /"Trabalho" não existe mais/)
      assert.equal(controller.pedidos.ler(pedido.id).estado, 'pendente')
      assert.deepEqual(aberturas(events), [])

      // O navegador do sistema não usa perfil: continua valendo.
      await decidirComoOCartao(controller, pedido.id, 'externo')
      assert.deepEqual(opened, ['https://example.com/'])
    },
  )
})

test('toda recusa diz quem recusou: a pessoa, ou o app com o motivo', async () => {
  await comControlador(
    {
      findProfileByName: () => null,
      preparar: (pasta) => {
        gravarAMao(pasta, { id: 'fora-da-web', url: 'file:///etc/passwd' })
        gravarAMao(pasta, { id: 'malformado', url: 'https://example.com', modo: 'janela' })
        gravarAMao(pasta, { id: 'perfil-fantasma', url: 'https://example.com', modo: 'embutido', perfil: 'Fantasma' })
      },
    },
    async ({ controller }) => {
      for (const id of ['fora-da-web', 'malformado', 'perfil-fantasma']) {
        assert.equal(controller.pedidos.ler(id).resultado.recusadoPor, 'app', id)
      }

      const pedido = controller.pedidos.registrar('abrir-pagina', { url: 'https://example.com' })
      controller.processPending()
      await decidirComoOCartao(controller, pedido.id, null)
      assert.equal(controller.pedidos.ler(pedido.id).resultado.recusadoPor, 'pessoa')
    },
  )
})

test('Página Web sem janela pronta: falha explicada e o pedido continua esperando', async () => {
  await comControlador({ semJanela: true }, async ({ controller, handlers }) => {
    const pedido = controller.pedidos.registrar('abrir-pagina', { url: 'https://example.com' })
    controller.processPending()

    const result = await handlers.get('agent-browser:decide')({}, paramsDoCartao(controller, pedido.id, 'embutido'))

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

    const [mostrado] = lista.requests
    const decisao = await handlers.get('agent-browser:decide')({}, { id: mostrado.id, destino: 'externo', url: mostrado.url })
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

      await decidirComoOCartao(controller, pedido.id, 'embutido')

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
      await decidirComoOCartao(controller, pedido.id, 'embutido')
      assert.equal(aberturas(events)[0].data.profileId, 'default')
    },
  )
})

test('sem perfil no pedido o evento não traz profileId (comportamento de sempre)', async () => {
  await comControlador({}, async ({ controller, events }) => {
    const pedido = controller.pedidos.registrar('abrir-pagina', { url: 'https://example.com', modo: 'embutido' })
    controller.processPending()
    await decidirComoOCartao(controller, pedido.id, 'embutido')
    assert.equal('profileId' in aberturas(events)[0].data, false)
  })
})

test('arquivo malformado na pasta não derruba o registro e nunca chega ao renderer', async () => {
  // A sonda da revisão: `perfil: {"toString":1}` lançava no registro — que o
  // main chama no boot sem try/catch — e no render do cartão.
  const tortos = [
    { id: 'perfil-objeto', modo: 'embutido', url: 'https://example.com/a', perfil: { toString: 1 } },
    { id: 'url-numero', url: 42 },
    { id: 'modo-lista', url: 'https://example.com/b', modo: ['embutido'] },
    { id: 'modo-inventado', url: 'https://example.com/c', modo: 'janela' },
    // Uma lista com a data dentro passaria pelo `Date.parse` como data válida.
    { id: 'pedido-em-lista', url: 'https://example.com/d', pedidoEm: [new Date().toISOString()] },
  ]
  await comControlador(
    { preparar: (pasta) => tortos.forEach((pedido) => gravarAMao(pasta, pedido)) },
    async ({ controller, events, handlers, avisos }) => {
      assert.ok(handlers.has('agent-browser:list-requests'))
      assert.ok(handlers.has('agent-browser:decide'))
      for (const { id } of tortos) {
        const resolvido = controller.pedidos.ler(id)
        assert.equal(resolvido.estado, 'recusado', id)
        assert.match(resolvido.resultado.message, /malformado/, id)
      }
      assert.deepEqual(controller.listRequests(), [])
      assert.ok(avisosDaFila(events).every((event) => event.data.requests.length === 0))
      assert.deepEqual(avisos, [])
    },
  )
})

test('pedido que entorta depois de aparecer no cartão não abre nem lança, e a varredura o recusa', async () => {
  await comControlador({}, async ({ controller, paths, opened, events }) => {
    gravarAMao(paths.agentRequests, { id: 'torto', modo: 'embutido', url: 'https://example.com' })
    const params = paramsDoCartao(controller, 'torto', 'embutido')
    gravarAMao(paths.agentRequests, { id: 'torto', modo: 'embutido', url: 'https://example.com', perfil: { toString: 1 } })

    const result = await controller.decide(params)

    assert.equal(result.resolved, null)
    assert.match(result.message, /mudou/)
    assert.deepEqual(opened, [])
    assert.deepEqual(aberturas(events), [])

    controller.processPending()
    assert.equal(controller.pedidos.ler('torto').estado, 'recusado')
    assert.match(controller.pedidos.ler('torto').resultado.message, /malformado/)
  })
})

test('id de dentro diferente do nome do arquivo: a decisão não abre outro pedido', async () => {
  // A sonda da revisão: o cartão mostrava docs.python.org (do `x.json`, que
  // dizia ser o pedido `y`) e a decisão de `y` abria evil.example/login.
  const antes = new Date(Date.now() - 1000).toISOString()
  await comControlador(
    {
      preparar: (pasta) => {
        fs.writeFileSync(
          path.join(pasta, 'x.json'),
          JSON.stringify({ id: 'y', acao: 'abrir-pagina', url: 'https://docs.python.org/', modo: 'externo', estado: 'pendente', pedidoEm: antes, origem: '' }),
        )
        gravarAMao(pasta, { id: 'y', url: 'https://evil.example/login' })
      },
    },
    async ({ controller, opened }) => {
      // O cartão mostra o que a decisão abriria, não o disfarce.
      assert.deepEqual(controller.listRequests().map((item) => item.url), ['https://evil.example/login'])

      const result = await controller.decide({ id: 'y', destino: 'externo', url: 'https://docs.python.org/' })

      assert.equal(result.resolved, null)
      assert.deepEqual(opened, [])
    },
  )
})

test('a decisão confere o id do pedido lido, mesmo que a fila devolva outro', async () => {
  await comControlador(
    {
      createRequests: (opcoes) => {
        const fila = criarRepositorioDePedidos(opcoes)
        // Uma fila que não guardasse o invariante id = nome do arquivo.
        return { ...fila, ler: (id) => fila.ler(id) && { ...fila.ler(id), id: 'outro' } }
      },
    },
    async ({ controller, opened }) => {
      const pedido = controller.pedidos.registrar('abrir-pagina', { url: 'https://example.com' })
      controller.processPending()

      const result = await decidirComoOCartao(controller, pedido.id, 'externo')

      assert.equal(result.resolved, null)
      assert.deepEqual(opened, [])
    },
  )
})

test('arquivo reescrito entre o cartão aparecer e o clique: nada abre, e o cartão é avisado', async () => {
  await comControlador({}, async ({ controller, paths, opened, events }) => {
    const pedido = controller.pedidos.registrar('abrir-pagina', { url: 'https://docs.python.org/3/' })
    controller.processPending()
    const params = paramsDoCartao(controller, pedido.id, 'externo')
    gravarAMao(paths.agentRequests, { ...pedido, url: 'https://evil.example/login' })

    const result = await controller.decide(params)

    assert.deepEqual(result, { resolved: null, message: 'O pedido mudou depois de aparecer no cartão. Confira de novo.' })
    assert.deepEqual(opened, [])
    assert.equal(controller.pedidos.ler(pedido.id).estado, 'pendente')
    // O cartão recebe o pedido como ele está agora, para a pessoa conferir.
    assert.deepEqual(avisosDaFila(events).at(-1).data.requests.map((item) => item.url), ['https://evil.example/login'])
  })
})

test('perfil trocado depois de aparecer também é mudança: outro perfil é outra sessão logada', async () => {
  await comControlador({ findProfileByName: (nome) => ({ id: `id-${nome}` }) }, async ({ controller, paths, events }) => {
    const pedido = controller.pedidos.registrar('abrir-pagina', { url: 'https://example.com', modo: 'embutido', perfil: 'Trabalho' })
    controller.processPending()
    const params = paramsDoCartao(controller, pedido.id, 'embutido')
    gravarAMao(paths.agentRequests, { ...pedido, perfil: 'Pessoal' })

    assert.equal((await controller.decide(params)).resolved, null)
    // Omitir o perfil que o cartão mostrou também não passa.
    gravarAMao(paths.agentRequests, pedido)
    assert.equal((await controller.decide({ ...params, perfil: undefined })).resolved, null)
    assert.deepEqual(aberturas(events), [])

    await controller.decide(params)
    assert.equal(aberturas(events)[0].data.profileId, 'id-Trabalho')
  })
})

test('duas decisões ao mesmo tempo abrem a página uma vez só', async () => {
  await comControlador({}, async ({ controller, opened }) => {
    const pedido = controller.pedidos.registrar('abrir-pagina', { url: 'https://example.com' })
    controller.processPending()
    const params = paramsDoCartao(controller, pedido.id, 'externo')

    const [primeira, segunda] = await Promise.all([controller.decide(params), controller.decide(params)])

    assert.deepEqual(opened, ['https://example.com/'])
    assert.equal(primeira.resolved.estado, 'aceito')
    assert.deepEqual(segunda, { resolved: null, message: 'Esse pedido já está sendo atendido.' })
    // Terminada a primeira, o id sai da reserva: a próxima decisão lê o desfecho.
    assert.match((await controller.decide(params)).message, /não está mais pendente/)
  })
})

test('perfil só vale com o modo embutido: pedido externo com perfil é malformado', async () => {
  await comControlador(
    {
      findProfileByName: () => ({ id: 'trabalho-ab12' }),
      preparar: (pasta) => gravarAMao(pasta, { id: 'externo-com-perfil', url: 'https://example.com', perfil: 'Trabalho' }),
    },
    async ({ controller }) => {
      const resolvido = controller.pedidos.ler('externo-com-perfil')
      assert.equal(resolvido.estado, 'recusado')
      assert.match(resolvido.resultado.message, /perfil so vale com o modo embutido/)
      assert.deepEqual(controller.listRequests(), [])
    },
  )
})

test('um pedido que falha ao processar não impede os outros, e o aviso não leva a URL', async () => {
  const segredo = 'https://example.com/convite?token=segredo'
  await comControlador(
    {
      findProfileByName: () => {
        throw new Error('banco indisponível')
      },
      preparar: (pasta) => {
        gravarAMao(pasta, { id: 'quebra', modo: 'embutido', url: segredo, perfil: 'Trabalho' })
        gravarAMao(pasta, { id: 'inteiro', url: 'https://example.com/ok' })
      },
    },
    async ({ controller, avisos }) => {
      assert.equal(controller.pedidos.ler('inteiro').estado, 'pendente')
      assert.ok(controller.listRequests().some((item) => item.id === 'inteiro'))
      assert.equal(avisos.length, 1)
      assert.match(avisos[0], /quebra/)
      assert.match(avisos[0], /banco indisponível/)
      assert.doesNotMatch(avisos[0], /example\.com|token|segredo/)
    },
  )
})

test('pedido que vence sem resposta sai do cartão sozinho, e o agente lê que expirou', async () => {
  const relogio = relogioFalso()
  await comControlador({ relogio }, async ({ controller, events }) => {
    const pedido = controller.pedidos.registrar('abrir-pagina', { url: 'https://example.com' })
    controller.processPending()
    // Um timer até o vencimento, e nenhum outro evento na pasta depois disso.
    assert.deepEqual(relogio.esperas(), [VALIDADE_MS])

    relogio.andar(VALIDADE_MS - 1)
    assert.equal(controller.pedidos.ler(pedido.id).estado, 'pendente')
    relogio.andar(1)

    const resolvido = controller.pedidos.ler(pedido.id)
    assert.equal(resolvido.estado, 'recusado')
    assert.deepEqual(
      { recusadoPor: resolvido.resultado.recusadoPor, expirou: resolvido.resultado.expirou, message: resolvido.resultado.message },
      { recusadoPor: 'app', expirou: true, message: 'O pedido expirou sem resposta da pessoa.' },
    )
    assert.deepEqual(avisosDaFila(events).at(-1).data.requests, [])
    assert.deepEqual(relogio.esperas(), [])
  })
})

test('decidir um pedido que venceu antes de o timer rodar: recusado como expirado, nada abre', async () => {
  const relogio = relogioFalso()
  await comControlador({ relogio }, async ({ controller, handlers, opened }) => {
    const pedido = controller.pedidos.registrar('abrir-pagina', { url: 'https://example.com' })
    controller.processPending()
    const params = paramsDoCartao(controller, pedido.id, 'externo')
    relogio.pular(VALIDADE_MS)

    const result = await handlers.get('agent-browser:decide')({}, params)

    assert.equal(result.message, 'O pedido expirou sem resposta da pessoa.')
    assert.equal(result.resolved.estado, 'recusado')
    assert.equal(result.resolved.resultado.recusadoPor, 'app')
    assert.deepEqual(opened, [])
  })
})

test('pendente vencido que já estava na pasta quando o app abriu é resolvido como expirado', async () => {
  const relogio = relogioFalso()
  const antigo = new Date(relogio.agora() - 2 * VALIDADE_MS).toISOString()
  await comControlador(
    { relogio, preparar: (pasta) => gravarAMao(pasta, { id: 'de-ontem', url: 'https://example.com', pedidoEm: antigo }) },
    async ({ controller }) => {
      assert.equal(controller.pedidos.ler('de-ontem').estado, 'recusado')
      assert.equal(controller.pedidos.ler('de-ontem').resultado.expirou, true)
    },
  )
})

test('pedido vencido que não dá para gravar não vira um laço de rodadas', async () => {
  const relogio = relogioFalso()
  const antigo = new Date(relogio.agora() - 2 * VALIDADE_MS).toISOString()
  await comControlador(
    {
      relogio,
      preparar: (pasta) => gravarAMao(pasta, { id: 'somente-leitura', url: 'https://example.com', pedidoEm: antigo }),
      createRequests: (opcoes) => {
        const fila = criarRepositorioDePedidos(opcoes)
        return {
          ...fila,
          resolver: () => {
            throw new Error('EACCES: permission denied')
          },
        }
      },
    },
    async ({ controller, avisos }) => {
      // Um aviso, e nenhum timer para "agora": a próxima tentativa vem do
      // próximo evento na pasta, não de um laço.
      assert.equal(avisos.length, 1)
      assert.match(avisos[0], /somente-leitura.*EACCES/)
      assert.deepEqual(relogio.esperas(), [])
      assert.equal(controller.pedidos.ler('somente-leitura').estado, 'pendente')
    },
  )
})

test('o timer segue o próximo vencimento e para junto com o observador', async () => {
  const relogio = relogioFalso()
  await comControlador({ relogio }, async ({ controller }) => {
    const primeiro = controller.pedidos.registrar('abrir-pagina', { url: 'https://example.com/1' })
    relogio.pular(10 * 60 * 1000)
    const segundo = controller.pedidos.registrar('abrir-pagina', { url: 'https://example.com/2' })
    controller.processPending()
    assert.deepEqual(relogio.esperas(), [VALIDADE_MS - 10 * 60 * 1000])

    relogio.andar(VALIDADE_MS - 10 * 60 * 1000)
    assert.equal(controller.pedidos.ler(primeiro.id).estado, 'recusado')
    assert.equal(controller.pedidos.ler(segundo.id).estado, 'pendente')
    assert.deepEqual(relogio.esperas(), [10 * 60 * 1000])

    controller.pararDeObservarPedidos()
    assert.deepEqual(relogio.esperas(), [])
  })
})

/**
 * Observador da pasta que o teste dispara na mão, e uma fila que conta as
 * varreduras: o custo de uma rodada é medido em leituras da pasta.
 */
function pastaContada() {
  const observador = { disparar: () => {} }
  const varreduras = []
  return {
    observador,
    varreduras,
    observeRequests: (_pasta, onChange) => {
      observador.disparar = onChange
      return { close: () => {} }
    },
    createRequests: (opcoes) => {
      const fila = criarRepositorioDePedidos(opcoes)
      return {
        ...fila,
        listarPendentes: (filtro) => {
          varreduras.push(filtro)
          return fila.listarPendentes(filtro)
        },
      }
    },
  }
}

test('uma rajada de eventos da pasta vira uma rodada: uma varredura e um aviso', async () => {
  const relogio = relogioFalso()
  const pasta = pastaContada()
  await comControlador({ relogio, ...pasta }, async ({ controller, events }) => {
    const antes = { varreduras: pasta.varreduras.length, avisos: avisosDaFila(events).length }
    const pedido = controller.pedidos.registrar('abrir-pagina', { url: 'https://example.com' })

    // O CLI grava, o app resolve, o editor salva: vários eventos seguidos.
    for (let evento = 0; evento < 5; evento += 1) pasta.observador.disparar()
    assert.equal(pasta.varreduras.length, antes.varreduras)
    relogio.andar(75)

    assert.equal(pasta.varreduras.length, antes.varreduras + 1)
    const avisos = avisosDaFila(events).slice(antes.avisos)
    assert.deepEqual(avisos.map((aviso) => aviso.data.requests.map((item) => item.id)), [[pedido.id]])
  })
})

test('rodada que não muda a lista não manda nada ao renderer', async () => {
  const relogio = relogioFalso()
  const pasta = pastaContada()
  await comControlador({ relogio, ...pasta }, async ({ controller, events }) => {
    controller.pedidos.registrar('abrir-pagina', { url: 'https://example.com' })
    pasta.observador.disparar()
    relogio.andar(75)
    const avisos = avisosDaFila(events).length

    // Um evento sem mudança na fila (outro consumidor gravou, ou o próprio desfecho).
    controller.pedidos.registrar('executar-plano')
    pasta.observador.disparar()
    relogio.andar(75)

    assert.equal(avisosDaFila(events).length, avisos)
  })
})

test('o list-requests responde na hora, sem esperar a rodada', async () => {
  const relogio = relogioFalso()
  const pasta = pastaContada()
  await comControlador({ relogio, ...pasta }, async ({ controller, handlers }) => {
    const pedido = controller.pedidos.registrar('abrir-pagina', { url: 'https://example.com' })
    pasta.observador.disparar()

    const lista = await handlers.get('agent-browser:list-requests')()

    assert.deepEqual(lista.requests.map((item) => item.id), [pedido.id])
  })
})

test('a decisão entra na mesma rodada que o evento do desfecho gravado', async () => {
  const relogio = relogioFalso()
  const pasta = pastaContada()
  await comControlador({ relogio, ...pasta }, async ({ controller, events }) => {
    const pedido = controller.pedidos.registrar('abrir-pagina', { url: 'https://example.com' })
    controller.processPending()
    const params = paramsDoCartao(controller, pedido.id, null)
    const antes = pasta.varreduras.length

    await controller.decide(params)
    pasta.observador.disparar()
    relogio.andar(75)

    // Uma varredura para a decisão e o evento juntos, e o cartão fica sem o pedido.
    assert.equal(pasta.varreduras.length, antes + 1)
    assert.deepEqual(avisosDaFila(events).at(-1).data.requests, [])
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
  // A decisão leva o que o cartão mostrou; o main só executa se for o pedido gravado.
  assert.match(types, /decideBrowserRequest: \(params: \{[^}]*\burl: string[^}]*\bperfil\?: string/)
  assert.match(types, /onBrowserRequests: \(/)
})

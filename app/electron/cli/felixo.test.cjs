const test = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { executar, interpretarArgumentos, VERBOS } = require('./felixo.cjs')
const { criarRepositorioDePedidos } = require('../services/fetch-all/agent-requests.cjs')
const { AVISO_ESCRITA } = require('./agent-command-output.cjs')

const PLANO = {
  total: 2,
  upToDate: [{ path: '/repos/em-dia' }],
  toPull: [{ path: '/repos/atrasado', state: 'NEEDS_PULL', behind: 3, branch: 'main' }],
  toPush: [],
  problems: [],
}

function dependencias(extras = {}) {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-cli-'))

  return {
    pasta,
    deps: {
      criarServico: () => ({
        scan: async () => ({ ok: true, plan: PLANO, scanMode: 'completa (1 raiz)' }),
        getState: () => ({ phase: 'idle', busy: false, plan: PLANO, scanMode: 'completa' }),
        ...extras.servico,
      }),
      criarPedidos: () => criarRepositorioDePedidos({ pasta }),
      diretorioAtual: () => '/projeto/atual',
      gravarRelatorio: async () => '/relatorios/fetch-all/2026.md',
      gravarEstado: async () => '',
      lerEstado: async () => null,
      ...extras.deps,
    },
  }
}

test('interpretarArgumentos separa verbo de opção', () => {
  assert.deepEqual(interpretarArgumentos(['fetch-all', 'varrer', '--cache', '--json']), {
    ferramenta: 'fetch-all',
    verbo: 'varrer',
    argumento: '',
    argumento2: '',
    argumento2Fornecido: false,
    restantes: [],
    opcoes: { cache: true, json: true },
  })
})

test('interpretarArgumentos distingue "argumento2 não veio" de "argumento2 veio vazio"', () => {
  assert.equal(
    interpretarArgumentos(['canvas', 'escrever', 'n1']).argumento2Fornecido,
    false,
  )
  assert.equal(
    interpretarArgumentos(['canvas', 'escrever', 'n1', '']).argumento2Fornecido,
    true,
  )
})

test('browser open registra intenções externas e embutidas na fila compartilhada', async () => {
  const { pasta, deps } = dependencias()

  const externo = await executar(['browser', 'open', 'https://example.com'], deps)
  const embutido = await executar(
    ['navegador', 'abrir', 'http://localhost:4173', '--embutido'],
    deps,
  )

  assert.equal(externo.codigo, 0)
  assert.match(externo.saida, /Pedido registrado/)
  assert.match(externo.saida, /Destino: externo/)
  assert.equal(embutido.codigo, 0)
  assert.match(embutido.saida, /Destino: embutido/)

  const pedidos = criarRepositorioDePedidos({ pasta }).listarPendentes({ acao: 'abrir-pagina' })
  assert.equal(pedidos.length, 2)
  const pedidoExterno = pedidos.find((pedido) => pedido.url === 'https://example.com')
  const pedidoEmbutido = pedidos.find((pedido) => pedido.url === 'http://localhost:4173')
  assert.equal(pedidoExterno?.url, 'https://example.com')
  assert.equal(pedidoEmbutido?.modo, 'embutido')
})

test('browser open recusa protocolo que nao e web', async () => {
  const { deps } = dependencias()

  const resultado = await executar(['browser', 'open', 'file:///tmp/segredo'], deps)

  assert.equal(resultado.codigo, 2)
  assert.match(resultado.erro, /URL http/)
})

test('nenhum verbo de escrita existe no comando', () => {
  // A garantia é estrutural: se alguém acrescentar 'pull'/'push'/'commit' à
  // lista, este teste cai antes de o agente conseguir chamar.
  for (const proibido of ['pull', 'push', 'commit', 'executar', 'aplicar']) {
    assert.equal(VERBOS.includes(proibido), false, `verbo de escrita exposto: ${proibido}`)
  }
})

test('verbo desconhecido devolve ajuda e código de erro, nunca uma tentativa', async () => {
  const { deps } = dependencias()

  const resultado = await executar(['fetch-all', 'push'], deps)

  assert.equal(resultado.codigo, 2)
  assert.match(resultado.saida, /felixo fetch-all/)
  assert.match(resultado.saida, /pedir-execucao/)
})

test('sem argumento nenhum, imprime a ajuda com sucesso', async () => {
  const { deps } = dependencias()

  const resultado = await executar([], deps)

  assert.equal(resultado.codigo, 0)
  assert.match(resultado.saida, /varrer/)
})

test('roteia a leitura de contexto sem inicializar o Fetch All', async () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-context-route-'))
  const nome = 'felixo-context-1-route.txt'
  fs.writeFileSync(path.join(pasta, nome), 'contexto do teste', 'utf8')

  try {
    const resultado = await executar(['contexto', 'ler', nome], {
      contexto: { getContextDir: () => pasta },
      criarServico: () => {
        throw new Error('o Fetch All não deve ser inicializado')
      },
    })

    assert.equal(resultado.codigo, 0)
    assert.equal(resultado.saida, 'contexto do teste')
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true })
  }
})

test('lê contexto mesmo quando o módulo opcional de DevTools não está empacotado', () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-context-packaged-'))
  const nome = 'felixo-context-1-packaged.txt'
  fs.writeFileSync(path.join(pasta, nome), 'contexto empacotado', 'utf8')

  const script = `
    const Module = require('node:module')
    const originalLoad = Module._load
    Module._load = function (request, parent, isMain) {
      if (request.includes('scripts/dev-runner.cjs') && parent?.filename?.endsWith('felixo-devtools.cjs')) {
        const error = new Error('simulated missing dev-runner.cjs')
        error.code = 'MODULE_NOT_FOUND'
        throw error
      }
      return originalLoad.call(this, request, parent, isMain)
    }

    const { executar } = require(process.env.FELIXO_CLI)
    executar(['context', 'read', process.env.FELIXO_CONTEXT_NAME], {
      contexto: { getContextDir: () => process.env.FELIXO_CONTEXT_DIR },
    }).then((result) => {
      process.stdout.write(JSON.stringify(result))
    }).catch((error) => {
      process.stderr.write(error.stack || String(error))
      process.exitCode = 1
    })
  `

  try {
    const child = spawnSync(process.execPath, ['-e', script], {
      encoding: 'utf8',
      env: {
        ...process.env,
        FELIXO_CLI: path.join(__dirname, 'felixo.cjs'),
        FELIXO_CONTEXT_DIR: pasta,
        FELIXO_CONTEXT_NAME: nome,
      },
    })

    assert.equal(child.status, 0, child.stderr)
    assert.deepEqual(JSON.parse(child.stdout), { saida: 'contexto empacotado', codigo: 0 })
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true })
  }
})

test('varrer imprime o plano, o relatório e o aviso de escrita', async () => {
  let estadoGravado = null
  const { deps } = dependencias({
    deps: {
      gravarEstado: async (resultado) => {
        estadoGravado = resultado
      },
    },
  })

  const resultado = await executar(['fetch-all', 'varrer'], deps)

  assert.equal(resultado.codigo, 0)
  assert.match(resultado.saida, /2 repositório\(s\) analisado\(s\)/)
  assert.match(resultado.saida, /\/repos\/atrasado — Precisa de pull \(3 atrás, main\)/)
  assert.match(resultado.saida, /\/relatorios\/fetch-all\/2026\.md/)
  // O aviso não é decoração: é o que impede o agente de procurar como escrever.
  assert.ok(resultado.saida.includes(AVISO_ESCRITA))
  assert.equal(estadoGravado.plan, PLANO)
})

test('varrer --json entrega o plano cru com o caminho do relatório', async () => {
  const { deps } = dependencias()

  const resultado = await executar(['fetch-all', 'varrer', '--json'], deps)
  const dados = JSON.parse(resultado.saida)

  assert.equal(dados.plan.total, 2)
  assert.equal(dados.reportPath, '/relatorios/fetch-all/2026.md')
})

test('--todos-discos registra a confirmação explícita do escopo amplo', async () => {
  let recebido = null
  const { deps } = dependencias({
    servico: {
      describeScanScope: async () => ({ scopeKey: 'escopo-atual' }),
      scan: async (params) => {
        recebido = params
        return { ok: true, plan: PLANO, scanMode: 'completa (1 raiz)' }
      },
    },
  })

  const resultado = await executar(['fetch-all', 'varrer', '--todos-discos'], deps)

  assert.equal(resultado.codigo, 0)
  assert.deepEqual(recebido, {
    useCache: false,
    confirmUnconfiguredScope: true,
    scopeKey: 'escopo-atual',
  })
})

test('varredura que falha vira mensagem no stderr e código 1', async () => {
  const { deps } = dependencias({
    servico: { scan: async () => ({ ok: false, message: 'Já existe uma passada em andamento.' }) },
  })

  const resultado = await executar(['fetch-all', 'varrer'], deps)

  assert.equal(resultado.codigo, 1)
  assert.equal(resultado.saida, '')
  assert.match(resultado.erro, /passada em andamento/)
})

test('varredura cancelada não grava relatório nem finge que varreu', async () => {
  let gravou = false
  const { deps } = dependencias({
    servico: { scan: async () => ({ ok: true, cancelled: true }) },
    deps: {
      gravarRelatorio: async () => {
        gravou = true
        return ''
      },
    },
  })

  const resultado = await executar(['fetch-all', 'varrer'], deps)

  assert.match(resultado.saida, /cancelada/)
  assert.equal(gravou, false)
})

test('estado mostra o último plano sem varrer de novo', async () => {
  let varreu = false
  const { deps } = dependencias({
    servico: {
      scan: async () => {
        varreu = true
        return { ok: true, plan: PLANO }
      },
    },
  })

  const resultado = await executar(['fetch-all', 'estado'], deps)

  assert.equal(varreu, false)
  assert.match(resultado.saida, /2 repositório\(s\)/)
})

test('estado lê o plano persistido quando o processo do comando é novo', async () => {
  let varreu = false
  const { deps } = dependencias({
    servico: {
      scan: async () => {
        varreu = true
        return { ok: true, plan: PLANO }
      },
      getState: () => ({ phase: 'idle', busy: false, plan: null, scanMode: '' }),
    },
    deps: {
      lerEstado: async () => ({ plan: PLANO, scanMode: 'completa (1 raiz)', scannedAt: 'agora' }),
    },
  })

  const resultado = await executar(['fetch-all', 'estado'], deps)

  assert.equal(varreu, false)
  assert.match(resultado.saida, /2 repositório\(s\)/)
  assert.match(resultado.saida, /completa \(1 raiz\)/)
})

test('pedir-execucao só registra o pedido — nada é executado', async () => {
  const { pasta, deps } = dependencias({
    servico: {
      execute: () => {
        throw new Error('o comando não pode executar nada')
      },
    },
  })

  const resultado = await executar(['fetch-all', 'pedir-execucao'], deps)

  assert.equal(resultado.codigo, 0)
  assert.match(resultado.saida, /Pedido registrado/)
  assert.match(resultado.saida, /esperando confirmação/)

  const pendentes = criarRepositorioDePedidos({ pasta }).listarPendentes()
  assert.equal(pendentes.length, 1)
  assert.equal(pendentes[0].estado, 'pendente')
  assert.equal(pendentes[0].comCommit, false)
  assert.equal(pendentes[0].origem, '/projeto/atual')
})

test('--com-commit entra no pedido, mas continua sendo só um pedido', async () => {
  const { pasta, deps } = dependencias()

  await executar(['fetch-all', 'pedir-execucao', '--com-commit'], deps)

  const [pedido] = criarRepositorioDePedidos({ pasta }).listarPendentes()
  assert.equal(pedido.comCommit, true)
  assert.equal(pedido.estado, 'pendente')
})

test('ver-pedido conta o desfecho de um pedido já resolvido', async () => {
  const { pasta, deps } = dependencias()
  await executar(['fetch-all', 'pedir-execucao'], deps)
  const repositorio = criarRepositorioDePedidos({ pasta })
  const [pedido] = repositorio.listarPendentes()
  repositorio.resolver(pedido.id, { aceito: true, resultado: { ok: true } })

  const resultado = await executar(['fetch-all', 'ver-pedido', pedido.id], deps)

  assert.match(resultado.saida, /aceito/)
  assert.match(resultado.saida, /executado pelo app/)
})

test('ver-pedido sem id conhecido falha em vez de inventar', async () => {
  const { deps } = dependencias()

  const resultado = await executar(['fetch-all', 'ver-pedido', 'nao-existe'], deps)

  assert.equal(resultado.codigo, 1)
  assert.match(resultado.erro, /não encontrado/)
})

test('canvas listar registra o pedido e, quando o app resolve durante a espera, imprime os elementos', async () => {
  const { pasta, deps } = dependencias()
  let resolveuUmaVez = false
  // Simula o app processando a fila em segundo plano: na primeira "espera",
  // resolve o pedido de listagem que "canvas listar" acabou de registrar.
  const esperar = async () => {
    if (resolveuUmaVez) return
    resolveuUmaVez = true
    const repositorio = criarRepositorioDePedidos({ pasta })
    const [pedido] = repositorio.listarPendentes({ acao: 'canvas-listar' })
    if (pedido) {
      repositorio.resolver(pedido.id, {
        aceito: true,
        resultado: { ok: true, elementos: [{ id: 't1', type: 'terminal', label: 'Shell', leituraSuportada: true }] },
      })
    }
  }

  const resultado = await executar(['canvas', 'listar'], { ...deps, esperar })

  assert.equal(resultado.codigo, 0)
  assert.match(resultado.saida, /t1/)
  assert.match(resultado.saida, /terminal/)
})

test('canvas ler exige o id do elemento', async () => {
  const { deps } = dependencias()
  const resultado = await executar(['canvas', 'ler'], deps)
  assert.equal(resultado.codigo, 2)
  assert.match(resultado.erro, /Informe o id/)
})

test('canvas ler: quando o app resolve com sucesso, imprime o conteúdo com código 0', async () => {
  const { pasta, deps } = dependencias()
  const esperar = (() => {
    let chamado = false
    return async () => {
      if (chamado) return
      chamado = true
      const repositorio = criarRepositorioDePedidos({ pasta })
      const [pedido] = repositorio.listarPendentes({ acao: 'canvas-ler' })
      if (pedido) {
        repositorio.resolver(pedido.id, {
          aceito: true,
          resultado: { ok: true, id: 't1', type: 'terminal', label: 'Shell', content: 'saída do terminal' },
        })
      }
    }
  })()

  const resultado = await executar(['canvas', 'ler', 't1'], { ...deps, esperar })

  assert.equal(resultado.codigo, 0)
  assert.match(resultado.saida, /saída do terminal/)
})

test('canvas ler: quando o app resolve com falha (ex.: id inexistente), código 1 mas não é um erro de uso', async () => {
  const { pasta, deps } = dependencias()
  const esperar = (() => {
    let chamado = false
    return async () => {
      if (chamado) return
      chamado = true
      const repositorio = criarRepositorioDePedidos({ pasta })
      const [pedido] = repositorio.listarPendentes({ acao: 'canvas-ler' })
      if (pedido) {
        repositorio.resolver(pedido.id, { aceito: true, resultado: { ok: false, id: 'x', message: 'Nenhum elemento com id "x" neste canvas.' } })
      }
    }
  })()

  const resultado = await executar(['canvas', 'ler', 'x'], { ...deps, esperar })

  assert.equal(resultado.codigo, 1)
  assert.match(resultado.saida, /Nenhum elemento com id/)
})

test('canvas listar: sem o app responder, avisa o timeout e diz como conferir depois', async () => {
  const { deps } = dependencias()
  const resultado = await executar(['canvas', 'listar'], { ...deps, esperar: async () => {} })

  assert.equal(resultado.codigo, 1)
  assert.match(resultado.saida, /não respondeu a tempo/)
  assert.match(resultado.saida, /canvas ver-pedido/)
})

test('canvas ver-pedido mostra o desfecho de um pedido de leitura já resolvido', async () => {
  const { pasta, deps } = dependencias()
  await executar(['canvas', 'listar'], { ...deps, esperar: async () => {} })
  const repositorio = criarRepositorioDePedidos({ pasta })
  const [pedido] = repositorio.listarPendentes({ acao: 'canvas-listar' })
  repositorio.resolver(pedido.id, { aceito: true, resultado: { ok: true, elementos: [] } })

  const resultado = await executar(['canvas', 'ver-pedido', pedido.id], deps)

  assert.match(resultado.saida, /aceito/)
})

test('canvas escrever exige id e conteúdo', async () => {
  const { deps } = dependencias()

  const semId = await executar(['canvas', 'escrever'], deps)
  assert.equal(semId.codigo, 2)
  assert.match(semId.erro, /Informe o id/)

  const semConteudo = await executar(['canvas', 'escrever', 'n1'], deps)
  assert.equal(semConteudo.codigo, 2)
  assert.match(semConteudo.erro, /conteúdo/)
})

test('canvas escrever: registra o pedido e devolve na hora, sem esperar confirmação humana', async () => {
  const { pasta, deps } = dependencias()
  const resultado = await executar(['canvas', 'escrever', 'n1', 'texto novo da nota'], deps)

  assert.equal(resultado.codigo, 0)
  assert.match(resultado.saida, /Pedido registrado/)
  assert.match(resultado.saida, /canvas ver-pedido/)

  const repositorio = criarRepositorioDePedidos({ pasta })
  const [pedido] = repositorio.listarPendentes({ acao: 'canvas-escrever' })
  assert.equal(pedido.idDoElemento, 'n1')
  assert.equal(pedido.conteudo, 'texto novo da nota')
  assert.equal(pedido.estado, 'pendente')
})

test('canvas escrever aceita conteúdo vazio (limpar a nota) desde que a opção venha explícita', async () => {
  const { pasta, deps } = dependencias()
  const resultado = await executar(['canvas', 'escrever', 'n1', ''], deps)

  assert.equal(resultado.codigo, 0)
  const repositorio = criarRepositorioDePedidos({ pasta })
  const [pedido] = repositorio.listarPendentes({ acao: 'canvas-escrever' })
  assert.equal(pedido.conteudo, '')
})

function responderPergunta(pasta, resposta) {
  let feito = false
  return async () => {
    if (feito) return
    feito = true
    const repositorio = criarRepositorioDePedidos({ pasta })
    const [pedido] = repositorio.listarPendentes({ acao: 'perguntar' })
    if (pedido) repositorio.resolver(pedido.id, resposta(pedido))
  }
}

test('perguntar: exige a pergunta', async () => {
  const { deps } = dependencias()
  const resultado = await executar(['perguntar'], deps)
  assert.equal(resultado.codigo, 2)
  assert.match(resultado.erro, /Informe a pergunta/)
})

test('perguntar: valida de 2 a 4 opções antes de registrar qualquer pedido', async () => {
  const { pasta, deps } = dependencias()
  const resultado = await executar(['perguntar', 'Qual?', 'só uma'], deps)
  assert.equal(resultado.codigo, 2)
  assert.match(resultado.erro, /2 a 4 opções/)
  assert.deepEqual(criarRepositorioDePedidos({ pasta }).listarPendentes(), [])
})

test('perguntar: bloqueia até a resposta e imprime só o texto da opção escolhida', async () => {
  const { pasta, deps } = dependencias()
  const esperar = responderPergunta(pasta, (pedido) => ({
    aceito: true,
    resultado: { ok: true, indice: 1, label: pedido.opcoes[1].label },
  }))
  const resultado = await executar(['perguntar', 'Qual banco?', 'SQLite', 'Postgres'], { ...deps, esperar })
  assert.equal(resultado.codigo, 0)
  assert.equal(resultado.saida, 'Postgres')
})

test('perguntar --json devolve o resultado estruturado', async () => {
  const { pasta, deps } = dependencias()
  const esperar = responderPergunta(pasta, () => ({ aceito: true, resultado: { ok: true, indice: 0, label: 'SQLite' } }))
  const resultado = await executar(['perguntar', 'Qual?', 'SQLite', 'Postgres', '--json'], { ...deps, esperar })
  assert.deepEqual(JSON.parse(resultado.saida), { ok: true, indice: 0, label: 'SQLite' })
})

test('perguntar: pergunta dispensada sai com código 3 e sem inventar uma escolha', async () => {
  const { pasta, deps } = dependencias()
  const esperar = responderPergunta(pasta, () => ({ aceito: false }))
  const resultado = await executar(['perguntar', 'Qual?', 'a', 'b'], { ...deps, esperar })
  assert.equal(resultado.codigo, 3)
  assert.match(resultado.saida, /dispensou/)
})

test('perguntar: sem resposta no prazo, avisa e diz como conferir depois', async () => {
  const { deps } = dependencias()
  const resultado = await executar(['perguntar', 'Qual?', 'a', 'b'], { ...deps, esperar: async () => {}, esperaMaximaMs: 1000 })
  assert.equal(resultado.codigo, 1)
  assert.match(resultado.saida, /ninguém respondeu a tempo/)
  assert.match(resultado.saida, /canvas ver-pedido/)
})

test('browser open --embedded --profile=Nome registra o perfil no pedido', async () => {
  const { pasta, deps } = dependencias()
  const resultado = await executar(['browser', 'open', 'https://example.com', '--embedded', '--profile=Trabalho'], deps)

  assert.equal(resultado.codigo, 0)
  assert.match(resultado.saida, /Perfil: Trabalho/)
  const [pedido] = criarRepositorioDePedidos({ pasta }).listarPendentes({ acao: 'abrir-pagina' })
  assert.equal(pedido.perfil, 'Trabalho')
  assert.equal(pedido.modo, 'embutido')
})

test('--perfil= é aceito como sinônimo e nomes com espaço funcionam entre aspas', async () => {
  const { pasta, deps } = dependencias()
  await executar(['navegador', 'abrir', 'https://example.com', '--embutido', '--perfil=Conta Pessoal'], deps)
  const [pedido] = criarRepositorioDePedidos({ pasta }).listarPendentes({ acao: 'abrir-pagina' })
  assert.equal(pedido.perfil, 'Conta Pessoal')
})

test('--profile sem valor, ou perfil sem --embedded, é erro de uso e não registra pedido', async () => {
  const { pasta, deps } = dependencias()
  const semValor = await executar(['browser', 'open', 'https://example.com', '--embedded', '--profile'], deps)
  assert.equal(semValor.codigo, 2)
  assert.match(semValor.erro, /--profile=<nome>/)

  const externo = await executar(['browser', 'open', 'https://example.com', '--profile=Trabalho'], deps)
  assert.equal(externo.codigo, 2)
  assert.match(externo.erro, /--embedded/)
  assert.deepEqual(criarRepositorioDePedidos({ pasta }).listarPendentes(), [])
})

test('flags booleanas de sempre continuam booleanas (--json, --cache)', () => {
  const { opcoes } = interpretarArgumentos(['fetch-all', 'varrer', '--cache', '--json', '--profile=X'])
  assert.equal(opcoes.cache, true)
  assert.equal(opcoes.json, true)
  assert.equal(opcoes.profile, 'X')
})

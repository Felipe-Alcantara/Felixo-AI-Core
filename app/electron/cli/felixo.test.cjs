const test = require('node:test')
const assert = require('node:assert/strict')
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
      ...extras.deps,
    },
  }
}

test('interpretarArgumentos separa verbo de opção', () => {
  assert.deepEqual(interpretarArgumentos(['fetch-all', 'varrer', '--cache', '--json']), {
    ferramenta: 'fetch-all',
    verbo: 'varrer',
    argumento: '',
    opcoes: { cache: true, json: true },
  })
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

test('varrer imprime o plano, o relatório e o aviso de escrita', async () => {
  const { deps } = dependencias()

  const resultado = await executar(['fetch-all', 'varrer'], deps)

  assert.equal(resultado.codigo, 0)
  assert.match(resultado.saida, /2 repositório\(s\) analisado\(s\)/)
  assert.match(resultado.saida, /\/repos\/atrasado — Precisa de pull \(3 atrás, main\)/)
  assert.match(resultado.saida, /\/relatorios\/fetch-all\/2026\.md/)
  // O aviso não é decoração: é o que impede o agente de procurar como escrever.
  assert.ok(resultado.saida.includes(AVISO_ESCRITA))
})

test('varrer --json entrega o plano cru com o caminho do relatório', async () => {
  const { deps } = dependencias()

  const resultado = await executar(['fetch-all', 'varrer', '--json'], deps)
  const dados = JSON.parse(resultado.saida)

  assert.equal(dados.plan.total, 2)
  assert.equal(dados.reportPath, '/relatorios/fetch-all/2026.md')
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

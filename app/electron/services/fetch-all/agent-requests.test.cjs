const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  ESTADOS,
  VALIDADE_MS,
  criarRepositorioDePedidos,
  normalizarPedido,
} = require('./agent-requests.cjs')

function pastaTemporaria() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-pedidos-'))
}

test('normalizarPedido recusa qualquer ação fora da lista fechada', () => {
  assert.deepEqual(normalizarPedido('executar-plano'), {
    acao: 'executar-plano',
    comCommit: false,
  })
  assert.deepEqual(normalizarPedido('executar-plano', { comCommit: true }), {
    acao: 'executar-plano',
    comCommit: true,
  })

  // O ponto da lista fechada: nada que o painel não faria pode ser pedido.
  for (const invalida of ['push', 'rm -rf /', '', null, 'executar-plano ; push']) {
    assert.throws(() => normalizarPedido(invalida), /Ação não reconhecida/)
  }
})

test('comCommit só é verdadeiro quando vem exatamente true', () => {
  // Um pedido vindo de fora não pode ligar o commit automático por descuido de
  // tipo ("true", 1, {}). O commit é a escrita mais difícil de desfazer.
  for (const valor of ['true', 1, {}, [], 'sim']) {
    assert.equal(normalizarPedido('executar-plano', { comCommit: valor }).comCommit, false)
  }
})

test('registrar grava o pedido pendente e listarPendentes o devolve', () => {
  const pasta = pastaTemporaria()
  const repositorio = criarRepositorioDePedidos({ pasta })

  const pedido = repositorio.registrar('executar-plano', { origem: '/tmp/projeto' })

  assert.equal(pedido.estado, ESTADOS.pendente)
  assert.equal(pedido.origem, '/tmp/projeto')
  assert.deepEqual(
    repositorio.listarPendentes().map((item) => item.id),
    [pedido.id],
  )
})

test('pedido velho não acende a tela', () => {
  const pasta = pastaTemporaria()
  let instante = Date.parse('2026-08-24T09:00:00.000Z')
  const repositorio = criarRepositorioDePedidos({ pasta, agora: () => instante })

  repositorio.registrar('executar-plano')
  instante += VALIDADE_MS + 1000

  assert.deepEqual(repositorio.listarPendentes(), [])
})

test('resolver marca o desfecho e tira o pedido da fila', () => {
  const pasta = pastaTemporaria()
  const repositorio = criarRepositorioDePedidos({ pasta })
  const pedido = repositorio.registrar('executar-plano')

  const resolvido = repositorio.resolver(pedido.id, {
    aceito: true,
    resultado: { ok: true },
  })

  assert.equal(resolvido.estado, ESTADOS.aceito)
  assert.deepEqual(resolvido.resultado, { ok: true })
  assert.deepEqual(repositorio.listarPendentes(), [])
  assert.equal(repositorio.ler(pedido.id).estado, ESTADOS.aceito)
})

test('qualquer desfecho que não seja aceito explícito é recusa', () => {
  const pasta = pastaTemporaria()
  const repositorio = criarRepositorioDePedidos({ pasta })

  for (const desfecho of [{ aceito: false }, {}, { aceito: 'true' }, undefined]) {
    const pedido = repositorio.registrar('executar-plano')
    assert.equal(repositorio.resolver(pedido.id, desfecho).estado, ESTADOS.recusado)
  }
})

test('id malicioso não escapa da pasta de pedidos', () => {
  const pasta = pastaTemporaria()
  const alvo = path.join(pasta, '..', 'vitima.json')
  fs.writeFileSync(alvo, '{"id":"vitima","estado":"pendente"}', 'utf8')
  const repositorio = criarRepositorioDePedidos({ pasta })

  assert.equal(repositorio.resolver('../vitima', { aceito: true }), null)
  assert.equal(fs.readFileSync(alvo, 'utf8'), '{"id":"vitima","estado":"pendente"}')
})

test('arquivo corrompido não derruba a listagem dos pedidos legítimos', () => {
  const pasta = pastaTemporaria()
  const repositorio = criarRepositorioDePedidos({ pasta })
  const pedido = repositorio.registrar('executar-plano')
  fs.writeFileSync(path.join(pasta, 'quebrado.json'), '{ nao é json', 'utf8')

  assert.deepEqual(
    repositorio.listarPendentes().map((item) => item.id),
    [pedido.id],
  )
})

test('pasta inexistente equivale a nenhum pedido', () => {
  const repositorio = criarRepositorioDePedidos({
    pasta: path.join(pastaTemporaria(), 'nunca-criada'),
  })

  assert.deepEqual(repositorio.listarPendentes(), [])
  assert.equal(repositorio.ler('seja-o-que-for'), null)
})

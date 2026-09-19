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

test('abrir-pagina aceita apenas URL web e os dois destinos fechados', () => {
  assert.deepEqual(normalizarPedido('abrir-pagina', {
    url: ' https://example.com/docs ',
    modo: 'embutido',
  }), {
    acao: 'abrir-pagina',
    comCommit: false,
    url: 'https://example.com/docs',
    modo: 'embutido',
  })

  assert.deepEqual(normalizarPedido('abrir-pagina', {
    url: 'http://localhost:4173',
  }), {
    acao: 'abrir-pagina',
    comCommit: false,
    url: 'http://localhost:4173',
    modo: 'externo',
  })

  for (const url of ['file:///tmp/a', 'javascript:alert(1)', 'data:text/html,oi', 'nao-e-url']) {
    assert.throws(() => normalizarPedido('abrir-pagina', { url }), /URL http/)
  }
  assert.throws(
    () => normalizarPedido('abrir-pagina', { url: 'https://example.com', modo: 'janela' }),
    /Modo de abertura/,
  )
})

test('canvas-listar não exige nenhum campo extra', () => {
  assert.deepEqual(normalizarPedido('canvas-listar'), {
    acao: 'canvas-listar',
    comCommit: false,
  })
})

test('canvas-ler exige o id do elemento, aparado de espaço', () => {
  assert.deepEqual(normalizarPedido('canvas-ler', { idDoElemento: '  terminal-abc  ' }), {
    acao: 'canvas-ler',
    comCommit: false,
    idDoElemento: 'terminal-abc',
  })
  assert.throws(() => normalizarPedido('canvas-ler', {}), /id do elemento/)
  assert.throws(() => normalizarPedido('canvas-ler', { idDoElemento: '   ' }), /id do elemento/)
})

test('canvas-escrever exige id e conteúdo (mesmo vazio, mas string)', () => {
  assert.deepEqual(
    normalizarPedido('canvas-escrever', { idDoElemento: '  nota-1  ', conteudo: 'texto novo' }),
    { acao: 'canvas-escrever', comCommit: false, idDoElemento: 'nota-1', conteudo: 'texto novo' },
  )
  // Conteúdo vazio é um pedido válido (limpar a nota), desde que seja string.
  assert.deepEqual(normalizarPedido('canvas-escrever', { idDoElemento: 'nota-1', conteudo: '' }), {
    acao: 'canvas-escrever',
    comCommit: false,
    idDoElemento: 'nota-1',
    conteudo: '',
  })
  assert.throws(() => normalizarPedido('canvas-escrever', { conteudo: 'x' }), /id do elemento/)
  assert.throws(() => normalizarPedido('canvas-escrever', { idDoElemento: 'nota-1' }), /conteúdo/)
  assert.throws(
    () => normalizarPedido('canvas-escrever', { idDoElemento: 'nota-1', conteudo: 'x'.repeat(20001) }),
    /muito grande/,
  )
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

test('listarPendentes pode separar consumidores da mesma fila', () => {
  const pasta = pastaTemporaria()
  const repositorio = criarRepositorioDePedidos({ pasta })
  const fetchAll = repositorio.registrar('executar-plano')
  const browser = repositorio.registrar('abrir-pagina', { url: 'https://example.com' })

  assert.deepEqual(
    repositorio.listarPendentes({ acao: 'executar-plano' }).map((item) => item.id),
    [fetchAll.id],
  )
  assert.deepEqual(
    repositorio.listarPendentes({ acao: 'abrir-pagina' }).map((item) => item.id),
    [browser.id],
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

test('perguntar exige pergunta e de 2 a 4 opções, com texto', () => {
  const ok = normalizarPedido('perguntar', { pergunta: '  Qual banco? ', opcoes: ['SQLite', { label: 'Postgres', descricao: 'servidor' }] })
  assert.deepEqual(ok, {
    acao: 'perguntar',
    comCommit: false,
    pergunta: 'Qual banco?',
    opcoes: [{ label: 'SQLite' }, { label: 'Postgres', descricao: 'servidor' }],
  })
  assert.throws(() => normalizarPedido('perguntar', { opcoes: ['a', 'b'] }), /Informe a pergunta/)
  assert.throws(() => normalizarPedido('perguntar', { pergunta: 'x', opcoes: ['a'] }), /2 a 4 opções/)
  assert.throws(() => normalizarPedido('perguntar', { pergunta: 'x', opcoes: ['a', 'b', 'c', 'd', 'e'] }), /2 a 4 opções/)
  assert.throws(() => normalizarPedido('perguntar', { pergunta: 'x', opcoes: ['a', '  '] }), /texto/)
  assert.throws(() => normalizarPedido('perguntar', { pergunta: 'x'.repeat(501), opcoes: ['a', 'b'] }), /muito grande/)
  assert.throws(() => normalizarPedido('perguntar', { pergunta: 'x', opcoes: ['a', 'b'.repeat(121)] }), /muito grande/)
})

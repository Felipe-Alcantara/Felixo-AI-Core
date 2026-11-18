'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const Module = require('node:module')
const originalLoad = Module._load
const handlers = new Map()
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') return { ipcMain: { handle: (name, handler) => handlers.set(name, handler) } }
  return originalLoad.call(this, request, parent, isMain)
}
const { LAUNCH_ACTION, planLaunch, registerAgentLaunchIpcHandlers } = require('./agent-launch-ipc-handlers.cjs')
const { VALIDADE_MS } = require('./fetch-all/agent-requests.cjs')
Module._load = originalLoad

const TASKS = (quantidade) => Array.from({ length: quantidade }, (_, indice) => `Task ${indice + 1}\ncontexto ${indice + 1}`)

function setup({ settings = { maxAgentsPerTurn: 3, maxTotalAgents: 10 }, agora } = {}) {
  handlers.clear()
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-launch-'))
  const controller = registerAgentLaunchIpcHandlers({
    getMainWindow: () => undefined,
    appPaths: { agentRequests: path.join(root, 'agent-requests') },
    dependencies: { loadSettings: async () => settings, ...(agora ? { agora } : {}) },
  })
  const pedir = (quantidade) => controller.pedidos.registrar(LAUNCH_ACTION, { tarefas: TASKS(quantidade) })
  const decidir = (params) => handlers.get('canvas:decide-agent-launch')(null, params)
  const cleanup = () => {
    controller.pararDeObservarPedidos()
    fs.rmSync(root, { recursive: true, force: true })
  }
  return { controller, pedir, decidir, cleanup }
}

test('planLaunch: pedido dentro dos tetos abre tudo', () => {
  const plano = planLaunch([{ titulo: 'a' }, { titulo: 'b' }, { titulo: 'c' }], { maxAgentsPerTurn: 3, maxTotalAgents: 10 }, 0)
  assert.equal(plano.abrir, 3)
  assert.deepEqual(plano.recusadas, [])
})

test('planLaunch: o excedente de "Agentes por rodada" é recusado, com o motivo', () => {
  const plano = planLaunch(TASKS(5).map((titulo) => ({ titulo })), { maxAgentsPerTurn: 3, maxTotalAgents: 10 }, 0)
  assert.equal(plano.abrir, 3)
  assert.equal(plano.recusadas.length, 2)
  assert.match(plano.recusadas[0].motivo, /Agentes por rodada/)
})

test('planLaunch: "Agentes no total" conta o que já foi aberto', () => {
  const plano = planLaunch([{ titulo: 'a' }, { titulo: 'b' }, { titulo: 'c' }], { maxAgentsPerTurn: 3, maxTotalAgents: 10 }, 8)
  assert.equal(plano.abrir, 2)
  assert.match(plano.recusadas[0].motivo, /Agentes no total/)
})

test('planLaunch: sem configuração usa os padrões e em "Somente leitura" não abre nada', () => {
  assert.equal(planLaunch(TASKS(5).map((titulo) => ({ titulo })), undefined, 0).abrir, 3)
  const leitura = planLaunch([{ titulo: 'a' }], { mode: 'read_only' }, 0)
  assert.equal(leitura.abrir, 0)
  assert.match(leitura.recusadas[0].motivo, /Somente leitura/)
})

test('aceitar abre as tasks do PEDIDO, não as que o renderer mandar', async () => {
  const { controller, pedir, decidir, cleanup } = setup()
  try {
    const pedido = pedir(3)
    const resultado = await decidir({ id: pedido.id, aceitar: true, tarefas: [{ titulo: 'forjada' }] })

    assert.equal(resultado.ok, true)
    assert.deepEqual(resultado.abrir.map((tarefa) => tarefa.titulo), ['Task 1', 'Task 2', 'Task 3'])
    assert.equal(resultado.abrir[0].contexto, 'contexto 1')
    const gravado = controller.pedidos.ler(pedido.id)
    assert.equal(gravado.estado, 'aceito')
    assert.equal(gravado.resultado.abertas, 3)
  } finally {
    cleanup()
  }
})

test('pedido acima de "Agentes por rodada" abre só o teto e grava o que recusou', async () => {
  const { controller, pedir, decidir, cleanup } = setup()
  try {
    const pedido = pedir(5)
    const resultado = await decidir({ id: pedido.id, aceitar: true })

    assert.equal(resultado.abrir.length, 3)
    assert.equal(resultado.recusadas.length, 2)
    const gravado = controller.pedidos.ler(pedido.id)
    assert.equal(gravado.resultado.abertas, 3)
    assert.deepEqual(gravado.resultado.recusadas.map((item) => item.titulo), ['Task 4', 'Task 5'])
  } finally {
    cleanup()
  }
})

test('o teto "Agentes no total" vale entre pedidos da mesma sessão', async () => {
  const { pedir, decidir, cleanup } = setup({ settings: { maxAgentsPerTurn: 3, maxTotalAgents: 4 } })
  try {
    assert.equal((await decidir({ id: pedir(3).id, aceitar: true })).abrir.length, 3)
    const segundo = await decidir({ id: pedir(3).id, aceitar: true })
    assert.equal(segundo.abrir.length, 1)
    const terceiro = await decidir({ id: pedir(2).id, aceitar: true })
    assert.equal(terceiro.abrir.length, 0)
    assert.match(terceiro.message, /Agentes no total/)
  } finally {
    cleanup()
  }
})

test('recusar resolve como recusado pela pessoa e não abre nada', async () => {
  const { controller, pedir, decidir, cleanup } = setup()
  try {
    const pedido = pedir(2)
    const resultado = await decidir({ id: pedido.id, aceitar: false })

    assert.deepEqual(resultado.abrir, [])
    const gravado = controller.pedidos.ler(pedido.id)
    assert.equal(gravado.estado, 'recusado')
    assert.equal(gravado.resultado.recusadoPor, 'pessoa')
  } finally {
    cleanup()
  }
})

test('em "Somente leitura" o aceite vira recusa do app e nada abre', async () => {
  const { controller, pedir, decidir, cleanup } = setup({ settings: { mode: 'read_only', maxAgentsPerTurn: 3 } })
  try {
    const pedido = pedir(2)
    const resultado = await decidir({ id: pedido.id, aceitar: true })

    assert.deepEqual(resultado.abrir, [])
    assert.match(resultado.message, /Somente leitura/)
    assert.equal(controller.pedidos.ler(pedido.id).resultado.recusadoPor, 'app')
  } finally {
    cleanup()
  }
})

test('pedido que já foi decidido não abre de novo', async () => {
  const { pedir, decidir, cleanup } = setup()
  try {
    const pedido = pedir(2)
    assert.equal((await decidir({ id: pedido.id, aceitar: true })).abrir.length, 2)
    const repetido = await decidir({ id: pedido.id, aceitar: true })
    assert.deepEqual(repetido.abrir, [])
    assert.match(repetido.message, /não está mais pendente/)
    const inexistente = await decidir({ id: 'nao-existe', aceitar: true })
    assert.match(inexistente.message, /não está mais pendente/)
  } finally {
    cleanup()
  }
})

test('pedido vencido é recusado como expirado, mesmo com a pessoa aceitando', async () => {
  let agora = Date.now()
  const { controller, pedir, decidir, cleanup } = setup({ agora: () => agora })
  try {
    const pedido = pedir(2)
    agora += VALIDADE_MS + 1000
    const resultado = await decidir({ id: pedido.id, aceitar: true })

    assert.deepEqual(resultado.abrir, [])
    assert.equal(controller.pedidos.ler(pedido.id).resultado.expirou, true)
  } finally {
    cleanup()
  }
})

test('lote da pessoa: o plano respeita os tetos e soma no mesmo contador do pedido do coordenador', async () => {
  const { pedir, decidir, cleanup } = setup({ settings: { maxAgentsPerTurn: 3, maxTotalAgents: 4 } })
  try {
    const planejar = (count) => handlers.get('canvas:plan-agent-launch')(null, { count })

    const primeiro = await planejar(5)
    assert.equal(primeiro.ok, true)
    assert.equal(primeiro.abrir, 3)
    assert.match(primeiro.message, /Agentes por rodada/)

    // O coordenador pede depois: o que a pessoa já abriu conta no total.
    const coordenador = await decidir({ id: pedir(3).id, aceitar: true })
    assert.equal(coordenador.abrir.length, 1)

    const esgotado = await planejar(2)
    assert.equal(esgotado.abrir, 0)
    assert.match(esgotado.message, /Agentes no total/)
  } finally {
    cleanup()
  }
})

test('lote da pessoa: quantidade inválida não abre nada nem gasta o contador', async () => {
  const { cleanup } = setup({ settings: { maxAgentsPerTurn: 3, maxTotalAgents: 3 } })
  try {
    const planejar = (params) => handlers.get('canvas:plan-agent-launch')(null, params)

    for (const count of [0, -1, 1.5, 21, '3x', undefined]) {
      const resultado = await planejar({ count })
      assert.equal(resultado.abrir, 0)
      assert.match(resultado.message, /inválida/)
    }
    assert.equal((await planejar({ count: 3 })).abrir, 3)
  } finally {
    cleanup()
  }
})

test('lote da pessoa em "Somente leitura" não abre nada', async () => {
  const { cleanup } = setup({ settings: { mode: 'read_only' } })
  try {
    const resultado = await handlers.get('canvas:plan-agent-launch')(null, { count: 2 })
    assert.equal(resultado.abrir, 0)
    assert.match(resultado.message, /Somente leitura/)
  } finally {
    cleanup()
  }
})

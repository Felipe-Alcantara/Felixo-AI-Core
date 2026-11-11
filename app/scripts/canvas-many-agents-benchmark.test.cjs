'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const bench = require('./canvas-many-agents-benchmark.cjs')

test('argumentos padrão medem o cenário Carregado da política', () => {
  const options = bench.parseArgs([])
  assert.equal(options.agents, 20)
  assert.equal(options.nodes, 300)
  assert.equal(options.check, false)
  assert.equal(bench.budgetScenario(options.agents, options.nodes), 'carregado')
  assert.deepEqual(bench.parseArgs(['--agents=9', '--nodes=0', '--check']).agents, 9)
  assert.throws(() => bench.parseArgs(['--agents=0']), /entre 1 e 60/)
  assert.throws(() => bench.parseArgs(['--duration-ms=1000']), /entre 3000 e 600000/)
  assert.throws(() => bench.parseArgs(['--agentes=3']), /Opção desconhecida/)
})

test('o cenário segue as faixas da política e não tem meta acima do Carregado', () => {
  assert.equal(bench.budgetScenario(9, 300), 'leve')
  assert.equal(bench.budgetScenario(10, 300), 'carregado')
  assert.equal(bench.budgetScenario(20, 1000), 'carregado')
  assert.equal(bench.budgetScenario(21, 10), null)
  assert.equal(bench.budgetScenario(5, 1001), null)
})

test('o fixture liga cada agente a uma nota e só usa a CLI falsa', () => {
  const { nodes, edges, agentIds, typingId } = bench.buildFixture(3, 12)
  assert.deepEqual(agentIds, ['bench-agente-0', 'bench-agente-1', 'bench-agente-2'])
  // Mais o terminal parado da digitação, que não recebe o gatilho de streaming.
  assert.equal(nodes.length, 16)
  assert.equal(agentIds.includes(typingId), false)
  assert.equal(nodes.find((node) => node.id === typingId).type, 'terminal')
  const agents = nodes.filter((node) => node.type === 'terminal')
  assert.ok(agents.every((node) => node.data.command === 'mock' && node.data.launchMode === 'agent'))
  const ids = new Set(nodes.map((node) => node.id))
  assert.ok(edges.every((edge) => ids.has(edge.source) && ids.has(edge.target)))
  assert.equal(edges.filter((edge) => agentIds.includes(edge.source)).length, 3)
  assert.deepEqual(bench.buildFixture(2, 0).edges, [])
})

test('as estatísticas usam o formato do terminal-scrollback e ignoram lacunas', () => {
  assert.deepEqual(bench.stats([10, 20, 30, Number.NaN]), { count: 3, p50: 20, p95: 29, max: 30 })
  assert.deepEqual(bench.stats([]), { count: 0, p50: null, p95: null, max: null })
})

function result(overrides = {}) {
  return {
    count: 20,
    agentsWithOutput: 20,
    crashed: null,
    budgetScenario: 'carregado',
    frameReliable: true,
    frameMs: { p95: 100 },
    longTaskMs: { p95: 200 },
    resumeMs: 3_000,
    ...overrides,
  }
}

test('o --check reprova queda, agente mudo e meta estourada', () => {
  assert.deepEqual(bench.checkReport(result()), [])
  assert.match(bench.checkReport(result({ crashed: 'crash' })).join(), /renderer caiu/)
  assert.match(bench.checkReport(result({ agentsWithOutput: 19 })).join(), /só 19 de 20 agentes/)
  assert.match(bench.checkReport(result({ frameMs: { p95: 161 } })).join(), /frame p95 161 ms acima da meta 160/)
  assert.match(bench.checkReport(result({ longTaskMs: { p95: 421 } })).join(), /long task p95 421/)
  assert.match(bench.checkReport(result({ resumeMs: 9_001 })).join(), /refresh 9001 ms/)
  // Sem long task nenhuma o p95 é nulo, e isso não é falha.
  assert.deepEqual(bench.checkReport(result({ longTaskMs: { p95: null } })), [])
})

test('o --check ignora o frame de janela estrangulada e não tem meta acima do orçamento', () => {
  assert.deepEqual(bench.checkReport(result({ frameReliable: false, frameMs: { p95: 500 } })), [])
  assert.deepEqual(bench.checkReport(result({ budgetScenario: null, resumeMs: 60_000 })), [])
  assert.match(bench.checkReport(result({ budgetScenario: null, crashed: 'crash' })).join(), /renderer caiu/)
})

test('o contador de timers acompanha agendar, disparar e cancelar sem mudar o comportamento', async (t) => {
  const listeners = []
  globalThis.window = {
    setTimeout,
    setInterval,
    clearTimeout,
    clearInterval,
    felixo: { pty: { onData: (callback) => listeners.push(callback) } },
  }
  t.after(() => { delete globalThis.window })
  bench.instrumentPage()
  const { timers, sessionsWithOutput } = globalThis.window.__felixoManyAgents

  const received = []
  globalThis.window.setTimeout((value) => received.push(value), 0, 'ok')
  const cancelled = globalThis.window.setTimeout(() => received.push('não'), 0)
  const interval = globalThis.window.setInterval(() => {}, 1_000)
  assert.deepEqual(timers(), { timeouts: 2, intervals: 1 })

  globalThis.window.clearTimeout(cancelled)
  // clearTimeout também cancela intervalo, como no navegador.
  globalThis.window.clearTimeout(interval)
  assert.deepEqual(timers(), { timeouts: 1, intervals: 0 })

  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.deepEqual(received, ['ok'])
  assert.deepEqual(timers(), { timeouts: 0, intervals: 0 })

  listeners[0]({ sessionId: 'canvas:bench-agente-0', data: 'x' })
  listeners[0]({ sessionId: 'canvas:bench-agente-0', data: 'y' })
  assert.deepEqual(sessionsWithOutput(), ['canvas:bench-agente-0'])
})

test('as teclas do eco nunca saem no roteiro nem no eco do gatilho de streaming', () => {
  const { createFakeCliPtyFactory, SMOKE_STREAM_TRIGGER } = require('../electron/services/devtools-fake-cli-pty.cjs')
  const queue = []
  const factory = createFakeCliPtyFactory({ chunkDelayMs: 0, setTimer: (fn) => queue.push(fn), clearTimer: () => {} })
  const pty = factory('claude', [], { cols: 80, rows: 24 })
  let output = ''
  pty.onData((data) => {
    output += data
  })
  while (queue.length) queue.shift()()
  output = ''

  pty.write(`${SMOKE_STREAM_TRIGGER}\r`)
  while (queue.length) queue.shift()()

  assert.match(output, /linha 60 de 60/)
  for (const key of bench.ECHO_KEYS) assert.equal(output.includes(key), false, `"${key}" aparece na saída`)
})

test('cada fase vira um resultado do gate, com eco, nós fora da área e mutações por segundo', () => {
  const phase = bench.summarizePhase(
    {
      phase: 'gaveta-aberta',
      elapsedMs: 4_000,
      frames: [16, 17, 50],
      longTasks: [],
      input: [8, 12],
      keyEcho: [20, 30],
      mounted: [320, 320],
      mountedOutside: [300, 298],
      outsideMutations: 10,
      insideMutations: 40,
      rss: [{ rendererMiB: 500 }],
    },
    { count: 20, nodes: 320, edges: 219, budgetScenario: 'carregado' },
    true,
  )

  assert.equal(phase.phase, 'canvas-many-agents:gaveta-aberta')
  assert.equal(phase.nodes, 320)
  assert.deepEqual(phase.keyEchoMs, { count: 2, p50: 25, p95: 29.5, max: 30 })
  assert.equal(phase.longTaskMs.count, 0)
  assert.equal(phase.mountedOutsideViewport.max, 300)
  assert.equal(phase.outsideMutationsPerSecond, 2.5)
  assert.equal(phase.insideMutationsPerSecond, 10)
  // Uma fase não tem os campos do resultado principal: o --check só olha as metas dela.
  assert.deepEqual(bench.checkReport(phase), [])
  assert.match(bench.checkReport({ ...phase, longTaskMs: { p95: 500 } }).join(), /long task p95 500 .*\[gaveta-aberta\]/)
})

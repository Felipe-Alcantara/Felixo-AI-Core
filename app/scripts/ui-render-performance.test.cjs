'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const bench = require('./ui-render-performance.cjs')

test('argumentos padrão medem a GPU padrão com três rodadas', () => {
  const options = bench.parseArgs([])
  assert.equal(options.gpu, 'padrao')
  assert.equal(options.render, 'gpu')
  assert.equal(options.rounds, 3)
  assert.equal(options.appDir, path.resolve(__dirname, '..'))
})

test('argumentos inválidos falham com mensagem que diz o formato certo', () => {
  assert.throws(() => bench.parseArgs(['--gpu=nvidia']), /padrao, integrada ou dedicada/)
  assert.throws(() => bench.parseArgs(['--render=cpu']), /gpu ou software/)
  assert.throws(() => bench.parseArgs(['--rounds=0']), /entre 1 e 10/)
  assert.throws(() => bench.parseArgs(['--nodes=1000']), /entre 4 e 200/)
  assert.throws(() => bench.parseArgs(['--desconhecido']), /Argumento desconhecido/)
})

test('GPU dedicada pede offload PRIME no GLX; integrada limpa o offload herdado', () => {
  const herdado = { __NV_PRIME_RENDER_OFFLOAD: '1', __GLX_VENDOR_LIBRARY_NAME: 'nvidia', PATH: '/bin' }
  const integrada = bench.gpuEnvironment('integrada', 'linux', herdado)
  assert.equal(integrada.__NV_PRIME_RENDER_OFFLOAD, undefined)
  assert.equal(integrada.__GLX_VENDOR_LIBRARY_NAME, undefined)
  assert.equal(integrada.PATH, '/bin')

  const dedicada = bench.gpuEnvironment('dedicada', 'linux', { PATH: '/bin' })
  assert.equal(dedicada.__NV_PRIME_RENDER_OFFLOAD, '1')
  assert.equal(dedicada.__VK_LAYER_NV_optimus, 'NVIDIA_only')
  // O offload pelo GLX derruba o GL do Chromium no X11 ("Invalid visual ID").
  assert.equal(dedicada.__GLX_VENDOR_LIBRARY_NAME, undefined)

  assert.deepEqual(bench.gpuEnvironment('padrao', 'win32', herdado), herdado)
  assert.throws(() => bench.gpuEnvironment('dedicada', 'win32', {}), /só é suportado no Linux/)
})

test('estatística de frames conta quadros lentos e ignora intervalos inválidos', () => {
  const stats = bench.frameStats([16, 17, 40, Number.NaN, -1, 100], 1_000)
  assert.equal(stats.frames, 4)
  assert.equal(stats.fps, 4)
  assert.equal(stats.acimaDe25Ms, 2)
  assert.equal(stats.p50Ms, 28.5)
})

test('o tracing soma só eventos completos do renderer medido, por categoria', () => {
  const events = [
    { name: 'UpdateLayoutTree', ph: 'X', dur: 2_000, pid: 7 },
    { name: 'Layout', ph: 'X', dur: 1_000, pid: 7 },
    { name: 'Paint', ph: 'X', dur: 3_000, pid: 7 },
    { name: 'Paint', ph: 'X', dur: 9_000, pid: 99 },
    { name: 'Paint', ph: 'B', pid: 7 },
    { name: 'Desconhecido', ph: 'X', dur: 5_000, pid: 7 },
  ]
  const summary = bench.summarizeTrace(events, 7)
  assert.equal(summary.estiloMs, 2)
  assert.equal(summary.layoutMs, 1)
  assert.equal(summary.paintMs, 3)
  assert.equal(summary.paintEventos, 1)
})

test('o pid do renderer vem do quadro principal do TracingStartedInBrowser', () => {
  const events = [
    { name: 'TracingStartedInBrowser', args: { data: { frames: [{ processId: 11, parent: 'x' }, { processId: 42 }] } } },
    { name: 'SetLayerTreeId', pid: 5 },
  ]
  assert.equal(bench.rendererPidFromTrace(events), 42)
  assert.equal(bench.rendererPidFromTrace([{ name: 'SetLayerTreeId', pid: 5 }]), 5)
  assert.equal(bench.rendererPidFromTrace([]), null)
})

test('o fixture tem IDs únicos, os três tipos de bloco e conexões entre notas', () => {
  const nodes = bench.buildFixtureNodes(24)
  assert.equal(nodes.length, 24)
  assert.equal(new Set(nodes.map((node) => node.id)).size, 24)
  assert.deepEqual([...new Set(nodes.map((node) => node.type))].sort(), ['file', 'group', 'note'])
  const edges = bench.buildFixtureEdges(nodes)
  const noteIds = new Set(nodes.filter((node) => node.type === 'note').map((node) => node.id))
  assert.ok(edges.length > 0)
  assert.ok(edges.every((edge) => noteIds.has(edge.source) && noteIds.has(edge.target)))
})

test('as rodadas alternam qual modo vai primeiro', () => {
  assert.deepEqual(bench.roundOrder(2), [
    { round: 1, mode: 'off' },
    { round: 1, mode: 'on' },
    { round: 2, mode: 'on' },
    { round: 2, mode: 'off' },
  ])
})

test('o resumo usa a mediana por modo e o custo por quadro', () => {
  const run = (mode, fps, estilo, frames) => ({
    mode,
    frames: { fps, p95Ms: 1, p99Ms: 1, acimaDe25Ms: 0, frames },
    trace: { estiloMs: estilo, layoutMs: 0, paintMs: 0, composicaoMs: 0, scriptMs: 0 },
    porQuadro: bench.perFrame({ estiloMs: estilo, layoutMs: 0, paintMs: 0, composicaoMs: 0 }, frames),
    longTasks: { count: 0, totalMs: 0 },
  })
  const summary = bench.summarizeRuns([run('off', 10, 100, 50), run('off', 30, 300, 150), run('off', 20, 200, 100), run('on', 50, 60, 300)])
  assert.equal(summary.off.fps, 20)
  assert.equal(summary.off.estiloMs, 200)
  assert.equal(summary.off.estiloPorQuadroMs, 2)
  assert.equal(summary.on.rodadas, 1)
  assert.equal(bench.perFrame({ estiloMs: 1, layoutMs: 1, paintMs: 1, composicaoMs: 1 }, 0).estiloMs, null)
})

test('backend do ANGLE: dedicada só com Vulkan, integrada só com GL', () => {
  assert.deepEqual(bench.chromiumArgs({ gpu: 'integrada', angle: 'gl' }), [])
  assert.deepEqual(bench.chromiumArgs({ gpu: 'dedicada', angle: 'vulkan' })[0], '--use-angle=vulkan')
  assert.throws(() => bench.chromiumArgs({ gpu: 'dedicada', angle: 'gl' }), /exige --angle=vulkan/)
  assert.throws(() => bench.chromiumArgs({ gpu: 'integrada', angle: 'vulkan' }), /escolhe a GPU dedicada/)
})

test('a medição falha se a GPU que renderizou não é a pedida', () => {
  const intel = { renderer: 'ANGLE (Intel)', ativa: { vendorId: 0x8086 } }
  const nvidia = { renderer: 'ANGLE (NVIDIA)', ativa: { vendorId: 0x10de } }
  const semGpu = { renderer: 'Disabled', ativa: { vendorId: 0 } }
  assert.doesNotThrow(() => bench.assertRequestedGpu('integrada', intel))
  assert.doesNotThrow(() => bench.assertRequestedGpu('dedicada', nvidia))
  assert.throws(() => bench.assertRequestedGpu('integrada', nvidia), /pedida a GPU integrada/)
  assert.throws(() => bench.assertRequestedGpu('dedicada', intel), /pedida a GPU dedicada/)
  assert.throws(() => bench.assertRequestedGpu('dedicada', semGpu), /não subiu/)
  assert.doesNotThrow(() => bench.assertRequestedGpu('padrao', semGpu))
})

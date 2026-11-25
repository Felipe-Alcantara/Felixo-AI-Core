'use strict'
require('./test-support/pasta-do-teste.cjs') // isola o temporário deste arquivo (ver pasta-do-teste.cjs)

const test = require('node:test')
const assert = require('node:assert/strict')
const { build, describeBackend } = require('./ui-render-compare.cjs')

const config = { rounds: 5, warmup: 1, durationMs: 3000, nodes: 48, edges: 31, onboarding: false, cpuThrottle: 4 }
const hw = { cpu: 'x', nucleos: 8, ramGiB: 16, windows: '10', gpus: [], alimentacao: '', cargaDeFundo: '' }
const gpu = { renderer: 'ANGLE (Intel(R) UHD Graphics)', ativa: { vendorId: 0x8086 } }
const run = (mode, round, fps, p95, estilo) => ({ mode, round, sidebarToggleCount: 2, frames: { fps, p95Ms: p95 }, porQuadro: { estiloMs: estilo } })
const baseline = {
  render: 'gpu', gpu, config, baselineCommit: 'b9e3555',
  runs: [], summary: { baseline: { fps: 40, frameP95Ms: 50, estiloPorQuadroMs: 1.4 } },
}
const current = (fps) => ({
  render: 'gpu', gpu, config,
  runs: [1, 2, 3, 4, 5].map((r) => run('on', r, fps, 45, 0.9)),
  summary: { off: { fps: 18, frameP95Ms: 114, estiloPorQuadroMs: 17 }, on: { fps, frameP95Ms: 45, estiloPorQuadroMs: 0.9 } },
})

test('aprova com 3 rodadas ou mais nos três limites', () => {
  assert.equal(build(baseline, current(44), hw).veredito, 'aprovado')
  assert.equal(build(baseline, current(30), hw).veredito, 'reprovado')
})

test('renderer de software invalida a comparação', () => {
  const soft = { ...current(44), gpu: { renderer: 'Microsoft Basic Render Driver', ativa: { vendorId: 0 } } }
  assert.equal(describeBackend(soft).fisico, false)
  const result = build(baseline, soft, hw)
  assert.equal(result.veredito, 'invalido')
  assert.match(result.problemas[0], /não é teste físico/)
})

test('config diferente invalida', () => {
  const other = { ...current(44), config: { ...config, cpuThrottle: 1 } }
  assert.equal(build(baseline, other, hw).veredito, 'invalido')
})

'use strict'
require('../../../scripts/test-support/pasta-do-teste.cjs') // isola o temporário deste arquivo (ver pasta-do-teste.cjs)

const test = require('node:test')
const assert = require('node:assert/strict')
const { buildSessionReport, formatSessionReportMarkdown, formatDuration } = require('./agent-session-report.cjs')

const MIN = 60_000
const T0 = Date.parse('2026-09-25T13:53:00.000Z') // 10:53 em São Paulo
/** Eventos de 10 em 10 min de `from` a `to` (minutos desde T0), todos num projeto. */
const run = (from, to, project) => {
  const out = []
  for (let m = from; m <= to; m += 10) out.push({ at: T0 + m * MIN, project })
  return out
}

test('sem eventos: sem relatório', () => {
  assert.equal(buildSessionReport([]), null)
  assert.match(formatSessionReportMarkdown(null), /Nenhuma atividade/)
})

test('horas ativas = total menos pausas de mais de 30 min; frentes somam o tempo ativo', () => {
  // 0-120 Onboarding, pausa de 60 min, 180-300 Onboarding de novo e 310-400 Site.
  const events = [...run(0, 120, 'Onboarding'), ...run(180, 300, 'Onboarding'), ...run(310, 400, 'Site')]
  const report = buildSessionReport(events)
  assert.equal(report.wallMs, 400 * MIN)
  assert.equal(report.pauses.length, 1)
  assert.equal(report.pauses[0].ms, 60 * MIN)
  assert.equal(report.activeMs, 340 * MIN)
  const sum = report.fronts.reduce((total, f) => total + f.ms, 0)
  assert.equal(sum, report.activeMs)
  assert.deepEqual(report.fronts.map((f) => f.project), ['Onboarding', 'Site'])
  assert.equal(report.fronts[0].ms, 240 * MIN)
})

test('exatamente 30 min não é pausa; 30 min e 1 ms é', () => {
  const at = (ms) => [{ at: 0, project: 'a' }, { at: ms, project: 'a' }]
  assert.equal(buildSessionReport(at(30 * MIN)).pauses.length, 0)
  assert.equal(buildSessionReport(at(30 * MIN + 1)).pauses.length, 1)
})

test('eventos fora de ordem, sem projeto e um evento só', () => {
  const report = buildSessionReport([{ at: 10 * MIN, project: null }, { at: 0, project: 'x' }])
  assert.equal(report.fronts[0].project, '(sem projeto)')
  const single = buildSessionReport([{ at: 5, project: 'x' }])
  assert.equal(single.activeMs, 0)
  assert.equal(single.fronts.length, 0)
})

test('formato: duração como 37h30 e datas no fuso pedido', () => {
  assert.equal(formatDuration((37 * 60 + 30) * MIN), '37h30')
  const events = [...run(0, 100, 'Onboarding'), { at: T0 + 300 * MIN, project: 'Site' }]
  const md = formatSessionReportMarkdown(buildSessionReport(events), { timeZone: 'America/Sao_Paulo' })
  assert.match(md, /Período: 25\/09 10:53 a 25\/09 15:53 \(5h00 no relógio\)/)
  assert.match(md, /Horas ativas: 1h40/)
  assert.match(md, /Pausas \(mais de 30 min sem atividade\): 1/)
  assert.match(md, /- 25\/09 12:33 a 25\/09 15:53 \(3h20\)/)
  assert.match(md, /- Onboarding: 1h40/)
})

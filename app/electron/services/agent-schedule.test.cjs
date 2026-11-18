'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { dueSlots, nextRunAt, normalizeSchedule } = require('./agent-schedule.cjs')

const SP = 'America/Sao_Paulo' // UTC-3 o ano todo desde 2019
const rotina = { times: ['18:00', '06:00', '07:00', '12:00'], timeZone: SP }
const iso = (ms) => new Date(ms).toISOString()

test('escolhe o próximo horário do dia, ordenando os horários', () => {
  // 05:30 em São Paulo = 08:30Z
  assert.equal(iso(nextRunAt(rotina, Date.parse('2026-11-18T08:30:00Z'))), '2026-11-18T09:00:00.000Z')
  // 06:00 exato já passou: vai para 07:00
  assert.equal(iso(nextRunAt(rotina, Date.parse('2026-11-18T09:00:00Z'))), '2026-11-18T10:00:00.000Z')
})

test('depois do último horário do dia vai para o primeiro do dia seguinte', () => {
  // 18:01 em São Paulo = 21:01Z
  assert.equal(iso(nextRunAt(rotina, Date.parse('2026-11-18T21:01:00Z'))), '2026-11-19T09:00:00.000Z')
})

test('usa o dia local do fuso, não o dia UTC', () => {
  // 22:00 do dia 18 em São Paulo já é 01:00Z do dia 19; o próximo é 06:00 do dia 19 local
  assert.equal(iso(nextRunAt(rotina, Date.parse('2026-11-19T01:00:00Z'))), '2026-11-19T09:00:00.000Z')
})

test('respeita os dias da semana (18/11/2026 é quarta)', () => {
  const diasUteis = { times: ['06:00'], timeZone: SP, weekdays: [1, 2, 3, 4, 5] }
  // sexta 20 depois das 06:00 -> segunda 23
  assert.equal(iso(nextRunAt(diasUteis, Date.parse('2026-11-20T12:00:00Z'))), '2026-11-23T09:00:00.000Z')
})

test('horário de verão: 02:30 inexistente em Nova York vira logo após a virada, e o fuso muda o instante', () => {
  const ny = { times: ['02:30'], timeZone: 'America/New_York' }
  // 08/03/2026 02:00 -> 03:00; 02:30 não existe
  assert.equal(iso(nextRunAt(ny, Date.parse('2026-03-08T00:00:00Z'))), '2026-03-08T07:30:00.000Z')
  // em 09/03 já é EDT (UTC-4)
  assert.equal(iso(nextRunAt(ny, Date.parse('2026-03-08T08:00:00Z'))), '2026-03-09T06:30:00.000Z')
})

test('dueSlots lista o que venceu no intervalo e respeita o teto', () => {
  const since = Date.parse('2026-11-18T08:00:00Z') // 05:00 local
  const now = Date.parse('2026-11-18T16:00:00Z') // 13:00 local
  assert.deepEqual(dueSlots(rotina, since, now).map(iso), [
    '2026-11-18T09:00:00.000Z', '2026-11-18T10:00:00.000Z', '2026-11-18T15:00:00.000Z',
  ])
  assert.equal(dueSlots(rotina, now, now).length, 0)
  assert.equal(dueSlots(rotina, since, since + 365 * 86_400_000).length, 50)
})

test('valida horário, fuso e dias', () => {
  assert.throws(() => normalizeSchedule({ times: [] }), /ao menos um horário/)
  assert.throws(() => normalizeSchedule({ times: ['24:00'] }), /inválido/)
  assert.throws(() => normalizeSchedule({ times: ['6:00'] }), /inválido/)
  assert.throws(() => normalizeSchedule({ times: ['06:00'], timeZone: 'Marte/Olimpo' }), /Fuso/)
  assert.throws(() => normalizeSchedule({ times: ['06:00'], weekdays: [7] }), /Dias da semana/)
})

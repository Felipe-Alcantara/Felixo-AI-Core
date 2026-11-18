'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { createAgentScheduleService } = require('./agent-schedule-service.cjs')

const SP = 'America/Sao_Paulo'
const at = (iso) => Date.parse(iso)

function setup(startIso) {
  const state = { now: at(startIso), store: new Map(), notices: [], timers: [] }
  const service = createAgentScheduleService({
    settings: { get: (k) => state.store.get(k) ?? null, set: (k, v) => state.store.set(k, structuredClone(v)) },
    notify: (channel, notice) => state.notices.push({ channel, notice }),
    now: () => state.now,
    setTimeoutFn: (fn, delay) => {
      const timer = { fn, delay, unref() {} }
      state.timers.push(timer)
      return timer
    },
    clearTimeoutFn: (timer) => { timer.cleared = true },
  })
  return { state, service }
}

const rotina = { nodeId: 'agente-1', prompt: 'Resuma o dia', times: ['06:00', '12:00'], timeZone: SP }

test('na hora marcada só levanta o aviso com o prompt fixo; nada roda sozinho', () => {
  const { state, service } = setup('2026-11-18T08:00:00Z') // 05:00 local
  service.save(rotina)
  service.start()
  assert.equal(state.notices.length, 0)
  const timer = state.timers.at(-1)
  assert.equal(timer.delay, 60 * 60_000) // 06:00 local é daqui a 1h
  state.now = at('2026-11-18T09:00:00Z')
  timer.fn()
  assert.equal(state.notices.length, 1)
  assert.equal(state.notices[0].channel, 'agent-schedule:due')
  const { nodeId, prompt, missed } = state.notices[0].notice
  assert.deepEqual({ nodeId, prompt, missed }, { nodeId: 'agente-1', prompt: 'Resuma o dia', missed: false })
  assert.equal(service.pending().length, 1)
})

test('o clique entrega o prompt uma vez', () => {
  const { state, service } = setup('2026-11-18T08:00:00Z')
  service.save(rotina)
  state.now = at('2026-11-18T09:00:00Z')
  service.start() // 06:00 venceu com o app fechado
  const { id } = service.pending()[0]
  assert.deepEqual(service.confirm(id), { nodeId: 'agente-1', prompt: 'Resuma o dia' })
  assert.equal(service.confirm(id), null)
  assert.equal(service.pending().length, 0)
})

test('ao abrir, só o último horário perdido é oferecido, marcado como perdido', () => {
  const { state, service } = setup('2026-11-18T08:00:00Z') // 05:00
  service.save(rotina)
  state.now = at('2026-11-18T22:00:00Z') // 19:00: perdeu 06:00 e 12:00
  service.start()
  assert.equal(state.notices.length, 1)
  assert.equal(state.notices[0].notice.slotAt, at('2026-11-18T15:00:00Z'))
  assert.equal(state.notices[0].notice.missed, true)
  assert.equal(service.dismiss(state.notices[0].notice.id), true)
  assert.equal(service.pending().length, 0)
  service.start() // reabrir não repete o que já foi conferido
  assert.equal(state.notices.length, 1)
})

test('um aviso novo do mesmo agente substitui o anterior', () => {
  const { state, service } = setup('2026-11-18T08:00:00Z')
  service.save(rotina)
  service.start()
  state.now = at('2026-11-18T09:00:00Z')
  state.timers.at(-1).fn()
  state.now = at('2026-11-18T15:00:00Z')
  state.timers.at(-1).fn()
  assert.equal(service.pending().length, 1)
  assert.equal(service.pending()[0].slotAt, at('2026-11-18T15:00:00Z'))
})

test('valida o agente e o prompt, remove e persiste', () => {
  const { service } = setup('2026-11-18T08:00:00Z')
  assert.throws(() => service.save({ ...rotina, nodeId: ' ' }), /agente/)
  assert.throws(() => service.save({ ...rotina, prompt: '  ' }), /prompt/)
  assert.throws(() => service.save({ ...rotina, prompt: 'x'.repeat(8001) }), /passa de/)
  assert.throws(() => service.save({ ...rotina, times: ['25:00'] }), /inválido/)
  const saved = service.save(rotina)
  assert.deepEqual(saved.times, ['06:00', '12:00'])
  assert.equal(service.list().length, 1)
  assert.equal(service.remove('agente-1'), true)
  assert.equal(service.remove('agente-1'), false)
  assert.equal(service.list().length, 0)
})

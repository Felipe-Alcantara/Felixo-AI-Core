'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { createApprovalWindowReminder, WINDOW_CHANNEL } = require('./approval-window-reminder.cjs')

const SP = 'America/Sao_Paulo'
const at = (iso) => Date.parse(iso)

function setup(startIso) {
  const state = { now: at(startIso), sent: [], timers: [] }
  const reminder = createApprovalWindowReminder({
    timeZone: SP,
    notify: (channel, payload) => state.sent.push({ channel, payload }),
    now: () => state.now,
    setTimeoutFn: (fn, delay) => {
      const timer = { fn, delay, unref() {} }
      state.timers.push(timer)
      return timer
    },
    clearTimeoutFn: (timer) => { timer.cleared = true },
  })
  return { state, reminder }
}

test('avisa na janela das 12h e das 18h, uma vez cada, e rearma para a próxima', () => {
  const { state, reminder } = setup('2026-11-18T14:00:00Z') // 11:00 local
  reminder.start()
  assert.equal(state.timers.length, 1)
  assert.equal(state.timers[0].delay, 60 * 60_000) // 12:00 local é daqui a 1h
  assert.equal(state.sent.length, 0)

  state.now = at('2026-11-18T15:00:00Z') // 12:00 local
  state.timers[0].fn()
  assert.deepEqual(state.sent, [{ channel: WINDOW_CHANNEL, payload: { slotAt: at('2026-11-18T15:00:00Z') } }])

  // próxima janela: 18:00 local, 6h depois (limitado a re-conferir a cada hora)
  assert.equal(state.timers.length, 2)
  state.now = at('2026-11-18T21:00:00Z') // 18:00 local
  state.timers[1].fn()
  assert.equal(state.sent.length, 2)
  assert.equal(state.sent[1].payload.slotAt, at('2026-11-18T21:00:00Z'))
})

test('timer que dispara antes da janela (re-conferência horária) não avisa', () => {
  const { state, reminder } = setup('2026-11-18T08:00:00Z') // 05:00 local
  reminder.start()
  state.now = at('2026-11-18T09:00:00Z') // 06:00 local, ainda longe das 12h
  state.timers[0].fn()
  assert.equal(state.sent.length, 0)
  assert.equal(state.timers.length, 2)
})

test('stop cancela o timer e start duas vezes não arma dois', () => {
  const { state, reminder } = setup('2026-11-18T14:00:00Z')
  reminder.start()
  reminder.start()
  assert.equal(state.timers.length, 1)
  reminder.stop()
  assert.equal(state.timers[0].cleared, true)
})

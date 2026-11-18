'use strict'

const { nextRunAt } = require('./agent-schedule.cjs')

const APPROVAL_WINDOWS = ['12:00', '18:00']
const WINDOW_CHANNEL = 'approvals:window'
const MAX_TIMER_MS = 60 * 60_000 // setTimeout estoura em ~24 dias; re-confere a cada hora
const MIN_TIMER_MS = 1000

/**
 * Lembrete das janelas fixas de aprovação (12h e 18h, no fuso do sistema).
 *
 * Só avisa a interface que a janela abriu; quem sabe quantos pedidos estão
 * pendentes é ela. Não aprova nem nega nada e reaproveita a calculadora de
 * horários do agendador. shortcut: com o app fechado a janela passa em branco
 * (o painel mostra a fila quando o app abre), e as janelas não são
 * configuráveis; configurar fica para quando alguém pedir outros horários.
 */
function createApprovalWindowReminder({
  notify = () => {},
  now = () => Date.now(),
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  times = APPROVAL_WINDOWS,
  timeZone,
} = {}) {
  const schedule = { times, timeZone }
  let timer = null
  let targetAt = null

  function arm() {
    const current = now()
    targetAt = nextRunAt(schedule, current)
    const delay = Math.min(Math.max(targetAt - current, MIN_TIMER_MS), MAX_TIMER_MS)
    timer = setTimeoutFn(() => {
      timer = null
      if (now() >= targetAt) notify(WINDOW_CHANNEL, { slotAt: targetAt })
      arm()
    }, delay)
    timer.unref?.()
  }

  return {
    start() {
      if (!timer) arm()
    },
    stop() {
      if (timer) clearTimeoutFn(timer)
      timer = null
    },
  }
}

module.exports = { APPROVAL_WINDOWS, WINDOW_CHANNEL, createApprovalWindowReminder }

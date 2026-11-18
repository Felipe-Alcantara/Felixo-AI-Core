'use strict'

const { dueSlots, nextRunAt, normalizeSchedule } = require('./agent-schedule.cjs')

const SETTINGS_KEY = 'agentSchedules'
const MAX_PROMPT_LENGTH = 8000
const MAX_TIMER_MS = 60 * 60_000 // re-confere a cada hora; setTimeout estoura em ~24 dias
const MIN_TIMER_MS = 1000

/**
 * Agendador de agentes do canvas que SÓ AVISA.
 *
 * No horário (ou ao abrir o app, para o que venceu com ele fechado) levanta um
 * aviso com o prompt fixo do agente marcado e espera a pessoa clicar. Este
 * módulo não tem nenhum caminho que execute um agente: quem roda é o
 * renderer, depois de `confirm`. Se há vários horários vencidos para o mesmo
 * agente, só o último é oferecido.
 *
 * Decisões do Felipe (regra "opção recomendada"): só roda com o app aberto,
 * confirmação a cada execução, só agente marcado com prompt fixo, horário
 * perdido oferece só o último.
 */
function createAgentScheduleService({
  settings,
  notify = () => {},
  now = () => Date.now(),
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
}) {
  const pending = new Map() // nodeId -> aviso; um por agente
  let timer = null

  const load = () => settings.get(SETTINGS_KEY)?.schedules ?? {}
  const store = (schedules) => settings.set(SETTINGS_KEY, { schedules })

  function raise(entry, slotAt, missed) {
    const notice = {
      id: `${entry.nodeId}:${slotAt}`,
      nodeId: entry.nodeId,
      prompt: entry.prompt,
      slotAt,
      missed,
    }
    pending.set(entry.nodeId, notice)
    notify('agent-schedule:due', notice)
  }

  // Avisa o último horário vencido de cada agente desde a última conferência.
  function check(missed) {
    const current = now()
    const schedules = load()
    for (const entry of Object.values(schedules)) {
      const slots = dueSlots(entry, entry.lastCheckedAt, current)
      if (slots.length > 0) raise(entry, slots[slots.length - 1], missed)
      entry.lastCheckedAt = current
    }
    store(schedules)
  }

  function arm() {
    if (timer) clearTimeoutFn(timer)
    timer = null
    const entries = Object.values(load())
    if (entries.length === 0) return
    const current = now()
    const next = Math.min(...entries.map((entry) => nextRunAt(entry, current)))
    const delay = Math.min(Math.max(next - current, MIN_TIMER_MS), MAX_TIMER_MS)
    timer = setTimeoutFn(() => {
      timer = null
      check(false)
      arm()
    }, delay)
    timer.unref?.()
  }

  function findNotice(noticeId) {
    return [...pending.values()].find((item) => item.id === noticeId)
  }

  return {
    /** Ao abrir o app: oferece o último vencido de cada agente e arma o timer. */
    start() {
      check(true)
      arm()
    },
    stop() {
      if (timer) clearTimeoutFn(timer)
      timer = null
    },
    list: () => Object.values(load()),
    pending: () => [...pending.values()],
    /** Marca um agente do canvas com horários e prompt fixo. */
    save(input) {
      const nodeId = typeof input?.nodeId === 'string' ? input.nodeId.trim() : ''
      if (!nodeId) throw new Error('Informe o agente (nodeId) a agendar.')
      const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : ''
      if (!prompt) throw new Error('Informe o prompt fixo que o agente vai receber.')
      if (prompt.length > MAX_PROMPT_LENGTH) {
        throw new Error(`O prompt passa de ${MAX_PROMPT_LENGTH} caracteres.`)
      }
      const { times, timeZone, weekdays } = normalizeSchedule(input)
      const entry = {
        nodeId,
        prompt,
        times: times.map(({ hour, minute }) => `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`),
        timeZone,
        weekdays: [...weekdays].sort(),
        lastCheckedAt: now(),
      }
      const schedules = load()
      schedules[nodeId] = entry
      store(schedules)
      arm()
      return entry
    },
    remove(nodeId) {
      const schedules = load()
      const existed = nodeId in schedules
      delete schedules[nodeId]
      store(schedules)
      pending.delete(nodeId)
      arm()
      return existed
    },
    /** A pessoa clicou em "Rodar": devolve o que o renderer deve enviar ao agente. */
    confirm(noticeId) {
      const notice = findNotice(noticeId)
      if (!notice) return null
      pending.delete(notice.nodeId)
      return { nodeId: notice.nodeId, prompt: notice.prompt }
    },
    dismiss(noticeId) {
      const notice = findNotice(noticeId)
      if (notice) pending.delete(notice.nodeId)
      return Boolean(notice)
    },
  }
}

module.exports = { MAX_PROMPT_LENGTH, SETTINGS_KEY, createAgentScheduleService }

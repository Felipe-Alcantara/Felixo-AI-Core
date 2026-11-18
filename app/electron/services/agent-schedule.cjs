'use strict'

const MAX_SLOTS = 50

/**
 * Cálculo puro de horários fixos para agendar agentes do canvas.
 *
 * Não dispara nada, não lê relógio nem toca em disco: só responde "quando é a
 * próxima execução" e "quais horários já venceram". Quem dispara (e se
 * pergunta antes, se roda com o app fechado, quais agentes) é decisão de
 * produto e fica fora deste módulo.
 *
 * schedule = { times: ['06:00', '12:00'], timeZone: 'America/Sao_Paulo', weekdays?: [0..6] }
 * weekdays segue Date#getDay (0 = domingo); omitido vale todos os dias.
 */
function normalizeSchedule(schedule) {
  const times = [...new Set(schedule?.times ?? [])]
  if (times.length === 0) throw new Error('Informe ao menos um horário (HH:MM).')
  const parsed = times.map((time) => {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(time))
    if (!match) throw new Error(`Horário inválido: "${time}". Use HH:MM de 00:00 a 23:59.`)
    return { hour: Number(match[1]), minute: Number(match[2]) }
  }).sort((a, b) => a.hour - b.hour || a.minute - b.minute)

  const timeZone = schedule.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
  } catch {
    throw new Error(`Fuso horário inválido: "${timeZone}".`)
  }

  const weekdays = schedule.weekdays ?? [0, 1, 2, 3, 4, 5, 6]
  if (weekdays.length === 0 || weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new Error('Dias da semana devem ser números de 0 (domingo) a 6 (sábado).')
  }
  return { times: parsed, timeZone, weekdays: new Set(weekdays) }
}

function readParts(ms, timeZone) {
  const parts = {}
  for (const { type, value } of new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
  }).formatToParts(ms)) {
    parts[type] = Number(value)
  }
  return parts
}

function offsetAt(ms, timeZone) {
  const p = readParts(ms, timeZone)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000
}

// Hora de parede -> instante UTC. Em horário que não existe (início do horário
// de verão) cai no instante logo após a virada; em horário repetido vale o primeiro.
function wallTimeToUtc(year, month, day, hour, minute, timeZone) {
  const guess = Date.UTC(year, month, day, hour, minute)
  const first = guess - offsetAt(guess, timeZone)
  const second = guess - offsetAt(first, timeZone)
  return Math.max(first, second)
}

/** Próximo instante (ms UTC) estritamente depois de `afterMs`. */
function nextRunAt(schedule, afterMs) {
  const { times, timeZone, weekdays } = normalizeSchedule(schedule)
  const today = readParts(afterMs, timeZone)
  for (let offset = 0; offset <= 8; offset += 1) {
    const day = new Date(Date.UTC(today.year, today.month - 1, today.day + offset))
    if (!weekdays.has(day.getUTCDay())) continue
    for (const { hour, minute } of times) {
      const at = wallTimeToUtc(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, minute, timeZone)
      if (at > afterMs) return at
    }
  }
  throw new Error('Nenhum horário futuro encontrado para este agendamento.')
}

/**
 * Horários que venceram em (sinceMs, nowMs], do mais antigo ao mais novo.
 * Serve para o app, ao acordar, saber o que perdeu; quem chama decide se roda
 * todos, só o último ou nenhum. Limitado a 50 para um relógio atrasado não
 * gerar uma enxurrada.
 */
function dueSlots(schedule, sinceMs, nowMs) {
  const slots = []
  let cursor = sinceMs
  while (slots.length < MAX_SLOTS) {
    const next = nextRunAt(schedule, cursor)
    if (next > nowMs) break
    slots.push(next)
    cursor = next
  }
  return slots
}

module.exports = { MAX_SLOTS, dueSlots, nextRunAt, normalizeSchedule }

'use strict'

/**
 * @module reset-time
 * Leitor único do horário de reset que uma CLI imprime quando a conta bate o
 * limite. Puro: recebe o texto e o "agora", devolve o instante.
 *
 * Formatos, cada um com teste num processo em UTC:
 * - `resets 4:40pm (America/Sao_Paulo)`, `resets Oct 2, 9am (Europe/Lisbon)`,
 *   `will reset at 3pm` — Claude, com ou sem o fuso entre parênteses;
 * - `try again at Oct 2, 2026 8:04 PM` e `try again at 8:04 PM` — Codex, no
 *   fuso local (ele não imprime fuso);
 * - `continuing automatically at 4:40pm` — Claude programado para continuar
 *   sozinho; marca `autoResume`;
 * - `try again in 3 hours`, `resets in 8m` — relativo;
 * - `…|1790000000` — epoch em segundos.
 *
 * Fonte: `texto` quando o instante não depende de fuso (fuso impresso e
 * válido, relativo ou epoch); `texto_fuso_local` quando o fuso não foi
 * impresso ou não existe — aí vale `fallbackTimeZone`, que por padrão é o fuso
 * local (a CLI roda na mesma máquina e formata no fuso dela).
 *
 * Uma leitura no passado ou a mais de `RESET_MAX_AHEAD_MS` do agora é
 * descartada (devolve null), para quem chamou cair na fonte seguinte.
 */

const { RESET_MAX_AHEAD_MS } = require('./account-chain-constants.cjs')

const CLOCK_SOURCE = String.raw`\d{1,2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?`
const DATE_SOURCE = String.raw`[A-Za-z]{3,9}\.?\s+\d{1,2}(?:,\s*\d{4})?(?:,\s*|\s+)\d{1,2}(?::\d{2})?\s*[ap]\.?m\.?`
const WHEN_SOURCE = `(${DATE_SOURCE}|${CLOCK_SOURCE})`
const ZONE_SOURCE = String.raw`(?:\s*\(([^)]+)\))?`
const RELATIVE_UNITS = Object.freeze({
  m: 60_000,
  min: 60_000,
  mins: 60_000,
  minute: 60_000,
  minutes: 60_000,
  h: 3_600_000,
  hr: 3_600_000,
  hrs: 3_600_000,
  hour: 3_600_000,
  hours: 3_600_000,
  d: 86_400_000,
  day: 86_400_000,
  days: 86_400_000,
})

/**
 * Padrões na ordem de preferência. O primeiro que der um instante válido
 * vence: o horário de continuação automática é o próprio reset, e marca a
 * retomada.
 */
const ABSOLUTE_PATTERNS = Object.freeze([
  {
    autoResume: true,
    regex: new RegExp(String.raw`\bcontinuing automatically at\s+${WHEN_SOURCE}${ZONE_SOURCE}`, 'i'),
  },
  { autoResume: false, regex: new RegExp(String.raw`\bresets?(?:\s+at)?\s+${WHEN_SOURCE}${ZONE_SOURCE}`, 'i') },
  { autoResume: false, regex: new RegExp(String.raw`\btry again at\s+${WHEN_SOURCE}${ZONE_SOURCE}`, 'i') },
])
const RELATIVE_PATTERN = new RegExp(
  String.raw`\b(?:try again|resets?)\s+in\s+(\d{1,4})\s*(${Object.keys(RELATIVE_UNITS).join('|')})\b`,
  'i',
)
const EPOCH_PATTERN = /\|\s*(\d{10})(?!\d)/

/** Fuso local do processo, como o `Intl` o resolve. */
function getLocalTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** Se o `Intl` aceita o fuso. */
function isValidTimeZone(timeZone) {
  if (typeof timeZone !== 'string' || !timeZone.trim()) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timeZone.trim() })
    return true
  } catch {
    return false
  }
}

function cleanLabel(value) {
  return String(value).replace(/\s+/g, ' ').replace(/[.,;:]+$/, '').trim()
}

/** Horário com am/pm, ou 24 h sem am/pm ("16:40"), como o leitor antigo aceitava. */
function parseWhen(when, nowMs, timeZone) {
  const compact = cleanLabel(when).replace(/([ap])\.?m\.?$/i, '$1m')
  if (/[ap]m$/i.test(compact)) {
    const iso = parseClaudeReset(compact, nowMs, timeZone)
    return iso ? Date.parse(iso) : null
  }

  const clock = /^(\d{1,2})(?::(\d{2}))?$/.exec(compact)
  if (!clock) return null
  const hour = Number(clock[1])
  const minute = Number(clock[2] ?? 0)
  if (hour > 23 || minute > 59) return null

  const current = getDatePartsInTimeZone(nowMs, timeZone)
  if (!current) return null
  let target = { year: current.year, month: current.month, day: current.day, hour, minute }
  if (hour < current.hour || (hour === current.hour && minute <= current.minute)) {
    target = shiftCalendarDay(target, 1)
  }
  const timestamp = zonedDateToTimestamp(target, timeZone)
  return Number.isFinite(timestamp) ? timestamp : null
}

function isWithinWindow(resetAtMs, nowMs) {
  return Number.isFinite(resetAtMs) && resetAtMs > nowMs && resetAtMs - nowMs <= RESET_MAX_AHEAD_MS
}

function buildResult(resetAtMs, source, label, autoResume) {
  return {
    resetAtMs,
    resetAt: new Date(resetAtMs).toISOString(),
    source,
    label,
    autoResume,
    autoResumeText: autoResume ? label : null,
  }
}

/**
 * Instante de reset impresso num texto de falha.
 *
 * @param {unknown} text
 * @param {{ nowMs?: number, localTimeZone?: string, fallbackTimeZone?: string }} [options]
 * @returns {{
 *   resetAtMs: number,
 *   resetAt: string,
 *   source: 'texto' | 'texto_fuso_local',
 *   label: string,
 *   autoResume: boolean,
 *   autoResumeText: string | null,
 * } | null}
 */
function parseResetFromText(text, options = {}) {
  const value = String(text ?? '')
  if (!value.trim()) return null

  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now()
  const localTimeZone = isValidTimeZone(options.localTimeZone) ? options.localTimeZone : getLocalTimeZone()
  const fallbackTimeZone = isValidTimeZone(options.fallbackTimeZone) ? options.fallbackTimeZone : localTimeZone

  for (const pattern of ABSOLUTE_PATTERNS) {
    const match = pattern.regex.exec(value)
    if (!match) continue

    const printedZone = match[2]?.trim()
    const hasZone = isValidTimeZone(printedZone)
    const resetAtMs = parseWhen(match[1], nowMs, hasZone ? printedZone : fallbackTimeZone)
    if (isWithinWindow(resetAtMs, nowMs)) {
      return buildResult(resetAtMs, hasZone ? 'texto' : 'texto_fuso_local', cleanLabel(match[1]), pattern.autoResume)
    }
  }

  const relative = RELATIVE_PATTERN.exec(value)
  if (relative) {
    const resetAtMs = nowMs + Number(relative[1]) * RELATIVE_UNITS[relative[2].toLowerCase()]
    if (isWithinWindow(resetAtMs, nowMs)) {
      return buildResult(resetAtMs, 'texto', cleanLabel(`${relative[1]} ${relative[2]}`), false)
    }
  }

  const epoch = EPOCH_PATTERN.exec(value)
  if (epoch) {
    const resetAtMs = Number(epoch[1]) * 1000
    if (isWithinWindow(resetAtMs, nowMs)) {
      return buildResult(resetAtMs, 'texto', new Date(resetAtMs).toISOString(), false)
    }
  }

  return null
}

/**
 * Horário de reset no formato das CLIs ("4:40pm", "Sep 2, 2am", "Oct 2, 2026
 * 8:04 PM"), como ISO. Com `timeZone`, lê no fuso informado; sem ele, no fuso
 * do processo. Um horário sem data que já passou hoje vai para amanhã.
 *
 * Morava em claude-usage-query.cjs, que o reexporta: esta é a casa única, para
 * a leitura de reset não depender do módulo que abre PTY.
 *
 * @param {string} value
 * @param {number} nowMs
 * @param {string | null} [timeZone]
 * @returns {string | null}
 */
function parseClaudeReset(value, nowMs, timeZone = null) {
  const text = String(value).replace(/\s+/g, ' ').trim()
  const dateMatch = text.match(
    // O ano pode vir seguido de vírgula (Claude: "Oct 2, 2027, 9am") ou de
    // espaço (Codex: "Oct 2, 2026 8:04 PM", formato "%b %-d, %Y %-I:%M %p").
    /^([A-Za-z]{3,9})\s+(\d{1,2})(?:,\s*(\d{4}))?(?:,\s*|\s+)?(\d{1,2})(?::(\d{2}))?\s*([ap]m)$/i,
  )
  const clockMatch = text.match(
    /^(\d{1,2})(?::(\d{2}))?\s*([ap]m)$/i,
  )

  if (!dateMatch && !clockMatch) {
    return null
  }

  const current = timeZone
    ? getDatePartsInTimeZone(Number(nowMs), timeZone)
    : getLocalDateParts(Number(nowMs))
  if (!current) {
    return null
  }

  const year = dateMatch ? Number(dateMatch[3] ?? current.year) : current.year
  const month = dateMatch ? monthNumber(dateMatch[1]) : current.month
  const day = dateMatch ? Number(dateMatch[2]) : current.day
  const hour = to24Hour(
    Number(dateMatch ? dateMatch[4] : clockMatch[1]),
    dateMatch ? dateMatch[6] : clockMatch[3],
  )
  const minute = Number(dateMatch ? dateMatch[5] ?? 0 : clockMatch[2] ?? 0)

  if (month === null || !Number.isFinite(day) || !Number.isFinite(hour)) {
    return null
  }

  let target = { year, month, day, hour, minute }
  if (
    !dateMatch &&
    (hour < current.hour || (hour === current.hour && minute <= current.minute))
  ) {
    target = shiftCalendarDay(target, 1)
  }

  const timestamp = timeZone
    ? zonedDateToTimestamp(target, timeZone)
    : new Date(
        target.year,
        target.month,
        target.day,
        target.hour,
        target.minute,
        0,
        0,
      ).getTime()

  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
}

function getLocalDateParts(timestamp) {
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime())
    ? null
    : {
        year: date.getFullYear(),
        month: date.getMonth(),
        day: date.getDate(),
        hour: date.getHours(),
        minute: date.getMinutes(),
      }
}

function getDatePartsInTimeZone(timestamp, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      calendar: 'gregory',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(new Date(timestamp))
    const values = Object.fromEntries(
      parts
        .filter(({ type }) => type !== 'literal')
        .map(({ type, value }) => [type, Number(value)]),
    )

    return {
      year: values.year,
      month: values.month - 1,
      day: values.day,
      hour: values.hour,
      minute: values.minute,
    }
  } catch {
    return null
  }
}

function shiftCalendarDay(value, days) {
  const date = new Date(Date.UTC(value.year, value.month, value.day + days))
  return {
    ...value,
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
    day: date.getUTCDate(),
  }
}

/** Converte componentes de uma data local do fuso informado para UTC. */
function zonedDateToTimestamp(value, timeZone) {
  let guess = Date.UTC(
    value.year,
    value.month,
    value.day,
    value.hour,
    value.minute,
  )

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = getDatePartsInTimeZone(guess, timeZone)
    if (!actual) {
      return NaN
    }

    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month,
      actual.day,
      actual.hour,
      actual.minute,
    )
    const desiredAsUtc = Date.UTC(
      value.year,
      value.month,
      value.day,
      value.hour,
      value.minute,
    )
    const difference = desiredAsUtc - actualAsUtc
    guess += difference

    if (difference === 0) {
      break
    }
  }

  return guess
}

function monthNumber(value) {
  const month = String(value).slice(0, 3).toLowerCase()
  const index = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(month)
  return index >= 0 ? index : null
}

function to24Hour(value, meridiem) {
  if (!Number.isFinite(value) || value < 1 || value > 12) {
    return NaN
  }

  const normalized = String(meridiem).toLowerCase()
  if (normalized === 'am') {
    return value === 12 ? 0 : value
  }

  return value === 12 ? 12 : value + 12
}

module.exports = {
  getLocalTimeZone,
  isValidTimeZone,
  parseClaudeReset,
  parseResetFromText,
}

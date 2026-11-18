'use strict'

// Relatório de uma sessão longa de trabalho: horas ativas, pausas e tempo por frente.
// Funções puras (sem banco, sem relógio), para o resumo diário reaproveitar a mesma conta.

// Mais que isso sem nenhuma atividade é pausa (regra da task); até isso, a pessoa continua ativa.
const PAUSE_MS = 30 * 60 * 1000
const NO_PROJECT = '(sem projeto)'

/**
 * events: [{ at: ms, project: string|null }] de qualquer agente. Sessão = do primeiro ao último evento.
 * Tempo ativo = duração total menos as pausas. Cada intervalo ativo é creditado à frente (projeto)
 * do evento que o encerra, então a soma das frentes é exatamente o tempo ativo.
 */
function buildSessionReport(events, { pauseMs = PAUSE_MS } = {}) {
  const sorted = events
    .filter((event) => Number.isFinite(event?.at))
    .map((event) => ({ at: event.at, project: event.project || NO_PROJECT }))
    .sort((a, b) => a.at - b.at)
  if (sorted.length === 0) return null

  const pauses = []
  const byFront = new Map()
  let active = 0
  for (let i = 1; i < sorted.length; i += 1) {
    const gap = sorted[i].at - sorted[i - 1].at
    if (gap > pauseMs) {
      pauses.push({ start: sorted[i - 1].at, end: sorted[i].at, ms: gap })
    } else {
      active += gap
      byFront.set(sorted[i].project, (byFront.get(sorted[i].project) ?? 0) + gap)
    }
  }
  const start = sorted[0].at
  const end = sorted[sorted.length - 1].at
  const fronts = [...byFront]
    .map(([project, ms]) => ({ project, ms }))
    .sort((a, b) => b.ms - a.ms || a.project.localeCompare(b.project))
  return { start, end, wallMs: end - start, activeMs: active, pauseMs, pauses, fronts, events: sorted.length }
}

function formatDuration(ms) {
  const minutes = Math.round(ms / 60_000)
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`
}

function formatStamp(ms, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('pt-BR', {
      timeZone, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    })
      .formatToParts(new Date(ms))
      .map((part) => [part.type, part.value]),
  )
  return `${parts.day}/${parts.month} ${parts.hour}:${parts.minute}`
}

function formatSessionReportMarkdown(report, { timeZone } = {}) {
  if (!report) return '# Relatório da sessão\n\nNenhuma atividade registrada no período.\n'
  const at = (ms) => formatStamp(ms, timeZone)
  const limit = Math.round(report.pauseMs / 60_000)
  const lines = [
    '# Relatório da sessão',
    '',
    `- Período: ${at(report.start)} a ${at(report.end)} (${formatDuration(report.wallMs)} no relógio)`,
    `- Horas ativas: ${formatDuration(report.activeMs)}`,
    `- Pausas (mais de ${limit} min sem atividade): ${report.pauses.length}`,
    '',
    '## Pausas',
    '',
    ...(report.pauses.length
      ? report.pauses.map((p) => `- ${at(p.start)} a ${at(p.end)} (${formatDuration(p.ms)})`)
      : ['Nenhuma.']),
    '',
    '## Tempo por frente',
    '',
    ...(report.fronts.length ? report.fronts.map((f) => `- ${f.project}: ${formatDuration(f.ms)}`) : ['Nenhuma.']),
    '',
    'Atividade = texto enviado a um agente ou sessão aberta; o que o agente faz sozinho, sem ninguém digitar, não conta.',
    '',
  ]
  return lines.join('\n')
}

module.exports = { buildSessionReport, formatSessionReportMarkdown, formatDuration, PAUSE_MS }

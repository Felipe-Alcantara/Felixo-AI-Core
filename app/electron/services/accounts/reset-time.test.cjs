'use strict'

// O CI roda em UTC; fixar aqui garante que "fuso local" signifique UTC também
// em quem roda os testes em outro fuso. O node --test isola cada arquivo num
// processo, então isto não vaza para os outros testes.
process.env.TZ = 'UTC'

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  getLocalTimeZone,
  isValidTimeZone,
  parseClaudeReset,
  parseResetFromText,
} = require('./reset-time.cjs')
const claudeUsageQuery = require('../claude-usage-query.cjs')

const NOW = Date.parse('2026-09-28T12:00:00Z')

test('o processo de teste está em UTC', () => {
  assert.equal(getLocalTimeZone(), 'UTC')
})

test('o fuso impresso entre parênteses vence o fuso local', () => {
  const summer = Date.parse('2026-07-01T00:00:00Z')
  const lisbon = parseResetFromText('resets 3am (Europe/Lisbon)', { nowMs: summer })

  assert.equal(lisbon.resetAt, '2026-07-01T02:00:00.000Z')
  assert.equal(lisbon.source, 'texto')
  assert.equal(lisbon.label, '3am')

  const withDate = parseResetFromText('resets Oct 2, 9am (Europe/Lisbon)', { nowMs: NOW })
  assert.equal(withDate.resetAt, '2026-10-02T08:00:00.000Z')

  const saoPaulo = parseResetFromText("You're out of extra usage · resets 4:40pm (America/Sao_Paulo)", {
    nowMs: Date.parse('2026-05-02T18:10:00Z'),
  })
  assert.equal(saoPaulo.resetAt, '2026-05-02T19:40:00.000Z')
  assert.equal(saoPaulo.label, '4:40pm')
})

test('o formato do Codex com ano seguido de hora é lido no fuso local', () => {
  // Antes deste commit, parseClaudeReset('Oct 2, 2026 8:04 PM', now, 'UTC')
  // devolvia null: a regex exigia vírgula ou nada entre o ano e a hora.
  assert.equal(parseClaudeReset('Oct 2, 2026 8:04 PM', NOW, 'UTC'), '2026-10-02T20:04:00.000Z')

  const codex = parseResetFromText(
    '■ You’ve hit your usage limit. Upgrade to Plus to continue using Codex (https://chatgpt.com/explore/plus), or try again at Oct 2, 2026 8:04 PM.',
    { nowMs: NOW },
  )
  assert.equal(codex.resetAt, '2026-10-02T20:04:00.000Z')
  assert.equal(codex.source, 'texto_fuso_local')
  assert.equal(codex.label, 'Oct 2, 2026 8:04 PM')

  const clockOnly = parseResetFromText('You’ve hit your usage limit. Try again at 8:04 PM.', { nowMs: NOW })
  assert.equal(clockOnly.resetAt, '2026-09-28T20:04:00.000Z')
})

test('o formato do Claude com ano seguido de vírgula continua valendo', () => {
  assert.equal(parseClaudeReset('Oct 2, 2026, 9am', NOW, 'UTC'), '2026-10-02T09:00:00.000Z')
  assert.equal(parseClaudeReset('Sep 2, 2am', Date.parse('2026-08-30T12:00:00Z'), 'America/Sao_Paulo'), '2026-09-02T05:00:00.000Z')
})

test('claude-usage-query reexporta o mesmo leitor', () => {
  assert.equal(claudeUsageQuery.parseClaudeReset, parseClaudeReset)
})

test('continuação automática do Claude marca a retomada', () => {
  const result = parseResetFromText('Usage limit reached · continuing automatically at 4:40pm · esc to cancel', {
    nowMs: NOW,
  })

  assert.equal(result.resetAt, '2026-09-28T16:40:00.000Z')
  assert.equal(result.autoResume, true)
  assert.equal(result.autoResumeText, '4:40pm')
  assert.equal(result.source, 'texto_fuso_local')

  const plain = parseResetFromText('resets 4:40pm', { nowMs: NOW })
  assert.equal(plain.autoResume, false)
  assert.equal(plain.autoResumeText, null)
})

test('relativo e epoch não dependem de fuso', () => {
  const hours = parseResetFromText('Rate limited. Try again in 3 hours.', { nowMs: NOW })
  assert.equal(hours.resetAtMs, NOW + 3 * 3_600_000)
  assert.equal(hours.source, 'texto')

  const minutes = parseResetFromText('try again in 15 minutes', { nowMs: NOW })
  assert.equal(minutes.resetAtMs, NOW + 15 * 60_000)

  const epochSeconds = Math.floor(NOW / 1000) + 7200
  const epoch = parseResetFromText(`Claude AI usage limit reached|${epochSeconds}`, { nowMs: NOW })
  assert.equal(epoch.resetAtMs, epochSeconds * 1000)
  assert.equal(epoch.source, 'texto')
})

test('virada de dia e horário de verão', () => {
  // 28/03/2026 23:00 em Lisboa (UTC+0). O horário de verão começa à 1:00 UTC
  // do dia 29: as 3:00 do dia seguinte já são UTC+1.
  const beforeSpring = parseResetFromText('resets 3am (Europe/Lisbon)', { nowMs: Date.parse('2026-03-28T23:00:00Z') })
  assert.equal(beforeSpring.resetAt, '2026-03-29T02:00:00.000Z')

  // 24/10/2026 23:00 em Lisboa (UTC+1). O verão acaba à 1:00 UTC do dia 25:
  // as 9:00 do dia seguinte já são UTC+0.
  const beforeAutumn = parseResetFromText('resets 9am (Europe/Lisbon)', { nowMs: Date.parse('2026-10-24T22:00:00Z') })
  assert.equal(beforeAutumn.resetAt, '2026-10-25T09:00:00.000Z')

  // Horário já passado hoje vai para amanhã.
  const tomorrow = parseResetFromText('resets 11am', { nowMs: NOW })
  assert.equal(tomorrow.resetAt, '2026-09-29T11:00:00.000Z')
})

test('leitura no passado ou a mais de 8 dias é descartada', () => {
  assert.equal(parseResetFromText('try again at Oct 20, 2026 8:04 PM', { nowMs: NOW }), null)
  assert.equal(parseResetFromText('try again at Sep 1, 2026 8:04 PM', { nowMs: NOW }), null)
  assert.equal(parseResetFromText('try again in 9 days', { nowMs: NOW }), null)
  assert.equal(parseResetFromText(`limit|${Math.floor(NOW / 1000) - 60}`, { nowMs: NOW }), null)
})

test('fuso inválido cai no fuso de reserva, marcado como local', () => {
  const invalid = parseResetFromText('resets 4:40pm (Marte/Olimpo)', { nowMs: NOW })
  assert.equal(invalid.resetAt, '2026-09-28T16:40:00.000Z')
  assert.equal(invalid.source, 'texto_fuso_local')

  const fallback = parseResetFromText('resets 4:40pm', { nowMs: NOW, fallbackTimeZone: 'America/Sao_Paulo' })
  assert.equal(fallback.resetAt, '2026-09-28T19:40:00.000Z')
  assert.equal(fallback.source, 'texto_fuso_local')
})

test('o rótulo sai sem preposição e sem pontuação final; hora de 24 h é aceita', () => {
  const now = Date.parse('2026-05-03T13:00:00Z')
  assert.equal(parseResetFromText('Claude usage limit reached. Your limit will reset at 3pm.', { nowMs: now }).label, '3pm')
  assert.equal(parseResetFromText('resets at 3pm', { nowMs: now }).label, '3pm')
  assert.equal(parseResetFromText('resets 16:40', { nowMs: now }).resetAt, '2026-05-03T16:40:00.000Z')
})

test('texto sem horário, vazio ou hostil devolve null sem lançar', () => {
  for (const text of [undefined, null, '', 'Usage limit reached', 'resets soon', 'resets 25:99', 42]) {
    assert.equal(parseResetFromText(text, { nowMs: NOW }), null, String(text))
  }
  assert.equal(isValidTimeZone('Europe/Lisbon'), true)
  assert.equal(isValidTimeZone('Marte/Olimpo'), false)
  assert.equal(isValidTimeZone(''), false)
})

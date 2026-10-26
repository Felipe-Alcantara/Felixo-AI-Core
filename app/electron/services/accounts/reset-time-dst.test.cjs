'use strict'

/**
 * Horário de verão e fuso do processo na leitura de reset.
 *
 * `reset-time.test.cjs` fixa `process.env.TZ = 'UTC'` e por isso nunca exercita
 * o ramo "fuso do processo" nem as horas que não existem (lacuna do início do
 * verão) ou existem duas vezes (o fim dele). Aqui o fuso do processo muda de
 * verdade, e a regra é uma só para os dois ramos: a do `Date` do JS (e do
 * Temporal, "compatible"): hora inexistente vai para frente, hora repetida fica
 * na primeira ocorrência.
 */

const test = require('node:test')
const assert = require('node:assert/strict')
const { parseClaudeReset, parseResetFromText, zonedDateToTimestamp } = require('./reset-time.cjs')
const { buildCodexStatusDetails } = require('../codex-status-details.cjs')

const FUSOS = [
  'America/New_York', // transição de 1 h
  'Europe/Lisbon',
  'Australia/Lord_Howe', // transição de 30 min
  'Pacific/Chatham', // offset +12:45/+13:45
  'Asia/Kolkata', // +5:30, sem horário de verão
  'America/Sao_Paulo', // sem horário de verão desde 2019
  'UTC',
]
const DIA_MS = 24 * 60 * 60 * 1000

function comFuso(fuso, trabalho) {
  const anterior = process.env.TZ
  process.env.TZ = fuso
  try {
    return trabalho()
  } finally {
    if (anterior === undefined) delete process.env.TZ
    else process.env.TZ = anterior
  }
}

/** Diferença (hora local − UTC), em minutos, num instante alinhado ao minuto. */
function deslocamentoEmMinutos(instante, fuso) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: fuso, calendar: 'gregory', year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
    }).formatToParts(new Date(instante)).filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, Number(value)]),
  )
  return (Date.UTC(partes.year, partes.month - 1, partes.day, partes.hour, partes.minute) - instante) / 60000
}

/**
 * Horas de parede de 2026 a conferir: um meio-dia por dia comum e, nos dias com
 * transição (e nos vizinhos), todos os quartos de hora.
 */
function horasDe2026(fuso) {
  const inicio = Date.UTC(2026, 0, 1)
  const muda = Array.from({ length: 368 }, (_, dia) =>
    deslocamentoEmMinutos(inicio + dia * DIA_MS, fuso) !== deslocamentoEmMinutos(inicio + (dia + 1) * DIA_MS, fuso),
  )
  const pontos = []
  for (let dia = 0; dia < 366; dia += 1) {
    const civil = new Date(inicio + dia * DIA_MS)
    const base = { year: civil.getUTCFullYear(), month: civil.getUTCMonth(), day: civil.getUTCDate() }
    const denso = muda[dia - 1] || muda[dia] || muda[dia + 1]
    if (!denso) {
      pontos.push({ ...base, hour: 12, minute: 0 })
      continue
    }
    for (let hour = 0; hour < 24; hour += 1) {
      for (const minute of [0, 15, 30, 45]) pontos.push({ ...base, hour, minute })
    }
  }
  return { pontos, transicoes: muda.filter(Boolean).length }
}

test('o ramo com fuso impresso concorda com o Date do JS em toda hora de parede, inclusive na lacuna e na repetição do horário de verão', () => {
  for (const fuso of FUSOS) {
    const { pontos, transicoes } = horasDe2026(fuso)
    const divergencias = comFuso(fuso, () =>
      pontos
        .map((p) => ({ p, esperado: new Date(p.year, p.month, p.day, p.hour, p.minute, 0, 0).getTime(), obtido: zonedDateToTimestamp(p, fuso) }))
        .filter(({ esperado, obtido }) => esperado !== obtido),
    )

    const resumo = divergencias.slice(0, 4).map(({ p, esperado, obtido }) =>
      `${p.year}-${p.month + 1}-${p.day} ${p.hour}:${String(p.minute).padStart(2, '0')} esperado ${new Date(esperado).toISOString()} obtido ${new Date(obtido).toISOString()}`)
    assert.deepEqual(resumo, [], `${fuso}: ${divergencias.length} de ${pontos.length} horas divergem (${transicoes} dias de transição)`)
  }
})

test('lacuna do início do verão: 2:30 de 8/mar em Nova York não existe e vai para frente (3:30 EDT)', () => {
  const agora = Date.parse('2026-03-08T04:00:00Z') // 23:00 do dia 7, horário padrão
  assert.equal(parseClaudeReset('2:30am', agora, 'America/New_York'), '2026-03-08T07:30:00.000Z')
  assert.equal(parseClaudeReset('Mar 8, 2:30am', Date.parse('2026-03-07T12:00:00Z'), 'America/New_York'), '2026-03-08T07:30:00.000Z')
  assert.equal(parseResetFromText('resets 2:30am (America/New_York)', { nowMs: agora }).resetAt, '2026-03-08T07:30:00.000Z')
})

test('hora repetida do fim do verão: 1:30 de 1/nov em Nova York fica na primeira ocorrência (EDT), igual em qualquer fuso', () => {
  const agora = Date.parse('2026-11-01T03:00:00Z')
  assert.equal(parseClaudeReset('1:30am', agora, 'America/New_York'), '2026-11-01T05:30:00.000Z')
  // Lisboa e Lord Howe antes escolhiam a SEGUNDA ocorrência; o fuso do processo, a primeira.
  assert.equal(parseClaudeReset('Oct 25, 1:30am', Date.parse('2026-10-24T12:00:00Z'), 'Europe/Lisbon'), '2026-10-25T00:30:00.000Z')
  assert.equal(parseClaudeReset('Apr 5, 1:45am', Date.parse('2026-04-04T12:00:00Z'), 'Australia/Lord_Howe'), '2026-04-04T14:45:00.000Z')
})

test('transições de 30 e 45 minutos (Lord Howe e Chatham) leem o minuto certo', () => {
  assert.equal(parseClaudeReset('Oct 4, 2:45am', Date.parse('2026-10-03T12:00:00Z'), 'Australia/Lord_Howe'), '2026-10-03T15:45:00.000Z')
  // Chatham: verão +13:45; 3:45 de 27/set é a 1ª hora depois da lacuna de 1 h.
  assert.equal(parseClaudeReset('Sep 27, 3:45am', Date.parse('2026-09-26T12:00:00Z'), 'Pacific/Chatham'), '2026-09-26T14:00:00.000Z')
})

test('sem fuso impresso o resultado é o mesmo do fuso do processo escrito por extenso, em todos os fusos e nas noites de transição', () => {
  const noites = [
    ['America/New_York', '2026-03-08T04:00:00Z', ['2:30am', '3:30am', '1:30am']],
    ['America/New_York', '2026-11-01T03:00:00Z', ['1:30am', '2:30am', '12:30am']],
    ['Europe/Lisbon', '2026-03-28T22:00:00Z', ['1:30am', '2:30am']],
    ['Europe/Lisbon', '2026-10-24T22:00:00Z', ['1:30am', '2:30am']],
    ['Australia/Lord_Howe', '2026-04-04T12:00:00Z', ['1:45am', '2:15am']],
    ['Pacific/Chatham', '2026-09-26T12:00:00Z', ['2:45am', '3:45am']],
    ['Asia/Kolkata', '2026-10-25T12:00:00Z', ['9:30am']],
  ]
  for (const [fuso, agora, horarios] of noites) {
    comFuso(fuso, () => {
      for (const horario of horarios) {
        const semFuso = parseClaudeReset(horario, Date.parse(agora), null)
        const comFusoImpresso = parseClaudeReset(horario, Date.parse(agora), fuso)
        assert.equal(semFuso, comFusoImpresso, `${fuso} ${agora} ${horario}`)
      }
    })
  }
})

test('texto sem fuso usa o fuso do processo e marca a fonte como texto_fuso_local', () => {
  comFuso('America/New_York', () => {
    const resultado = parseResetFromText('You hit your limit · resets 11pm', { nowMs: Date.parse('2026-03-08T01:00:00Z') })
    assert.equal(resultado.source, 'texto_fuso_local')
    // 7/mar 20:00 EST → 23:00 EST do mesmo dia = 04:00Z do dia 8.
    assert.equal(resultado.resetAt, '2026-03-08T04:00:00.000Z')
  })
})

test('hora exibida ("lida às") usa o fuso do processo e acompanha o horário de verão', () => {
  const lidaAs = (fuso, readAt) =>
    comFuso(fuso, () => buildCodexStatusDetails({ screen: { ok: true, readAt, limitsPending: false } }).screen)

  assert.equal(lidaAs('America/New_York', '2026-03-08T07:30:00Z'), 'lida às 03:30.') // EDT
  assert.equal(lidaAs('America/New_York', '2026-03-08T06:30:00Z'), 'lida às 01:30.') // EST, antes da lacuna
  assert.equal(lidaAs('Europe/Lisbon', '2026-07-01T12:00:00Z'), 'lida às 13:00.') // verão (WEST)
  assert.equal(lidaAs('Europe/Lisbon', '2026-12-01T12:00:00Z'), 'lida às 12:00.')
  assert.equal(lidaAs('Australia/Lord_Howe', '2026-01-01T00:00:00Z'), 'lida às 11:00.') // +11
  assert.equal(lidaAs('Australia/Lord_Howe', '2026-07-01T00:00:00Z'), 'lida às 10:30.') // +10:30
  // A hora repetida mostra o mesmo rótulo duas vezes: o rótulo é da parede, não do instante.
  assert.equal(lidaAs('America/New_York', '2026-11-01T05:30:00Z'), lidaAs('America/New_York', '2026-11-01T06:30:00Z'))
})

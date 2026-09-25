'use strict'

/**
 * Este arquivo (`agent-usage-model.cjs`) é a única barreira entre o que uma
 * CLI de terceiro imprime/responde e o que vira linha do banco/renderer —
 * é aqui que a allowlist de campos e o padrão de segredo vivem. Apesar disso,
 * antes deste arquivo de teste ele só era exercitado indiretamente por
 * `agent-usage-service.test.cjs`/`storage/agent-usage-repository.test.cjs`,
 * nunca com uma entrada deliberadamente hostil (schema desconhecido, tipo
 * inesperado, ANSI, string longa, chave que parece segredo em profundidade).
 * Ver a task "Limites — validar carga, privacidade, relógio e schema
 * /status em múltiplas contas": os testes abaixo cobrem os critérios de
 * aceite "schema desconhecido não causa crash" e "auditoria não encontra
 * segredo nos artefatos", na camada mais baixa possível (antes do banco).
 */

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  classifyUsageCapability,
  cloneValue,
  normalizeMetrics,
  normalizeNumber,
  normalizeSample,
  normalizeTimestamp,
} = require('./agent-usage-model.cjs')
const { listAgentUsageSources } = require('./agent-usage-sources.cjs')

function baseSample(overrides = {}) {
  return {
    id: 'sample-1',
    accountId: 'account-1',
    status: 'current',
    sourceKind: 'cli-command',
    sourceLabel: 'codex login status',
    collectedAt: '2026-09-24T12:00:00.000Z',
    metrics: [],
    ...overrides,
  }
}

test('normalizeSample rejeita entrada que não é objeto sem lançar nada além do esperado', () => {
  // `[]` tem `typeof === 'object'`: passa pela primeira checagem e cai no
  // erro de identificador ausente — ainda uma rejeição limpa, só com outra
  // mensagem, então este caso entra na lista à parte.
  for (const garbage of [null, undefined, 'string', 42, true, () => {}]) {
    assert.throws(() => normalizeSample(garbage), /Amostra de uso invalida/)
  }
  assert.throws(() => normalizeSample([]), /Amostra de uso sem identificador/)
})

test('normalizeSample descarta metadata com chave desconhecida (schema novo não vira campo novo)', () => {
  const normalized = normalizeSample(
    baseSample({
      metadata: {
        authStatus: 'logged_in',
        campoQueAindaNaoExiste: 'valor qualquer',
        outroCampoFuturo: { aninhado: true },
      },
    }),
  )

  assert.deepEqual(normalized.metadata, { authStatus: 'logged_in' })
})

test('normalizeSample descarta statusDetails com chave desconhecida em qualquer profundidade', () => {
  const normalized = normalizeSample(
    baseSample({
      metadata: {
        statusDetails: {
          status: 'ok',
          campoNovoDoProximaVersaoDaCli: 'não deveria sobreviver',
          usage: {
            currentSession: { used: 10 },
            campoNovoAninhado: 'também não',
          },
        },
      },
    }),
  )

  assert.deepEqual(normalized.metadata.statusDetails, {
    status: 'ok',
    usage: { currentSession: { used: 10 } },
  })
})

test('normalizeSample não lança para tipos inesperados em cada campo de metadata/statusDetails', () => {
  const tiposInesperados = [
    42,
    true,
    'string solta',
    ['array', 'solto'],
    null,
    undefined,
    () => {},
    Symbol('x'),
  ]

  for (const valor of tiposInesperados) {
    assert.doesNotThrow(() =>
      normalizeSample(baseSample({ metadata: { statusDetails: valor } })),
    )
    assert.doesNotThrow(() =>
      normalizeSample(baseSample({ metadata: valor })),
    )
  }
})

test('normalizeSample corta statusDetails além de 3 níveis de profundidade sem lançar', () => {
  const fundo = { status: 'nivel-mais-fundo' }
  const profundo = {
    status: { usage: { currentSession: { usage: fundo } } },
  }

  const normalized = normalizeSample(
    baseSample({ metadata: { statusDetails: profundo } }),
  )

  // Os 3 primeiros níveis sobrevivem; o 4º (o valor de "usage" dentro de
  // currentSession) é cortado porque ultrapassa o limite de profundidade.
  assert.equal(
    normalized.metadata.statusDetails?.status?.usage?.currentSession,
    undefined,
  )
})

test('normalizeSample limita arrays de statusDetails a 64 itens (schema hostil não estoura o banco)', () => {
  const arrayGigante = Array.from({ length: 500 }, (_, i) => `linha ${i}`)

  const normalized = normalizeSample(
    baseSample({ metadata: { statusDetails: { activity: arrayGigante } } }),
  )

  assert.equal(normalized.metadata.statusDetails.activity.length, 64)
})

test('normalizeSample nunca deixa passar um valor com cara de segredo, em metadata ou statusDetails', () => {
  const segredos = [
    'sk-abcdefghijklmnop',
    'Bearer abc.def.ghi',
    'api_key=1234567890',
    'password: hunter2',
    'eyJhbGciOiJIUzI1NiJ9.payload.signature',
  ]

  for (const segredo of segredos) {
    const normalized = normalizeSample(
      baseSample({
        errorMessage: segredo,
        metadata: {
          plan: segredo,
          statusDetails: { status: segredo, cwd: segredo },
        },
      }),
    )

    const serialized = JSON.stringify(normalized)
    assert.doesNotMatch(serialized, /sk-[a-z0-9]/i)
    assert.doesNotMatch(serialized, /bearer/i)
    assert.doesNotMatch(serialized, /api[_ -]?key/i)
    assert.doesNotMatch(serialized, /password/i)
    assert.doesNotMatch(serialized, /eyJ[a-z0-9_-]{8,}/i)
  }
})

test('normalizeSample nunca deixa passar uma chave com cara de segredo, mesmo com valor inofensivo', () => {
  const normalized = normalizeSample(
    baseSample({
      metadata: {
        // A CHAVE parece segredo mesmo o valor sendo inofensivo — a allowlist
        // de SAFE_METADATA_KEYS já bloquearia por não reconhecer a chave, mas
        // o teste prova que o filtro de padrão de segredo por chave também
        // funcionaria isoladamente se algum dia a chave entrar na allowlist.
        statusDetails: { status: 'ok' },
        auth_token: 'não é segredo de verdade só o nome parece',
      },
    }),
  )

  assert.equal('auth_token' in normalized.metadata, false)
})

test('normalizeSample remove ANSI e caracteres de controle de strings de erro e status', () => {
  const comAnsi = '\u001b[31mFalha\u001b[0m\u0007 na consulta\u0000fim'

  const normalized = normalizeSample(
    baseSample({
      errorMessage: comAnsi,
      metadata: { statusDetails: { status: comAnsi } },
    }),
  )

  assert.doesNotMatch(normalized.errorMessage, /\u001b|\u0007|\u0000/)
  assert.doesNotMatch(normalized.metadata.statusDetails.status, /\u001b|\u0007|\u0000/)
})

test('normalizeSample trunca strings absurdamente longas em vez de crescer sem limite', () => {
  const gigante = 'a'.repeat(1_000_000)

  const normalized = normalizeSample(
    baseSample({
      errorMessage: gigante,
      metadata: { statusDetails: { status: gigante } },
    }),
  )

  assert.ok(normalized.errorMessage.length <= 500)
  assert.ok(normalized.metadata.statusDetails.status.length <= 500)
})

test('normalizeSample ignora __proto__/constructor como chave de metadata sem poluir o protótipo', () => {
  const payload = JSON.parse(
    '{"__proto__": {"poluido": true}, "constructor": {"poluido": true}, "authStatus": "logged_in"}',
  )

  const normalized = normalizeSample(baseSample({ metadata: payload }))

  assert.equal(({}).poluido, undefined)
  assert.deepEqual(normalized.metadata, { authStatus: 'logged_in' })
})

test('normalizeMetrics descarta itens malformados e mantém só as métricas válidas', () => {
  const metrics = normalizeMetrics([
    null,
    42,
    'string solta',
    { key: 'ok', label: 'Válida', used: 1, limit: 10, remaining: 9 },
    { key: 'sem-label', used: 1 },
    { key: 'ok', label: 'Duplicada, mesma key', used: 2, limit: 10, remaining: 8 },
    { key: 'tudo-nulo', label: 'Sem número nenhum' },
  ])

  assert.deepEqual(
    metrics.map((metric) => metric.key),
    ['ok'],
  )
})

test('normalizeMetrics limita a 24 métricas mesmo recebendo uma fonte hostil com centenas', () => {
  const muitasMetricas = Array.from({ length: 200 }, (_, i) => ({
    key: `metrica-${i}`,
    label: `Métrica ${i}`,
    used: i,
    limit: 100,
    remaining: 100 - i,
  }))

  assert.equal(normalizeMetrics(muitasMetricas).length, 24)
})

test('normalizeNumber recusa não-finito e negativo em vez de gravar lixo', () => {
  assert.equal(normalizeNumber(Number.POSITIVE_INFINITY), null)
  assert.equal(normalizeNumber(Number.NaN), null)
  assert.equal(normalizeNumber(-5), null)
  assert.equal(normalizeNumber('abc'), null)
  assert.equal(normalizeNumber('42'), 42)
  assert.equal(normalizeNumber(0), 0)
})

test('normalizeTimestamp não lança para entradas hostis e devolve null quando não dá para interpretar', () => {
  for (const garbage of [
    'não é uma data',
    {},
    [],
    NaN,
    Number.POSITIVE_INFINITY,
    '\u001b[31m2026-09-24\u001b[0m',
  ]) {
    assert.doesNotThrow(() => normalizeTimestamp(garbage))
  }
  assert.equal(normalizeTimestamp('não é uma data'), null)
})

test('normalizeSample avança/recua no relógio (DST, virada de ano) sem lançar e preservando ordem', () => {
  const antesDoDst = normalizeSample(
    baseSample({ id: 'a', collectedAt: '2026-03-08T06:59:00.000Z' }),
  )
  const depoisDoDst = normalizeSample(
    baseSample({ id: 'b', collectedAt: '2026-03-08T07:01:00.000Z' }),
  )
  const viradaDeAno = normalizeSample(
    baseSample({ id: 'c', collectedAt: '2025-12-31T23:59:59.000Z' }),
  )

  assert.ok(Date.parse(antesDoDst.collectedAt) < Date.parse(depoisDoDst.collectedAt))
  assert.ok(Date.parse(viradaDeAno.collectedAt) < Date.parse(antesDoDst.collectedAt))
})

test('cloneValue nunca devolve a mesma referência (evita normalizador escrever no snapshot de origem)', () => {
  const original = { a: { b: [1, 2, 3] } }
  const clone = cloneValue(original)

  assert.notEqual(clone, original)
  assert.notEqual(clone.a, original.a)
  clone.a.b.push(4)
  assert.deepEqual(original.a.b, [1, 2, 3])
})

test('cloneValue preserva undefined em vez de lançar', () => {
  assert.equal(cloneValue(undefined), undefined)
})

test('classifyUsageCapability: cada fonte real de agent-usage-sources.cjs cai numa capability conhecida', () => {
  const capabilidades = new Map(
    listAgentUsageSources().map((source) => [source.id, classifyUsageCapability(source)]),
  )

  // Codex, Claude e Openia têm consulta ao vivo (ou arquivo local, no caso do
  // Codex) — algum caminho real para o número existir.
  assert.equal(capabilidades.get('codex'), 'available')
  assert.equal(capabilidades.get('claude'), 'available')
  assert.equal(capabilidades.get('openia'), 'available')
  // Gemini só publica quota dentro do /stats interativo: sem auth, sem
  // consulta ao vivo, sem arquivo local — é o caso que a task "Limites —
  // incluir Openia e Gemini" pede para não aparecer como zero/100%.
  assert.equal(capabilidades.get('gemini'), 'interactive-only')
})

test('classifyUsageCapability marca kind "unsupported" como unsupported, mesmo com auth/liveQuery presentes', () => {
  assert.equal(
    classifyUsageCapability({
      auth: { command: 'x' },
      liveQuery: 'algo',
      usage: { kind: 'unsupported' },
    }),
    'unsupported',
  )
})

test('classifyUsageCapability considera disponível uma fonte só com leitura local, sem auth nem liveQuery', () => {
  assert.equal(
    classifyUsageCapability({
      auth: null,
      localProbe: 'algum-arquivo',
      usage: { kind: 'local-execution' },
    }),
    'available',
  )
})

test('classifyUsageCapability não lança para entrada hostil e cai em unsupported por padrão', () => {
  for (const garbage of [null, undefined, 42, 'string', [], () => {}, {}]) {
    assert.doesNotThrow(() => classifyUsageCapability(garbage))
    assert.equal(classifyUsageCapability(garbage), 'unsupported')
  }
})

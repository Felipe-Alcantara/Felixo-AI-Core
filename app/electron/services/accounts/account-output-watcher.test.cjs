'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const {
  PREFILTER_WORDS,
  createAccountOutputWatcher,
  passesPrefilter,
} = require('./account-output-watcher.cjs')
const {
  OUTPUT_WATCHER_DEBOUNCE_MS,
  OUTPUT_WATCHER_MAX_WAIT_MS,
  OUTPUT_WATCHER_SEEN_EVIDENCE_MAX,
  OUTPUT_WATCHER_TAIL_CHARS,
} = require('./account-chain-constants.cjs')
const { createReplayBuffer } = require('../pty-replay-buffer.cjs')

const VOCABULARY = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', '__fixtures__', 'cli-failure-vocabulary.json'), 'utf8'),
)

const SPINNER = '\x1b[2K\r⠋ Thinking… (12s · esc to interrupt) '
const CLAUDE_BANNER = 'Usage limit reached · continuing automatically at 4:40pm · esc to cancel'
const CODEX_BANNER =
  '■ You’ve hit your usage limit. Upgrade to Plus to continue using Codex (https://chatgpt.com/explore/plus), or try again at Oct 2, 2026 8:04 PM.'

/**
 * Vigia com relógio e agendador falsos, lendo a cauda de um buffer de replay
 * real — o mesmo que o PtyProcessManager entrega a ela.
 */
function criarVigia({ providerId = 'claude', onDetection } = {}) {
  let clock = 1_000_000
  const timers = []
  const warnings = []
  const detections = []
  const buffer = createReplayBuffer(200_000)
  const watcher = createAccountOutputWatcher({
    providerId,
    readTail: (count) => buffer.tail(count),
    onDetection: onDetection ?? ((detection) => detections.push(detection)),
    now: () => clock,
    setTimer: (callback, delayMs) => {
      const timer = { callback, at: clock + delayMs, active: true }
      timers.push(timer)
      return timer
    },
    clearTimer: (timer) => {
      timer.active = false
    },
    logger: { warn: (...args) => warnings.push(args) },
  })

  const activeTimers = () => timers.filter((timer) => timer.active)

  return {
    watcher,
    buffer,
    detections,
    warnings,
    activeTimers,
    now: () => clock,
    write(text) {
      buffer.append(text)
      watcher.push()
    },
    /** Avança o relógio disparando, em ordem, os timers que vencem no caminho. */
    advance(ms) {
      const target = clock + ms
      for (;;) {
        const due = activeTimers()
          .filter((timer) => timer.at <= target)
          .sort((left, right) => left.at - right.at)[0]
        if (!due) break
        clock = Math.max(clock, due.at)
        due.active = false
        due.callback()
      }
      clock = target
    },
  }
}

function fixturePhrases(predicate) {
  return Object.entries(VOCABULARY.providers).flatMap(([providerId, provider]) =>
    provider.phrases.filter(predicate).map((phrase) => ({ providerId, phrase })),
  )
}

test('antes do limite: 2000 quadros de spinner e o agente escrevendo sobre "rate limit" não geram detecção', () => {
  for (const providerId of ['claude', 'codex', 'gemini']) {
    const vigia = criarVigia({ providerId })
    for (let index = 0; index < 2000; index += 1) {
      vigia.write(`${SPINNER}${index}`)
      if (index % 100 === 0) {
        vigia.write(
          '\r\n  if (response.status === 429) throw new RateLimitError("rate limit / too many requests")\r\n' +
            '  // usage limit reached? retry with backoff; 401 Unauthorized => refresh\r\n',
        )
      }
      vigia.advance(10)
    }
    vigia.advance(OUTPUT_WATCHER_MAX_WAIT_MS)

    assert.deepEqual(vigia.detections, [], providerId)
    assert.ok(vigia.watcher.stats.scans > 0, `${providerId}: a vigia deveria ter varrido`)
  }
})

test('durante: o aviso partido em 3 pedaços, com CSI de cursor entre as palavras, gera 1 detecção', () => {
  const vigia = criarVigia()
  vigia.write(`${SPINNER}\r\n`)
  vigia.write('\x1b[1mUsage limit\x1b[1C')
  vigia.write('reached · continuing\x1b[1Cautomatically')
  vigia.write(' at 4:40pm · esc to cancel\x1b[0m\r\n')
  vigia.advance(OUTPUT_WATCHER_DEBOUNCE_MS)

  assert.equal(vigia.detections.length, 1)
  const [detection] = vigia.detections
  assert.equal(detection.kind, 'failure')
  assert.equal(detection.failure.failureClass, 'limit')
  assert.equal(detection.failure.scope, 'account')
  assert.equal(detection.failure.origin, 'pty')
  assert.equal(detection.failure.providerId, 'claude')
  assert.equal(detection.detectedAt, vigia.now())
  assert.match(detection.failure.evidence, /Usage limit reached · continuing automatically at 4:40pm/)
})

test('depois: o aviso redesenhado 50 vezes continua sendo 1 detecção', () => {
  const vigia = criarVigia()
  for (let index = 0; index < 50; index += 1) {
    vigia.write(`\r\x1b[2K${CLAUDE_BANNER}`)
    vigia.advance(OUTPUT_WATCHER_DEBOUNCE_MS + 10)
  }

  assert.equal(vigia.detections.length, 1)
  assert.ok(vigia.watcher.stats.scans >= 50)
})

test('debounce: varre depois de 400 ms de silêncio, não antes', () => {
  const vigia = criarVigia()
  vigia.write(`${CLAUDE_BANNER}\r\n`)
  vigia.advance(OUTPUT_WATCHER_DEBOUNCE_MS - 1)
  assert.equal(vigia.watcher.stats.scans, 0)
  assert.equal(vigia.watcher.pending, true)

  vigia.advance(1)
  assert.equal(vigia.watcher.stats.scans, 1)
  assert.equal(vigia.watcher.pending, false)
  assert.equal(vigia.detections.length, 1)
  // Sem saída nova, nenhum timer fica armado.
  assert.equal(vigia.activeTimers().length, 0)
})

test('espera máxima: saída contínua é varrida a cada 2 s, e nunca mais de uma vez a cada 400 ms', () => {
  const vigia = criarVigia()
  const step = 100
  // Pedaços a cada 100 ms: o silêncio de 400 ms nunca chega.
  for (let elapsed = 0; elapsed < OUTPUT_WATCHER_MAX_WAIT_MS - step; elapsed += step) {
    vigia.write(`${SPINNER}${elapsed}`)
    vigia.advance(step)
  }
  assert.equal(vigia.watcher.stats.scans, 0, 'varreu antes da espera máxima')

  vigia.write(SPINNER)
  vigia.advance(step)
  assert.equal(vigia.watcher.stats.scans, 1, 'não varreu na espera máxima')

  const totalMs = 10_000
  for (let elapsed = 0; elapsed < totalMs; elapsed += step) {
    vigia.write(SPINNER)
    vigia.advance(step)
  }
  const scans = vigia.watcher.stats.scans - 1
  assert.ok(scans <= totalMs / OUTPUT_WATCHER_DEBOUNCE_MS, `${scans} varreduras em ${totalMs} ms`)
  assert.ok(scans >= totalMs / OUTPUT_WATCHER_MAX_WAIT_MS - 1, `${scans} varreduras em ${totalMs} ms`)
  // Nunca mais de um timer armado por sessão.
  assert.ok(vigia.activeTimers().length <= 1)
})

test('flush pega a última mensagem na hora, sem esperar o debounce', () => {
  const vigia = criarVigia({ providerId: 'codex' })
  vigia.write('Not logged in\r\n')

  const emitted = vigia.watcher.flush()

  assert.equal(emitted.length, 1)
  assert.equal(vigia.detections[0].failure.failureClass, 'auth')
  assert.deepEqual(vigia.watcher.flush(), [], 'sem saída nova, o flush não varre de novo')
})

test('dispose desarma o timer, e depois dele nada mais varre nem arma timer', () => {
  const vigia = criarVigia()
  vigia.write(`${CLAUDE_BANNER}\r\n`)
  assert.equal(vigia.activeTimers().length, 1)

  vigia.watcher.dispose()
  assert.equal(vigia.activeTimers().length, 0)

  vigia.write(`${CLAUDE_BANNER}\r\n`)
  assert.equal(vigia.activeTimers().length, 0)
  assert.deepEqual(vigia.watcher.scan(), [])
  assert.deepEqual(vigia.watcher.flush(), [])
  vigia.advance(OUTPUT_WATCHER_MAX_WAIT_MS)
  assert.deepEqual(vigia.detections, [])
  vigia.watcher.dispose()
})

test('consumidor que lança não quebra a vigia, e o log não leva a saída do terminal', () => {
  let calls = 0
  const vigia = criarVigia({
    onDetection: () => {
      calls += 1
      throw new Error('serviço indisponível')
    },
  })
  vigia.write('Usage limit reached · continuing shortly · esc to cancel  sk-ant-api03-SEGREDO\r\n')
  vigia.advance(OUTPUT_WATCHER_DEBOUNCE_MS)
  vigia.write(`${CLAUDE_BANNER}\r\n`)
  vigia.advance(OUTPUT_WATCHER_DEBOUNCE_MS)

  assert.equal(calls, 2)
  assert.equal(vigia.warnings.length, 2)
  assert.doesNotMatch(JSON.stringify(vigia.warnings), /SEGREDO|logged|Usage/)
})

test('leitura da cauda que lança vira "nada detectado", sem exceção no timer', () => {
  const warnings = []
  const timers = []
  let clock = 0
  const watcher = createAccountOutputWatcher({
    providerId: 'claude',
    readTail: () => {
      throw new Error('buffer indisponível')
    },
    onDetection: () => assert.fail('não deveria detectar'),
    now: () => clock,
    setTimer: (callback) => timers.push(callback),
    clearTimer: () => {},
    logger: { warn: (...args) => warnings.push(args) },
  })
  watcher.push()
  clock = OUTPUT_WATCHER_DEBOUNCE_MS

  assert.doesNotThrow(() => timers[0]())
  assert.equal(watcher.stats.scans, 1)
  assert.equal(warnings.length, 1)
})

test('sem provedor com frase para vigiar não há vigia: shell, comando desconhecido e Openia', () => {
  const base = { readTail: () => '', onDetection: () => {} }
  for (const providerId of [undefined, null, '', 'bash', 'openia', 'desconhecido']) {
    assert.equal(createAccountOutputWatcher({ ...base, providerId }), null, String(providerId))
  }
  assert.equal(createAccountOutputWatcher({ providerId: 'claude', onDetection: () => {} }), null)
  assert.equal(createAccountOutputWatcher({ providerId: 'claude', readTail: () => '' }), null)

  for (const providerId of ['claude', 'codex', 'codex-app-server', 'gemini', 'gemini-acp']) {
    const watcher = createAccountOutputWatcher({ ...base, providerId })
    assert.ok(watcher, providerId)
    watcher.dispose()
  }
})

test('o pré-filtro nunca esconde uma frase do terminal: toda frase da fixture passa por ele e é detectada', () => {
  const terminalPhrases = fixturePhrases((phrase) => phrase.terminal && phrase.kind === 'include')
  assert.ok(terminalPhrases.length >= 20)

  for (const { providerId, phrase } of terminalPhrases) {
    assert.ok(passesPrefilter(phrase.example.toLowerCase(), PREFILTER_WORDS[providerId]), `${phrase.id}: barrada no pré-filtro`)

    const vigia = criarVigia({ providerId })
    vigia.write(`${SPINNER}\r\n${phrase.example}\r\n`)
    vigia.watcher.flush()
    assert.equal(vigia.detections.length, 1, phrase.id)
    assert.equal(vigia.detections[0].failure.failureClass, phrase.failureClass, phrase.id)
    assert.equal(vigia.detections[0].failure.scope, phrase.scope, phrase.id)
  }
})

test('o spinner nunca passa no pré-filtro: a taxonomia só roda quando há o que achar', () => {
  for (const providerId of ['claude', 'codex', 'gemini']) {
    const vigia = criarVigia({ providerId })
    for (let index = 0; index < 200; index += 1) vigia.write(`${SPINNER}${index}`)
    vigia.watcher.flush()
    assert.equal(vigia.watcher.stats.scans, 1)
    assert.equal(vigia.watcher.stats.prefilterHits, 0, providerId)
  }
})

test('exclusões da fixture não viram detecção no terminal', () => {
  for (const { providerId, phrase } of fixturePhrases((item) => item.kind === 'exclude' || item.kind === 'observed')) {
    const vigia = criarVigia({ providerId })
    vigia.write(`${phrase.example}\r\n`)
    vigia.watcher.flush()
    assert.deepEqual(vigia.detections, [], phrase.id)
  }
})

test('cauda cheia: a primeira linha, cortada no meio, não conta ("Auth: Not logged in" não vira "Not logged in")', () => {
  const vigia = criarVigia({ providerId: 'codex' })
  const filler = 'ok\r\n'.repeat(Math.ceil(OUTPUT_WATCHER_TAIL_CHARS / 4))
  const cut = 'Not logged in\r\n'
  const rest = filler.slice(-(OUTPUT_WATCHER_TAIL_CHARS - cut.length))
  vigia.write(`${'x'.repeat(50)}\r\n  • Auth: ${cut}${rest}`)
  assert.equal(vigia.buffer.tail(OUTPUT_WATCHER_TAIL_CHARS).startsWith('Not logged in'), true)

  vigia.watcher.flush()
  assert.deepEqual(vigia.detections, [])

  // A mesma linha inteira, perto do fim, é detectada.
  vigia.write('Not logged in\r\n')
  vigia.watcher.flush()
  assert.equal(vigia.detections.length, 1)
  assert.equal(vigia.detections[0].failure.failureClass, 'auth')
})

test(`dedupe: cada sessão lembra as ${OUTPUT_WATCHER_SEEN_EVIDENCE_MAX} evidências mais recentes`, () => {
  const vigia = criarVigia()
  const banner = (minute) => `Usage limit reached · continuing automatically at 1:${String(minute).padStart(2, '0')}pm · esc to cancel\r\n`
  const total = OUTPUT_WATCHER_SEEN_EVIDENCE_MAX + 1
  for (let minute = 0; minute < total; minute += 1) {
    vigia.write(banner(minute))
    vigia.watcher.flush()
  }
  assert.equal(vigia.detections.length, total)

  // A mais recente continua lembrada; a primeira saiu da memória.
  vigia.write(banner(total - 1))
  vigia.watcher.flush()
  assert.equal(vigia.detections.length, total)

  vigia.write(banner(0))
  vigia.watcher.flush()
  assert.equal(vigia.detections.length, total + 1)
})

test('aviso de reset do Claude: uma vez enquanto está na tela, de novo quando reaparece depois de sair', () => {
  const vigia = criarVigia()
  vigia.write(`${CLAUDE_BANNER}\r\n`)
  vigia.watcher.flush()
  const reset = 'Your usage limit has reset · press enter to continue'
  for (let index = 0; index < 5; index += 1) {
    vigia.write(`\r\x1b[2K${reset}`)
    vigia.watcher.flush()
  }

  const notices = () => vigia.detections.filter((detection) => detection.kind === 'notice')
  assert.equal(notices().length, 1)
  assert.deepEqual(
    { kind: notices()[0].kind, notice: notices()[0].notice, providerId: notices()[0].providerId },
    { kind: 'notice', notice: 'limit_reset', providerId: 'claude' },
  )
  // O aviso não repete a falha já vista.
  assert.equal(vigia.detections.filter((detection) => detection.kind === 'failure').length, 1)

  // O agente volta a trabalhar e o aviso sai da cauda.
  vigia.write('\r\n'.concat('trabalhando no código\r\n'.repeat(300)))
  vigia.watcher.flush()
  vigia.write(`${reset}\r\n`)
  vigia.watcher.flush()
  assert.equal(notices().length, 2)
})

test('variantes de renderização: quebra de linha, cursor absoluto, CR de redesenho e repintura do ConPTY', () => {
  const casos = [
    // Codex a 80 colunas: a frase cabe na primeira linha da quebra.
    { providerId: 'codex', text: `${CODEX_BANNER.slice(0, 70)}\r\n${CODEX_BANNER.slice(70)}\r\n`, detecta: true },
    // Codex a 40 colunas: "You’ve hit your usage limit." ainda cabe na linha.
    { providerId: 'codex', text: `${CODEX_BANNER.slice(0, 38)}\r\n${CODEX_BANNER.slice(38, 76)}\r\n`, detecta: true },
    // Claude a 80 colunas: o aviso inteiro cabe.
    { providerId: 'claude', text: `${CLAUDE_BANNER}\r\n`, detecta: true },
    // Claude a 40 colunas: a TUI quebra a própria frase. Limite declarado:
    // bloco mais estreito que a frase não detecta (fail-closed).
    { providerId: 'claude', text: 'Usage limit reached · continuing\r\nautomatically at 4:40pm · esc to cancel\r\n', detecta: false },
    // Cursor absoluto (ratatui): a linha é posicionada, não quebrada.
    { providerId: 'codex', text: `\x1b[23;1H\x1b[2K${CODEX_BANNER}\x1b[24;1H\x1b[2K› `, detecta: true },
    // CR de redesenho em cima do spinner.
    { providerId: 'claude', text: `${SPINNER}\r\x1b[2K${CLAUDE_BANNER}`, detecta: true },
    // Repintura de tela inteira estilo ConPTY, três vezes.
    {
      providerId: 'claude',
      text: [1, 2, 3]
        .map(() => `\x1b[H\x1b[2J\x1b[1;1H> tarefa\x1b[2;1H${SPINNER}\x1b[3;1H${CLAUDE_BANNER}\x1b[4;1H`)
        .join(''),
      detecta: true,
    },
  ]

  for (const [index, caso] of casos.entries()) {
    const vigia = criarVigia({ providerId: caso.providerId })
    vigia.write(caso.text)
    vigia.advance(OUTPUT_WATCHER_DEBOUNCE_MS)
    assert.equal(vigia.detections.length, caso.detecta ? 1 : 0, `caso ${index}`)
    if (caso.detecta) assert.equal(vigia.detections[0].failure.failureClass, 'limit', `caso ${index}`)
  }
})

test('push por pedaço não lê a cauda nem classifica: só a varredura lê', () => {
  let reads = 0
  const timers = []
  const watcher = createAccountOutputWatcher({
    providerId: 'codex',
    readTail: () => {
      reads += 1
      return ''
    },
    onDetection: () => {},
    now: () => 0,
    setTimer: (callback) => {
      timers.push(callback)
      return timers.length
    },
    clearTimer: () => {},
  })
  for (let index = 0; index < 10_000; index += 1) watcher.push(index)

  assert.equal(reads, 0)
  assert.equal(timers.length, 1, 'um timer só por janela, não por pedaço')
  assert.equal(watcher.lastChunkAt, 9_999)
  watcher.scan()
  assert.equal(reads, 1)
})

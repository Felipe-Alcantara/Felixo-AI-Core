'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const benchmark = require('./terminal-scrollback-benchmark.cjs')

test('a bancada usa os quatro tamanhos pedidos por padrão', () => {
  const options = benchmark.parseArgs([])

  assert.deepEqual(options.counts, [1, 5, 10, 20])
  assert.deepEqual(options.scrollbacks, [5_000, 20_000])
  assert.deepEqual(options.policies, ['current', 'adaptive'])
  assert.equal(options.adaptiveScrollback, 5_000)
  assert.equal(options.adaptiveThreshold, 10)
})

test('a bancada permite isolar a política e rejeita nomes desconhecidos', () => {
  assert.deepEqual(benchmark.parseArgs(['--policies=adaptive']).policies, ['adaptive'])
  assert.throws(() => benchmark.parseArgs(['--policies=current,other']), /policies/i)
})

test('a bancada rejeita cenários acima do teto controlado', () => {
  assert.throws(() => benchmark.parseArgs(['--counts=21']), /counts.*20/i)
  assert.throws(() => benchmark.parseArgs(['--scrollbacks=50001']), /scrollbacks.*50000/i)
  assert.throws(() => benchmark.parseArgs(['--lines=30001']), /lines.*30000/i)
  assert.throws(() => benchmark.parseArgs(['--native-lines=30001']), /native-lines.*30000/i)
  assert.throws(() => benchmark.parseArgs(['--native-drain-ms=10001']), /native-drain-ms.*10000/i)
})

test('o modo check valida que todos os cenários entregaram a carga', () => {
  assert.equal(benchmark.parseArgs(['--check']).check, true)
  assert.deepEqual(benchmark.validateReport({
    results: [
      {
        phase: 'native-pty',
        count: 2,
        linesPerTerminal: 4,
        linesBySession: [4, 4],
        timedOut: false,
      },
      {
        phase: 'renderer-xterm',
        count: 2,
        scrollback: 5000,
        linesPerTerminal: 4,
        linesWritten: [4, 4],
        resumedRows: [36, 36],
      },
    ],
  }), [])
  assert.deepEqual(benchmark.validateReport({
    results: [{
      phase: 'native-pty',
      count: 20,
      linesPerTerminal: 4,
      linesBySession: [4, 3],
      timedOut: true,
    }],
  }), ['native count=20: timeout', 'native count=20: saída incompleta'])
})

test('o modo check detecta perda de identidade e regressão da política adaptativa', () => {
  const base = {
    phase: 'renderer-xterm',
    policy: 'current',
    count: 10,
    scrollback: 20_000,
    linesPerTerminal: 8_000,
    linesWritten: [8_000],
    resumedRows: [32],
    lineIntegrity: [{ outputComplete: true, unexpectedGap: false }],
    detachAttachPreserved: true,
    resumeIntegrity: [{ outputComplete: true, unexpectedGap: false }],
    resumeMs: 100,
    rendererWorkingSetMiB: { p95: 100 },
  }
  const adaptive = {
    ...base,
    policy: 'adaptive',
    scrollback: 5_000,
    lineIntegrity: [{ outputComplete: false, unexpectedGap: true }],
    resumeIntegrity: [{ outputComplete: false, unexpectedGap: true }],
    resumeMs: 200,
    rendererWorkingSetMiB: { p95: 99 },
  }

  assert.deepEqual(
    benchmark.validateReport({
      scenario: { adaptiveScrollback: 5_000, adaptiveThreshold: 10 },
      results: [base, adaptive],
    }),
    [
      'renderer count=10 scrollback=5000: identidade da saída perdida ou com lacuna inesperada',
      'renderer count=10 scrollback=5000: resume perdeu o trecho final',
      'adaptive count=10: não reduziu o RSS p95 do renderer em pelo menos 5%',
      'adaptive count=10: resume regrediu mais de 25%',
    ],
  )
})

test('percentis são estáveis para amostras vazias, pares e ímpares', () => {
  assert.equal(benchmark.percentile([], 0.5), null)
  assert.equal(benchmark.percentile([1, 3, 2], 0.5), 2)
  assert.equal(benchmark.percentile([1, 2, 3, 4], 0.95), 3.85)
  assert.deepEqual(benchmark.summarize([4, 1, 3, 2]), {
    count: 4,
    p50: 2.5,
    p95: 3.85,
    max: 4,
  })
})

test('o gate usa o delta de heap quando o RSS foi contaminado pelo renderer compartilhado', () => {
  const base = {
    phase: 'renderer-xterm',
    policy: 'current',
    count: 10,
    scrollback: 20_000,
    linesPerTerminal: 8_000,
    linesWritten: [8_000],
    resumedRows: [32],
    lineIntegrity: [{ outputComplete: true, unexpectedGap: false }],
    detachAttachPreserved: true,
    resumeIntegrity: [{ outputComplete: true, unexpectedGap: false }],
    resumeMs: 100,
    // RSS is intentionally worse in the candidate, as can happen after a
    // previous scenario kept Chromium pages in its working set.
    rendererWorkingSetMiB: { p95: 200 },
    heapBefore: { usedJsHeapBytes: 1_000 },
    heapAfterStream: { usedJsHeapBytes: 11_000 },
  }
  const adaptive = {
    ...base,
    policy: 'adaptive',
    scrollback: 5_000,
    rendererWorkingSetMiB: { p95: 300 },
    heapBefore: { usedJsHeapBytes: 2_000 },
    heapAfterStream: { usedJsHeapBytes: 10_000 },
  }

  assert.equal(
    benchmark.heapStreamDeltaBytes(adaptive),
    8_000,
  )
  assert.deepEqual(
    benchmark.validateReport({
      scenario: { adaptiveScrollback: 5_000, adaptiveThreshold: 10 },
      results: [base, adaptive],
    }),
    [],
  )
})

test('o emissor nativo não injeta valores fora dos parâmetros do cenário', () => {
  const source = benchmark.buildEmitterCode({
    lines: 10,
    burst: 2,
    intervalMs: 4,
    holdMs: 100,
    sessionIndex: 3,
    lineWidth: 80,
    longPromptChars: 16,
    longEvery: 5,
  })

  assert.match(source, /const total = 10/)
  assert.match(source, /const burst = 2/)
  assert.match(source, /sessionIndex = 3/)
  assert.match(source, /longPromptChars = 16/)
})

// Executa o código do emissor num contexto isolado, com stdout, timers e exit
// falsos, para observar a ORDEM entre a última escrita e o process.exit.
function runEmitter(source, { flushWrites }) {
  const vm = require('node:vm')
  const timers = []
  const pendingCallbacks = []
  const events = []
  const fakeProcess = {
    stdout: {
      write(chunk, callback) {
        events.push(`write:${String(chunk).split('\n').length - 1}`)
        if (callback) pendingCallbacks.push(callback)
        return true
      },
    },
    exit(code) {
      events.push(`exit:${code}`)
    },
  }
  vm.runInNewContext(source, {
    process: fakeProcess,
    setTimeout: (fn) => timers.push(fn),
  })
  // Roda os timers até esgotar; `flushWrites` decide se o SO já drenou.
  for (let guard = 0; guard < 1000 && (timers.length || (flushWrites && pendingCallbacks.length)); guard += 1) {
    if (flushWrites) while (pendingCallbacks.length) pendingCallbacks.shift()()
    if (timers.length) timers.shift()()
  }
  return events
}

test('o emissor só agenda o exit depois que a última escrita drenou', () => {
  // Regressão: no Windows a escrita num TTY (ConPTY) é assíncrona, e
  // process.exit() descarta o que ainda não drenou. Com 20 PTYs, uma sessão
  // ociosa (tudo num write só) parou em 1110 de 2003 linhas em duas runs
  // (36197035555 e 36200639956).
  const source = benchmark.buildEmitterCode({
    lines: 6, burst: 6, intervalMs: 0, holdMs: 0, sessionIndex: 1, lineWidth: 40, longPromptChars: 0, longEvery: 2000,
  })
  assert.deepEqual(runEmitter(source, { flushWrites: false }), ['write:6'])
  assert.deepEqual(runEmitter(source, { flushWrites: true }), ['write:6', 'exit:0'])
})

test('sessões ativas continuam no mesmo ritmo e saem depois do último pedaço', () => {
  const source = benchmark.buildEmitterCode({
    lines: 5, burst: 2, intervalMs: 4, holdMs: 0, sessionIndex: 0, lineWidth: 40, longPromptChars: 0, longEvery: 2000,
  })
  // Os pedaços intermediários não esperam o dreno (ritmo inalterado); só o
  // exit espera a última escrita.
  assert.deepEqual(runEmitter(source, { flushWrites: false }), ['write:2', 'write:2', 'write:1'])
  assert.deepEqual(runEmitter(source, { flushWrites: true }), ['write:2', 'write:2', 'write:1', 'exit:0'])
})

// PTY falso: entrega a saída no ritmo pedido e sai antes do último pedaço,
// como o ConPTY sob carga faz no Windows.
function fakeSpawnPty(schedule) {
  return () => {
    const dataListeners = []
    const exitListeners = []
    for (const step of schedule) {
      setTimeout(() => {
        if (step.exit) exitListeners.forEach((listener) => listener({ exitCode: 0 }))
        else dataListeners.forEach((listener) => listener(step.data))
      }, step.at)
    }
    return {
      pid: 2 ** 22 + 12345,
      onData: (listener) => dataListeners.push(listener),
      onExit: (listener) => exitListeners.push(listener),
      kill() {},
    }
  }
}

const NATIVE_OPTIONS = {
  nativeLinesPerTerminal: 4,
  chunkLines: 4,
  activeIntervalMs: 4,
  nativeHoldMs: 0,
  nativeDrainMs: 600,
  timeoutMs: 10_000,
  sampleIntervalMs: 5_000,
  lineWidth: 40,
  longPromptChars: 0,
  longEvery: 2_000,
}

test('o dreno do PTY nativo espera enquanto a saída ainda chega depois que o filho saiu', async () => {
  // Regressão: a janela contava da saída do filho, e a bancada declarava
  // "saída incompleta" com o ConPTY ainda entregando (runs 36218374141 e
  // 36218883853, 1.826 e 977 de 2.003 linhas).
  const spawnPty = fakeSpawnPty([
    { at: 10, data: 'a\nb\n' },
    { at: 40, exit: true },
    { at: 450, data: 'c\n' },
    { at: 900, data: 'd\n' },
  ])
  const result = await benchmark.benchmarkNativePtys({ spawnPty, count: 1, ...NATIVE_OPTIONS })
  assert.deepEqual(result.linesBySession, [4])
  assert.equal(result.timedOut, false)
})

test('o dreno do PTY nativo desiste quando a saída para de chegar', async () => {
  const spawnPty = fakeSpawnPty([
    { at: 10, data: 'a\n' },
    { at: 40, exit: true },
  ])
  const startedAt = Date.now()
  const result = await benchmark.benchmarkNativePtys({ spawnPty, count: 1, ...NATIVE_OPTIONS })
  assert.deepEqual(result.linesBySession, [1])
  assert.equal(result.timedOut, true)
  assert.ok(Date.now() - startedAt < 5_000, 'não espera até o teto quando nada mais chega')
})

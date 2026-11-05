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
  }, { platform: 'linux' }), ['native count=20: timeout', 'native count=20: saída incompleta'])
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

test('abaixo do limite adaptativo as duas políticas são a mesma configuração: resume diferente é ruído', () => {
  // count=5 com limite 10: `adaptive` e `current` usam o mesmo scrollback, então
  // a diferença entre as duas medidas só mostra a variação do runner (na main,
  // 246–408 ms no macOS com o mesmo código). Reprovou o PR #107 duas vezes.
  const base = {
    phase: 'renderer-xterm',
    policy: 'current',
    count: 5,
    scrollback: 20_000,
    linesPerTerminal: 8_000,
    linesWritten: [8_000],
    resumedRows: [32],
    lineIntegrity: [{ outputComplete: true, unexpectedGap: false }],
    detachAttachPreserved: true,
    resumeIntegrity: [{ outputComplete: true, unexpectedGap: false }],
    resumeMs: 136,
  }
  const adaptive = { ...base, policy: 'adaptive', resumeMs: 288 }

  assert.deepEqual(
    benchmark.validateReport({
      scenario: { adaptiveScrollback: 5_000, adaptiveThreshold: 10 },
      results: [base, adaptive],
    }),
    [],
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
  teardownTimeoutMs: 1_000,
  teardownSettleMs: 0,
  forensicsWaitMs: 40,
  forensicsAfterKillMs: 40,
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
  assert.equal(result.forensics, undefined, 'uma fase completa não carrega investigação')
})

test('sessão que para antes do fim: o resultado fica no veredito e a investigação registra o que chegou depois', async () => {
  // Perda de saída do ConPTY no Windows. A saída para em 2 linhas (o filho
  // sai), o veredito sai, e depois chegam mais 2 bytes durante a espera e mais
  // 2 depois do kill: o resultado não muda, mas a investigação diz onde estava
  // a saída que faltava.
  const dataListeners = []
  const exitListeners = []
  const spawnPty = () => {
    setTimeout(() => dataListeners.forEach((listener) => listener('a\nb\n')), 10)
    setTimeout(() => exitListeners.forEach((listener) => listener({ exitCode: 0 })), 40)
    setTimeout(() => dataListeners.forEach((listener) => listener('c\n')), 300)
    // Sem `pid`, o amostrador de memória não roda: no Windows ele abre um
    // PowerShell, que atrasa o início da espera e tira a ordem dos eventos.
    return {
      onData: (listener) => dataListeners.push(listener),
      onExit: (listener) => exitListeners.push(listener),
      kill() {
        setTimeout(() => dataListeners.forEach((listener) => listener('d\n')), 5)
      },
    }
  }
  const result = await benchmark.benchmarkNativePtys({
    spawnPty,
    count: 1,
    ...NATIVE_OPTIONS,
    nativeDrainMs: 100,
    forensicsWaitMs: 300,
    forensicsAfterKillMs: 150,
  })

  assert.equal(result.timedOut, true)
  assert.deepEqual(result.linesBySession, [2], 'o que chegou depois do veredito não entra no resultado')
  assert.deepEqual(result.outputBytesBySession, [4])
  assert.equal(result.outputBytes, 4)

  assert.equal(result.forensics.shortSessions.length, 1)
  const [sessao] = result.forensics.shortSessions
  assert.equal(sessao.session, 0)
  assert.equal(sessao.active, true)
  assert.equal(sessao.pid, null)
  assert.equal(sessao.lines, 2)
  assert.equal(sessao.bytes, 4)
  assert.equal(sessao.exited, true)
  assert.equal(sessao.childAlive, false)
  assert.ok(sessao.lastDataMsBeforeVerdict >= 0 && sessao.exitedMsBeforeVerdict >= 0)
  assert.equal(sessao.bytesGainedBeforeKill, 2, 'a saída que chegou durante a espera')
  assert.equal(sessao.bytesGainedAfterKill, 2, 'a saída que chegou depois do kill')
})

test('só as sessões curtas entram na investigação', async () => {
  const completa = fakeSpawnPty([{ at: 10, data: 'a\nb\nc\nd\n' }])
  const curta = fakeSpawnPty([{ at: 10, data: 'a\n' }, { at: 40, exit: true }])
  let abertas = 0
  const spawnPty = (...args) => (abertas++ === 0 ? completa(...args) : curta(...args))
  const result = await benchmark.benchmarkNativePtys({ spawnPty, count: 2, ...NATIVE_OPTIONS, nativeDrainMs: 100 })

  assert.deepEqual(result.linesBySession, [4, 1])
  assert.deepEqual(result.forensics.shortSessions.map((sessao) => [sessao.session, sessao.active, sessao.lines]), [[1, false, 1]])
  assert.equal(result.forensics.shortSessions[0].pid, 2 ** 22 + 12345, 'o pid do PTY que parou fica no relatório')
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

test('a desmontagem espera os PTYs da fase saírem antes de liberar a próxima', async () => {
  // Regressão: a fase count=20 abria 20 PTYs enquanto os da fase anterior
  // ainda morriam, e sessões novas perdiam saída no Windows.
  const { spawn } = require('node:child_process')
  const filho = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 400)'], { stdio: 'ignore' })
  await new Promise((resolve) => filho.once('spawn', resolve))
  const inicio = Date.now()
  const vivos = await benchmark.waitForProcessesToExit([filho.pid], { timeoutMs: 5_000, pollMs: 20 })
  assert.deepEqual(vivos, [])
  assert.ok(Date.now() - inicio >= 250, 'esperou o processo sair')
})

test('a desmontagem desiste no teto e devolve quem continua vivo', async () => {
  const vivos = await benchmark.waitForProcessesToExit([111, 222], { timeoutMs: 120, pollMs: 20, isAlive: (pid) => pid === 222 })
  assert.deepEqual(vivos, [222])
})

test('quarentena: no Windows a saída incompleta da fase nativa count=20 vira aviso, não falha', () => {
  const nativo = (count) => ({ phase: 'native-pty', count, timedOut: true, linesPerTerminal: 2000, linesBySession: [2000, 1178] })
  const relatorio = { results: [nativo(20)] }
  assert.deepEqual(benchmark.validateReport(relatorio, { platform: 'win32' }), [])
  assert.deepEqual(benchmark.quarantineWarnings(relatorio, { platform: 'win32' }), [
    'native count=20: timeout',
    'native count=20: saída incompleta',
  ])
})

test('quarentena não vale fora do Windows nem para as outras contagens', () => {
  const nativo = (count) => ({ phase: 'native-pty', count, timedOut: false, linesPerTerminal: 2000, linesBySession: [2000, 1500] })
  assert.deepEqual(benchmark.validateReport({ results: [nativo(20)] }, { platform: 'linux' }), ['native count=20: saída incompleta'])
  assert.deepEqual(benchmark.validateReport({ results: [nativo(10)] }, { platform: 'win32' }), ['native count=10: saída incompleta'])
  assert.deepEqual(benchmark.quarantineWarnings({ results: [nativo(10)] }, { platform: 'win32' }), [])
})

test('a soma de memória dos PTYs usa todos os pids de uma vez e ignora os que já saíram', async () => {
  // No Windows isto é um PowerShell só; antes eram 20 em paralelo a cada 250 ms.
  const { spawn } = require('node:child_process')
  const filhos = [1, 2].map(() =>
    spawn(process.execPath, ['-e', "console.log('pronto'); setTimeout(() => {}, 15000)"], { stdio: ['ignore', 'pipe', 'ignore'] }),
  )
  try {
    // O evento `spawn` só diz que o processo foi criado: no macOS do CI o `node`
    // ainda tinha ~3,7 MiB de memória residente nesse instante. A marca no stdout
    // diz que ele terminou de subir, e é só então que passa de 20 MiB.
    await Promise.all(filhos.map((filho) => new Promise((resolve) => filho.stdout.once('data', resolve))))
    const dois = await benchmark.sumProcessRssKiB(filhos.map((filho) => filho.pid))
    const comUmInexistente = await benchmark.sumProcessRssKiB([...filhos.map((filho) => filho.pid), 2 ** 22 + 99])
    const so = await benchmark.sumProcessRssKiB([filhos[0].pid])
    // Cada `node` ocioso passa de 20 MiB de memória residente.
    assert.ok(dois > 2 * 20 * 1024, `soma dos dois processos: ${dois} KiB`)
    assert.ok(so > 20 * 1024 && so < dois, 'um processo vale menos que dois')
    assert.ok(comUmInexistente > 2 * 20 * 1024, 'um pid inexistente não derruba a amostra')
    assert.equal(await benchmark.sumProcessRssKiB([]), null)
    assert.equal(await benchmark.sumProcessRssKiB([2 ** 22 + 99]), null)
  } finally {
    for (const filho of filhos) filho.kill()
  }
})

'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { compareReports, formatReport, heapStreamDeltaBytes, main, scenarioKey } = require('./benchmark-regression-gate.cjs')

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-regression-gate-'))
}

function writeJson(dir, name, value) {
  const file = path.join(dir, name)
  fs.writeFileSync(file, JSON.stringify(value))
  return file
}

function scenario(overrides = {}) {
  return {
    phase: 'renderer-xterm',
    count: 10,
    scrollback: 5_000,
    policy: 'adaptive',
    resumeMs: 4_000,
    rendererWorkingSetMiB: { p95: 500 },
    heapBefore: { usedJsHeapBytes: 10_000_000 },
    heapAfterStream: { usedJsHeapBytes: 190_000_000 },
    ...overrides,
  }
}

test('cenários idênticos não geram regressão', () => {
  const report = { results: [scenario()] }
  const result = compareReports({ baseline: report, current: report })

  assert.equal(result.ok, true)
  assert.deepEqual(result.regressions, [])
  assert.equal(result.compared, 1)
})

test('piora acima do limiar em uma métrica só já falha o gate', () => {
  const baseline = { results: [scenario({ resumeMs: 4_000 })] }
  const current = { results: [scenario({ resumeMs: 6_000 })] } // +50%

  const result = compareReports({ baseline, current, thresholdPercent: 20 })

  assert.equal(result.ok, false)
  assert.equal(result.regressions.length, 1)
  assert.equal(result.regressions[0].metric, 'resume (ms)')
  assert.equal(result.regressions[0].deltaPercent, 50)
})

test('piora dentro do limiar não falha — ruído de CI é esperado', () => {
  const baseline = { results: [scenario({ resumeMs: 4_000 })] }
  const current = { results: [scenario({ resumeMs: 4_500 })] } // +12.5%

  const result = compareReports({ baseline, current, thresholdPercent: 20 })

  assert.equal(result.ok, true)
})

test('melhora não é regressão, mesmo que grande', () => {
  const baseline = { results: [scenario({ resumeMs: 4_000 })] }
  const current = { results: [scenario({ resumeMs: 1_000 })] }

  const result = compareReports({ baseline, current })

  assert.equal(result.ok, true)
})

test('cenário sem par no baseline é ignorado, não vira regressão nem falha', () => {
  const baseline = { results: [scenario({ count: 5 })] }
  const current = { results: [scenario({ count: 20 })] } // contagem nova

  const result = compareReports({ baseline, current })

  assert.equal(result.ok, true)
  assert.equal(result.compared, 0)
  assert.equal(result.skipped.length, 1)
})

test('baseline zero ou negativo não gera regressão de "infinitos %"', () => {
  const baseline = { results: [scenario({ resumeMs: 0 })] }
  const current = { results: [scenario({ resumeMs: 500 })] }

  const result = compareReports({ baseline, current })

  assert.equal(result.ok, true)
})

test('compara pelo delta de heap do stream quando os dois relatórios têm heap', () => {
  // Ordem de grandeza de 10 sessões: ~95 MiB na main, +57 MiB no PR.
  const baseline = {
    results: [scenario({ heapBefore: { usedJsHeapBytes: 0 }, heapAfterStream: { usedJsHeapBytes: 100_000_000 } })],
  }
  const current = {
    results: [scenario({ heapBefore: { usedJsHeapBytes: 0 }, heapAfterStream: { usedJsHeapBytes: 160_000_000 } })],
  }

  const result = compareReports({ baseline, current, thresholdPercent: 20 })

  assert.equal(result.ok, false)
  assert.ok(result.regressions.some((r) => r.metric.includes('heap')))
})

test('% grande sobre base pequena não é regressão quando a diferença absoluta fica abaixo do piso — caso real do PR #89', () => {
  // count=1 no macOS: 19,8 → 34,2 MiB de heap, +72,8%, mas só ~13,7 MiB de
  // diferença real — ruído do runner, não regressão de código.
  const baseline = {
    results: [scenario({ heapBefore: { usedJsHeapBytes: 0 }, heapAfterStream: { usedJsHeapBytes: 19_806_595 } })],
  }
  const current = {
    results: [scenario({ heapBefore: { usedJsHeapBytes: 0 }, heapAfterStream: { usedJsHeapBytes: 34_221_347 } })],
  }

  const result = compareReports({ baseline, current, thresholdPercent: 60 })

  assert.equal(result.ok, true)
})

test('o salto de heap do count=1 entre runners não é regressão — casos reais dos PRs #107, #110 e #111', () => {
  // Mesmo código, runs diferentes: 14,2 → 34,7 MiB (+143%) no Windows e
  // 15,3 → 33,4 MiB (+118%) no macOS reprovaram PRs que nem carregam o xterm.
  // Em 8 runs verdes seguidos da main, esse cenário foi de 12,0 a 35,8 MiB.
  const casos = [
    [14_240_574, 34_651_836],
    [15_333_060, 33_375_892],
    [14_039_568, 33_437_292],
    [18_603_139, 35_409_407],
  ]
  for (const [before, after] of casos) {
    const baseline = {
      results: [scenario({ heapBefore: { usedJsHeapBytes: 0 }, heapAfterStream: { usedJsHeapBytes: before } })],
    }
    const current = {
      results: [scenario({ heapBefore: { usedJsHeapBytes: 0 }, heapAfterStream: { usedJsHeapBytes: after } })],
    }

    assert.equal(compareReports({ baseline, current, thresholdPercent: 60 }).ok, true, `${before} → ${after}`)
  }
})

test('os 9 saltos de heap do count=1 dos PRs #95 a #103 não reprovam, e uma retenção real de buffer reprova', () => {
  // Deltas do stream (bytes) medidos nos falsos positivos da task "renderer-xterm
  // count=1 acusa sem mudança real": o maior foi 23,7 MiB, abaixo do piso de 32 MiB.
  const observados = [
    [22_200_087, 37_950_736], // #95 macOS
    [14_032_168, 35_386_938], // #96 Ubuntu
    [14_258_630, 33_962_770], // #96 ARM
    [22_225_119, 40_312_219], // #97 macOS
    [14_215_338, 32_543_788], // #98 Windows
    [17_492_328, 39_167_654], // #98 Ubuntu
    [19_117_835, 40_420_864], // #99 macOS
    [17_413_315, 40_316_371], // #102 macOS
    [14_022_864, 38_841_792], // #103 Ubuntu
  ]
  const umCenario = (heapAfterStream) =>
    ({ results: [scenario({ count: 1, scrollback: 20_000, heapBefore: { usedJsHeapBytes: 0 }, heapAfterStream: { usedJsHeapBytes: heapAfterStream } })] })

  for (const [baseline, current] of observados) {
    const result = compareReports({ baseline: umCenario(baseline), current: umCenario(current) })
    assert.equal(result.compared, 1)
    assert.equal(result.ok, true, `delta de ${(current - baseline) / 1048576} MiB não pode reprovar`)
  }

  // Controle: o gate não ficou cego. +40 MiB sobre o mesmo baseline é retenção de verdade.
  const real = compareReports({ baseline: umCenario(14_000_000), current: umCenario(14_000_000 + 40 * 1048576) })
  assert.equal(real.ok, false)
  assert.equal(real.regressions[0].metric, 'delta de heap do stream (bytes)')
})

test('% grande sobre base pequena AINDA é regressão quando a diferença absoluta também é grande', () => {
  const baseline = {
    results: [scenario({ heapBefore: { usedJsHeapBytes: 0 }, heapAfterStream: { usedJsHeapBytes: 20_000_000 } })],
  }
  const current = {
    // +200%, e ~38 MiB reais de diferença — acima do piso de 32 MiB.
    results: [scenario({ heapBefore: { usedJsHeapBytes: 0 }, heapAfterStream: { usedJsHeapBytes: 60_000_000 } })],
  }

  const result = compareReports({ baseline, current, thresholdPercent: 60 })

  assert.equal(result.ok, false)
})

test('métrica ausente dos dois lados não trava a comparação nem conta como regressão', () => {
  const baseline = { results: [scenario({ rendererWorkingSetMiB: undefined })] }
  const current = { results: [scenario({ rendererWorkingSetMiB: undefined })] }

  const result = compareReports({ baseline, current })

  assert.equal(result.ok, true)
})

test('excludeMetrics tira uma métrica do critério de pass/fail sem parar de reportá-la se estourar', () => {
  const baseline = { results: [scenario({ resumeMs: 4_000 })] }
  const current = { results: [scenario({ resumeMs: 6_000 })] } // +50%, estouraria sozinho

  const result = compareReports({
    baseline,
    current,
    thresholdPercent: 20,
    excludeMetrics: ['resumeMs'],
  })

  assert.equal(result.ok, true)
  assert.equal(result.regressions.length, 0)
})

test('threshold fora do intervalo aceito é rejeitado', () => {
  const report = { results: [scenario()] }
  assert.throws(() => compareReports({ baseline: report, current: report, thresholdPercent: 0 }), /thresholdPercent/)
  assert.throws(() => compareReports({ baseline: report, current: report, thresholdPercent: 201 }), /thresholdPercent/)
})

test('scenarioKey casa por phase+count+scrollback+policy, não por outros campos', () => {
  const a = scenario({ resumeMs: 1 })
  const b = scenario({ resumeMs: 999 })
  assert.equal(scenarioKey(a), scenarioKey(b))
})

test('heapStreamDeltaBytes só calcula quando os dois lados existem e são finitos', () => {
  assert.equal(heapStreamDeltaBytes(scenario()), 180_000_000)
  assert.equal(heapStreamDeltaBytes(scenario({ heapBefore: undefined })), undefined)
})

test('formatReport nomeia o cenário e a métrica na regressão, para leitura humana no CI', () => {
  const baseline = { results: [scenario({ resumeMs: 4_000 })], commit: 'abc123' }
  const current = { results: [scenario({ resumeMs: 6_000 })], commit: 'def456' }
  const result = compareReports({ baseline, current, thresholdPercent: 20 })

  const text = formatReport(result, { baselineCommit: baseline.commit, currentCommit: current.commit })

  assert.match(text, /resume \(ms\)/)
  assert.match(text, /abc123/)
  assert.match(text, /def456/)
  assert.match(text, /\+50%/)
})

test('excludeMetrics com chave desconhecida é rejeitado — um erro de digitação não pode manter a métrica em silêncio', () => {
  const report = { results: [scenario()] }
  assert.throws(
    () => compareReports({ baseline: report, current: report, excludeMetrics: ['resumems'] }),
    /desconhecida.*resumems/,
  )
})

test('o relatório diz o critério usado e o que ficou fora dele, mesmo sem regressão', () => {
  const report = { results: [scenario()] }
  const result = compareReports({ baseline: report, current: report, thresholdPercent: 60, excludeMetrics: ['resumeMs'] })

  const text = formatReport(result)

  assert.match(text, /Critério: RSS renderer p95 \(MiB\), delta de heap do stream \(bytes\)/)
  assert.match(text, /60%/)
  assert.match(text, /fora do critério.*resume \(ms\)/)
})

test('main cita commit e run do baseline e o commit atual vindos do CI por argumento', () => {
  const dir = tempDir()
  const baseline = writeJson(dir, 'baseline.json', { results: [scenario()] })
  const current = writeJson(dir, 'current.json', { results: [scenario()] })
  const out = path.join(dir, 'gate.txt')

  const code = main([
    `--baseline=${baseline}`,
    `--current=${current}`,
    '--baseline-commit=aaa111',
    '--baseline-run-url=https://github.com/o/r/actions/runs/1',
    '--current-commit=bbb222',
    `--out=${out}`,
  ])

  assert.equal(code, 0)
  const text = fs.readFileSync(out, 'utf8')
  assert.match(text, /Baseline: aaa111 — https:\/\/github\.com\/o\/r\/actions\/runs\/1/)
  assert.match(text, /Atual: bbb222/)
})

test('sem baseline e com --baseline-missing-ok, main não falha e ainda escreve o --out dizendo isso', () => {
  const dir = tempDir()
  const current = writeJson(dir, 'current.json', { results: [scenario()] })
  const out = path.join(dir, 'gate.txt')

  const code = main([
    `--baseline=${path.join(dir, 'nao-existe.json')}`,
    `--current=${current}`,
    '--baseline-missing-ok',
    `--out=${out}`,
  ])

  assert.equal(code, 0)
  assert.match(fs.readFileSync(out, 'utf8'), /sem baseline disponível/)
})

test('sem baseline e sem --baseline-missing-ok, main falha de forma explícita', () => {
  const dir = tempDir()
  const current = writeJson(dir, 'current.json', { results: [scenario()] })

  assert.throws(() => main([`--baseline=${path.join(dir, 'nao-existe.json')}`, `--current=${current}`]), /Baseline não encontrado/)
})

function manyAgentsPhase(overrides = {}) {
  return {
    phase: 'canvas-many-agents:gaveta-aberta',
    count: 20,
    frameReliable: true,
    frameMs: { count: 900, p50: 17, p95: 100, max: 300 },
    longTaskMs: { count: 40, p50: 60, p95: 100, max: 200 },
    keyEchoMs: { count: 50, p50: 20, p95: 30, max: 60 },
    ...overrides,
  }
}

test('frame p95, long task p95 e tecla → eco p95 que pioram acima do limiar e do piso reprovam o gate', () => {
  const baseline = { results: [manyAgentsPhase()] }
  const current = {
    results: [manyAgentsPhase({
      frameMs: { count: 900, p95: 130 },
      longTaskMs: { count: 60, p95: 160 },
      keyEchoMs: { count: 50, p95: 50 },
    })],
  }

  const result = compareReports({ baseline, current })

  assert.equal(result.ok, false)
  assert.deepEqual(result.regressions.map((regression) => regression.metric), [
    'frame p95 (ms)',
    'long task p95 (ms)',
    'tecla → eco p95 (ms)',
  ])
})

test('frame, long task e eco que pioram abaixo do piso absoluto não reprovam — ruído da mesma máquina', () => {
  const baseline = { results: [manyAgentsPhase({ frameMs: { p95: 20 }, longTaskMs: { count: 3, p95: 60 }, keyEchoMs: { p95: 20 } })] }
  const current = { results: [manyAgentsPhase({ frameMs: { p95: 26 }, longTaskMs: { count: 5, p95: 100 }, keyEchoMs: { p95: 30 } })] }

  assert.equal(compareReports({ baseline, current }).ok, true)
})

test('frame de janela estrangulada não entra na comparação, de nenhum dos lados', () => {
  const baseline = { results: [manyAgentsPhase({ frameReliable: false, frameMs: { p95: 20 } })] }
  const current = { results: [manyAgentsPhase({ frameMs: { p95: 400 } })] }

  assert.equal(compareReports({ baseline, current }).ok, true)
  assert.equal(compareReports({ baseline: current, current: baseline }).ok, true)
})

test('long task que aparece onde não havia nenhuma reprova, mesmo com baseline zero', () => {
  const baseline = { results: [manyAgentsPhase({ longTaskMs: { count: 0, p50: null, p95: null, max: null } })] }
  const current = { results: [manyAgentsPhase({ longTaskMs: { count: 12, p95: 300 } })] }

  const result = compareReports({ baseline, current })

  assert.equal(result.ok, false)
  assert.equal(result.regressions[0].metric, 'long task p95 (ms)')
  assert.match(formatReport(result), /long task p95 \(ms\): 0 → 300 \(antes não havia\)/)
})

test('o canvas com muitos agentes casa também pelo número de blocos', () => {
  const baseline = { results: [manyAgentsPhase({ nodes: 320 })] }
  const current = { results: [manyAgentsPhase({ nodes: 1_020, frameMs: { p95: 400 } })] }

  const result = compareReports({ baseline, current })

  assert.equal(result.ok, true)
  assert.equal(result.compared, 0)
  assert.match(result.skipped[0], /nodes=1020/)
})

function phaseRun(frameP95, longTaskP95) {
  return { results: [manyAgentsPhase({ frameMs: { count: 900, p95: frameP95 }, longTaskMs: { count: 20, p95: longTaskP95 } })] }
}

test('com várias rodadas de cada lado o gate compara a mediana: um quadro a mais numa rodada não reprova', () => {
  // Medido em 11/11/2026 (Windows, mesmo código): o frame p95 anda em degraus de um quadro (33,3 → 49,9 ms).
  const baseline = [phaseRun(49.9, 77.6), phaseRun(33.3, 61), phaseRun(33.3, 60.1)]
  const current = [phaseRun(33.3, 63.1), phaseRun(49.9, 60), phaseRun(33.3, 58.9)]

  assert.equal(compareReports({ baseline: baseline[1], current: current[1] }).ok, false)
  const result = compareReports({ baseline, current })
  assert.equal(result.ok, true)
  assert.equal(result.compared, 1)
})

test('uma regressão que aparece em todas as rodadas reprova pela mediana', () => {
  const baseline = [phaseRun(33.3, 60), phaseRun(33.3, 61), phaseRun(49.9, 62)]
  const current = [phaseRun(66.6, 60), phaseRun(66.6, 140), phaseRun(50, 150)]

  const result = compareReports({ baseline, current })

  assert.equal(result.ok, false)
  assert.deepEqual(
    result.regressions.map((regression) => [regression.metric, regression.baselineValue, regression.currentValue]),
    [['frame p95 (ms)', 33.3, 66.6], ['long task p95 (ms)', 61, 140]],
  )
  assert.match(formatReport(result), /mediana de 3 rodada\(s\) de cada lado/)
})

test('main aceita várias rodadas separadas por vírgula em --baseline e --current', () => {
  const dir = tempDir()
  const baseline = ['b1', 'b2', 'b3'].map((name, index) => writeJson(dir, `${name}.json`, phaseRun([49.9, 33.3, 33.3][index], 60)))
  const current = ['c1', 'c2', 'c3'].map((name, index) => writeJson(dir, `${name}.json`, phaseRun([33.3, 49.9, 33.3][index], 60)))

  const code = main([`--baseline=${baseline.join(',')}`, `--current=${current.join(',')}`])

  assert.equal(code, 0)
})

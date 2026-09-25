'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { compareReports, formatReport, heapStreamDeltaBytes, scenarioKey } = require('./benchmark-regression-gate.cjs')

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
  const baseline = {
    results: [scenario({ heapBefore: { usedJsHeapBytes: 0 }, heapAfterStream: { usedJsHeapBytes: 20_000_000 } })],
  }
  const current = {
    results: [scenario({ heapBefore: { usedJsHeapBytes: 0 }, heapAfterStream: { usedJsHeapBytes: 40_000_000 } })],
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

test('% grande sobre base pequena AINDA é regressão quando a diferença absoluta também é grande', () => {
  const baseline = {
    results: [scenario({ heapBefore: { usedJsHeapBytes: 0 }, heapAfterStream: { usedJsHeapBytes: 20_000_000 } })],
  }
  const current = {
    // +100%, e 20 MiB reais de diferença — acima do piso de 15 MiB.
    results: [scenario({ heapBefore: { usedJsHeapBytes: 0 }, heapAfterStream: { usedJsHeapBytes: 40_000_000 } })],
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

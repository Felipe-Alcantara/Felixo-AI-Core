#!/usr/bin/env node
'use strict'

/**
 * Gate de regressão de performance: compara o relatório do benchmark de
 * scrollback do terminal (schemaVersion 1, ver `terminal-scrollback-benchmark.cjs`)
 * ou o do canvas com muitos agentes (`canvas-many-agents-benchmark.cjs`, que
 * acrescenta frame, long task e tecla → eco por fase) contra um baseline de um
 * commit anterior — não contra um limiar fixo codificado, que é o que `--check`
 * daqueles scripts já faz.
 *
 * Nenhum workflow roda este gate desde o PR #124 (19/10/2026); o uso é manual,
 * com dois relatórios do mesmo sistema (ver `app/benchmarks/README.md`, seção
 * "Gate de regressão entre commits"). Artefatos expiram, então a ausência de
 * baseline não deve reprovar (ver `--baseline-missing-ok`).
 *
 * Cenários são casados por `phase+count+scrollback+policy+nodes`; um cenário que só
 * existe de um lado (contagem nova, política nova) é ignorado, não comparado.
 */

const fs = require('node:fs')
const path = require('node:path')

const DEFAULT_THRESHOLD_PERCENT = 20
const MAX_THRESHOLD_PERCENT = 200

/** Lê `obj.a.b` sem lançar se algum nível faltar. */
function readPath(object, dottedPath) {
  return dottedPath.split('.').reduce((value, key) => (value == null ? undefined : value[key]), object)
}

function heapStreamDeltaBytes(result) {
  const before = result?.heapBefore?.usedJsHeapBytes
  const afterStream = result?.heapAfterStream?.usedJsHeapBytes
  if (!Number.isFinite(before) || !Number.isFinite(afterStream)) return undefined
  return afterStream - before
}

// Cada métrica: "menor é melhor" para tudo aqui (memória, latência) — uma
// regressão é sempre um AUMENTO. Se um dia entrar uma métrica onde maior é
// melhor (throughput), precisa de um campo `lowerIsBetter` por entrada.
//
// `minAbsoluteDelta` existe porque o limiar percentual sozinho falha em
// cenários de baixa carga: medido no PR #89, count=1 no macOS mostrou heap
// "regredindo" 72,8% (19,8 → 34,2 MiB) só porque a base é pequena — a
// diferença real, ~14 MiB, é ruído de runner, não regressão. Uma métrica só
// vira regressão quando os DOIS critérios batem: variou mais que o limiar
// percentual E a diferença absoluta é grande o bastante pra importar.
//
// O piso do heap é 32 MiB porque o salto do count=1 é maior do que o PR #89
// mostrou: em 8 runs verdes seguidos da main (07–09/10/2026), o cenário
// `adaptive count=1` foi de 12,0 a 35,8 MiB com o mesmo código — até 23,8 MiB
// de diferença, por rodar depois do `current` no renderer compartilhado. Com
// o piso em 15 MiB isso reprovou os PRs #107 e #110, que nem carregam o
// xterm. Nos cenários que importam (10 e 20 sessões, 85–290 MiB) o limiar
// percentual continua mandando: 60% deles passa de 32 MiB com folga.
const METRICS = [
  { key: 'resumeMs', label: 'resume (ms)', read: (result) => result.resumeMs, minAbsoluteDelta: 300 },
  {
    key: 'rendererWorkingSetMiB.p95',
    label: 'RSS renderer p95 (MiB)',
    read: (result) => readPath(result, 'rendererWorkingSetMiB.p95'),
    minAbsoluteDelta: 20,
  },
  {
    key: 'heapStreamDeltaBytes',
    label: 'delta de heap do stream (bytes)',
    read: heapStreamDeltaBytes,
    minAbsoluteDelta: 32 * 1024 * 1024,
  },
  // Frame, long task e eco (decisão de 11/11/2026: +20% e piso absoluto, gate manual). Os pisos: meio
  // quadro a 60 Hz, o próprio limiar de long task e um quadro inteiro. Vêm do `canvas-many-agents`.
  {
    key: 'frameMs.p95',
    label: 'frame p95 (ms)',
    // Janela estrangulada pelo Chromium: o frame mede o estrangulamento, não o app.
    read: (result) => (result.frameReliable === false ? undefined : readPath(result, 'frameMs.p95')),
    minAbsoluteDelta: 8,
  },
  {
    key: 'longTaskMs.p95',
    label: 'long task p95 (ms)',
    // Sem nenhuma long task o p95 é nulo: conta como 0, para a primeira que aparecer reprovar.
    read: (result) => (result.longTaskMs?.count === 0 ? 0 : readPath(result, 'longTaskMs.p95')),
    minAbsoluteDelta: 50,
    zeroBaselineIsMeaningful: true,
  },
  {
    key: 'keyEchoMs.p95',
    label: 'tecla → eco p95 (ms)',
    read: (result) => readPath(result, 'keyEchoMs.p95'),
    minAbsoluteDelta: 16,
  },
]

function scenarioKey(result) {
  // `nodes` só existe no `canvas-many-agents`: 20 agentes com 300 e com 1.000 blocos são cenários diferentes.
  return [result.phase, result.count, result.scrollback ?? '', result.policy ?? '', result.nodes ?? ''].join('|')
}

function scenarioLabel(result) {
  const parts = [`phase=${result.phase}`, `count=${result.count}`]
  if (result.nodes !== undefined) parts.push(`nodes=${result.nodes}`)
  if (result.scrollback !== undefined) parts.push(`scrollback=${result.scrollback}`)
  if (result.policy) parts.push(`policy=${result.policy}`)
  return parts.join(' ')
}

/** Resultados de um ou mais relatórios, agrupados pelo cenário (na ordem em que aparecem). */
function resultsByScenario(reports) {
  const byKey = new Map()
  for (const report of Array.isArray(reports) ? reports : [reports]) {
    for (const result of report?.results ?? []) {
      const key = scenarioKey(result)
      byKey.set(key, [...(byKey.get(key) ?? []), result])
    }
  }
  return byKey
}

/** Mediana dos valores finitos da métrica nas rodadas de um cenário. */
function medianMetric(results, metric) {
  const values = results.map((result) => metric.read(result)).filter(Number.isFinite).sort((a, b) => a - b)
  if (values.length === 0) return undefined
  const middle = Math.floor(values.length / 2)
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2
}

/**
 * @param {object} options
 * @param {object | object[]} options.baseline - Relatório JSON do commit de referência, ou várias
 *   rodadas dele: com mais de uma, cada métrica é a mediana (o frame p95 de uma rodada só oscila
 *   um quadro inteiro com o mesmo código).
 * @param {object | object[]} options.current - Relatório JSON da execução atual, ou várias rodadas.
 * @param {number} [options.thresholdPercent] - Regressão tolerada antes de falhar.
 * @param {string[]} [options.excludeMetrics] - Chaves de METRICS a não usar como
 *   critério de pass/fail. A métrica continua sendo reportada normalmente se
 *   aparecer nos relatórios — só não decide o resultado do gate.
 * @returns {{ok: boolean, regressions: object[], compared: number, skipped: string[]}}
 */
function compareReports({
  baseline,
  current,
  thresholdPercent = DEFAULT_THRESHOLD_PERCENT,
  excludeMetrics = [],
}) {
  if (!Number.isFinite(thresholdPercent) || thresholdPercent <= 0 || thresholdPercent > MAX_THRESHOLD_PERCENT) {
    throw new Error(`thresholdPercent deve ser um número entre 0 (exclusivo) e ${MAX_THRESHOLD_PERCENT}.`)
  }

  const knownKeys = new Set(METRICS.map((metric) => metric.key))
  const unknown = excludeMetrics.filter((key) => !knownKeys.has(key))
  // Um erro de digitação aqui (ex.: "resumems") manteria a métrica no critério
  // em silêncio — exatamente o tipo de falso positivo que a exclusão evita.
  if (unknown.length) {
    throw new Error(`excludeMetrics desconhecida(s): ${unknown.join(', ')}. Válidas: ${[...knownKeys].join(', ')}.`)
  }
  const excluded = new Set(excludeMetrics)
  const activeMetrics = METRICS.filter((metric) => !excluded.has(metric.key))
  const baselineByKey = resultsByScenario(baseline)
  const currentByKey = resultsByScenario(current)
  const regressions = []
  const skipped = []
  let compared = 0

  for (const [key, currentResults] of currentByKey) {
    const currentResult = currentResults[0]
    const baselineResults = baselineByKey.get(key)
    if (!baselineResults) {
      skipped.push(`${scenarioLabel(currentResult)}: sem baseline correspondente`)
      continue
    }

    let scenarioCompared = false
    for (const metric of activeMetrics) {
      const baselineValue = medianMetric(baselineResults, metric)
      const currentValue = medianMetric(currentResults, metric)
      if (!Number.isFinite(baselineValue) || !Number.isFinite(currentValue)) continue
      // Baseline ~0 tornaria qualquer valor positivo uma regressão de "infinitos
      // %" — sem sinal real para decidir nada, então o par é pulado. Exceção:
      // métrica em que 0 é um estado real (nenhuma long task), decidida só pelo piso.
      if (baselineValue <= 0 && !metric.zeroBaselineIsMeaningful) continue

      scenarioCompared = true
      const absoluteDelta = currentValue - baselineValue
      const deltaPercent = baselineValue > 0 ? (absoluteDelta / baselineValue) * 100 : null
      const crossesPercentThreshold = deltaPercent === null || deltaPercent > thresholdPercent
      const crossesAbsoluteFloor = !Number.isFinite(metric.minAbsoluteDelta) || absoluteDelta >= metric.minAbsoluteDelta
      if (crossesPercentThreshold && crossesAbsoluteFloor) {
        regressions.push({
          scenario: scenarioLabel(currentResult),
          metric: metric.label,
          baselineValue,
          currentValue,
          deltaPercent: deltaPercent === null ? null : Number(deltaPercent.toFixed(1)),
          thresholdPercent,
        })
      }
    }
    if (scenarioCompared) compared += 1
  }

  return {
    ok: regressions.length === 0,
    regressions,
    compared,
    runs: {
      baseline: Array.isArray(baseline) ? baseline.length : 1,
      current: Array.isArray(current) ? current.length : 1,
    },
    skipped,
    thresholdPercent,
    checkedMetrics: activeMetrics.map((metric) => metric.label),
    excludedMetrics: METRICS.filter((metric) => excluded.has(metric.key)).map((metric) => metric.label),
  }
}

function formatReport(result, { baselineCommit, currentCommit, baselineRunUrl } = {}) {
  const lines = []
  lines.push(`Gate de regressão de performance — ${result.compared} cenário(s) comparado(s).`)
  if (baselineCommit || baselineRunUrl) {
    lines.push(`Baseline: ${[baselineCommit, baselineRunUrl].filter(Boolean).join(' — ')}`)
  }
  if (currentCommit) lines.push(`Atual: ${currentCommit}`)
  if (result.runs && (result.runs.baseline > 1 || result.runs.current > 1)) {
    const runs = result.runs.baseline === result.runs.current
      ? `${result.runs.baseline} rodada(s) de cada lado`
      : `${result.runs.baseline} rodada(s) no baseline e ${result.runs.current} na atual`
    lines.push(`Valores: mediana de ${runs}.`)
  }
  if (result.checkedMetrics?.length) {
    lines.push(
      `Critério: ${result.checkedMetrics.join(', ')} — falha se piorar mais de ` +
        `${result.thresholdPercent}% E passar do piso absoluto da métrica.`,
    )
  }
  if (result.excludedMetrics?.length) {
    lines.push(`Medidas mas fora do critério (ruído entre runners): ${result.excludedMetrics.join(', ')}.`)
  }

  if (result.ok) {
    lines.push('Nenhuma regressão acima do limiar.')
  } else {
    lines.push(`${result.regressions.length} regressão(ões) encontrada(s):`)
    for (const regression of result.regressions) {
      const change =
        regression.deltaPercent === null
          ? '(antes não havia)'
          : `(+${regression.deltaPercent}%, limiar ${regression.thresholdPercent}%)`
      lines.push(
        `  - ${regression.scenario} · ${regression.metric}: ` +
          `${regression.baselineValue} → ${regression.currentValue} ${change}`,
      )
    }
  }

  if (result.skipped.length) {
    lines.push(`${result.skipped.length} cenário(s) sem par no baseline (ignorado(s), não é regressão):`)
    for (const entry of result.skipped) lines.push(`  - ${entry}`)
  }

  return lines.join('\n')
}

function parseArgs(argv) {
  const options = { thresholdPercent: DEFAULT_THRESHOLD_PERCENT, baselineMissingOk: false, excludeMetrics: [] }
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      options.help = true
    } else if (arg === '--baseline-missing-ok') {
      options.baselineMissingOk = true
    } else if (arg.startsWith('--baseline=')) {
      options.baselinePath = arg.slice('--baseline='.length)
    } else if (arg.startsWith('--current=')) {
      options.currentPath = arg.slice('--current='.length)
    } else if (arg.startsWith('--threshold=')) {
      options.thresholdPercent = Number(arg.slice('--threshold='.length))
    } else if (arg.startsWith('--exclude-metric=')) {
      options.excludeMetrics.push(arg.slice('--exclude-metric='.length))
    } else if (arg.startsWith('--baseline-commit=')) {
      options.baselineCommit = arg.slice('--baseline-commit='.length)
    } else if (arg.startsWith('--baseline-run-url=')) {
      options.baselineRunUrl = arg.slice('--baseline-run-url='.length)
    } else if (arg.startsWith('--current-commit=')) {
      options.currentCommit = arg.slice('--current-commit='.length)
    } else if (arg.startsWith('--out=')) {
      options.outputPath = arg.slice('--out='.length)
    } else {
      throw new Error(`Argumento desconhecido: ${arg}`)
    }
  }
  return options
}

function printHelp() {
  console.log(`Gate de regressão de performance

Compara o relatório do benchmark de scrollback do terminal ou do canvas com
muitos agentes contra um
baseline de outro commit (não os limiares fixos internos de --check).

Opções:
  --baseline=a.json[,b.json] relatório(s) do commit de referência; com vários, mediana
  --current=a.json[,b.json]  relatório(s) da execução atual; com vários, mediana
  --threshold=20            regressão tolerada em % antes de falhar (default 20)
  --exclude-metric=chave    ignora uma métrica no pass/fail (repetível); chaves
                            válidas: ${METRICS.map((metric) => metric.key).join(', ')}
  --baseline-missing-ok     não falha se --baseline não existir (ex.: artefato expirado)
  --baseline-commit=sha     commit do baseline, citado no relatório
  --baseline-run-url=url    run do CI que gerou o baseline, citado no relatório
  --current-commit=sha      commit avaliado, citado no relatório
  --out=arquivo.txt         também escreve o relatório legível nesse caminho
  --help                    mostra esta ajuda
`)
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  if (options.help) {
    printHelp()
    return 0
  }
  if (!options.currentPath) {
    throw new Error('--current é obrigatório.')
  }

  // Várias rodadas: caminhos separados por vírgula, e cada métrica vira a mediana delas.
  const baselinePaths = (options.baselinePath ?? '').split(',').filter(Boolean)
  const missingBaseline = baselinePaths.filter((file) => !fs.existsSync(file))
  if (baselinePaths.length === 0 || missingBaseline.length > 0) {
    if (options.baselineMissingOk) {
      // Escreve o --out também aqui: o resumo do job no CI mostra o relatório,
      // e "sem baseline" precisa aparecer lá explicitamente, não como silêncio.
      writeOutput(options.outputPath, 'Gate de regressão de performance — sem baseline disponível (artefato de main ausente ou expirado); nada comparado, não é falha.')
      return 0
    }
    throw new Error(`Baseline não encontrado: ${missingBaseline.join(', ') || '(não informado)'}`)
  }

  const readReports = (files) => files.map((file) => JSON.parse(fs.readFileSync(file, 'utf8')))
  const baselineReports = readReports(baselinePaths)
  const currentReports = readReports(options.currentPath.split(',').filter(Boolean))
  const baseline = baselineReports.length === 1 ? baselineReports[0] : baselineReports
  const current = currentReports.length === 1 ? currentReports[0] : currentReports
  const result = compareReports({
    baseline,
    current,
    thresholdPercent: options.thresholdPercent,
    excludeMetrics: options.excludeMetrics,
  })
  // O relatório do benchmark não carrega o commit; ele vem do CI por argumento.
  writeOutput(
    options.outputPath,
    formatReport(result, {
      baselineCommit: options.baselineCommit || baselineReports[0]?.commit,
      baselineRunUrl: options.baselineRunUrl,
      currentCommit: options.currentCommit || currentReports[0]?.commit,
    }),
  )

  return result.ok ? 0 : 1
}

function writeOutput(outputPath, text) {
  console.log(text)
  if (!outputPath) return
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, `${text}\n`, 'utf8')
}

module.exports = { compareReports, formatReport, heapStreamDeltaBytes, main, METRICS, parseArgs, scenarioKey }

if (require.main === module) {
  try {
    process.exitCode = main()
  } catch (error) {
    console.error(`[benchmark-regression-gate] ${error.message}`)
    process.exitCode = 1
  }
}

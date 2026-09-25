#!/usr/bin/env node
'use strict'

/**
 * Gate de regressão de performance: compara o relatório do benchmark de
 * scrollback do terminal (schemaVersion 1, ver `terminal-scrollback-benchmark.cjs`)
 * contra um baseline de um commit anterior — não contra um limiar fixo
 * codificado, que é o que `--check` daquele script já faz (compara política
 * `current` vs `adaptive` DENTRO da mesma execução).
 *
 * O baseline é sempre o artefato do último run verde em `main` (ver
 * `.github/workflows/ci.yml`, job `benchmarks`) — decisão explícita: sem
 * infraestrutura nova, mas artefatos do GitHub Actions expiram, então um PR
 * sem baseline disponível não deve falhar por isso (ver `--baseline-missing-ok`).
 *
 * Cenários são casados por `phase+count+scrollback+policy`; um cenário que só
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
    minAbsoluteDelta: 15 * 1024 * 1024,
  },
]

function scenarioKey(result) {
  return [result.phase, result.count, result.scrollback ?? '', result.policy ?? ''].join('|')
}

function scenarioLabel(result) {
  const parts = [`phase=${result.phase}`, `count=${result.count}`]
  if (result.scrollback !== undefined) parts.push(`scrollback=${result.scrollback}`)
  if (result.policy) parts.push(`policy=${result.policy}`)
  return parts.join(' ')
}

/**
 * @param {object} options
 * @param {object} options.baseline - Relatório JSON do último run verde em main.
 * @param {object} options.current - Relatório JSON da execução atual (PR/local).
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
  const baselineByKey = new Map((baseline?.results ?? []).map((result) => [scenarioKey(result), result]))
  const regressions = []
  const skipped = []
  let compared = 0

  for (const currentResult of current?.results ?? []) {
    const key = scenarioKey(currentResult)
    const baselineResult = baselineByKey.get(key)
    if (!baselineResult) {
      skipped.push(`${scenarioLabel(currentResult)}: sem baseline correspondente`)
      continue
    }

    let scenarioCompared = false
    for (const metric of activeMetrics) {
      const baselineValue = metric.read(baselineResult)
      const currentValue = metric.read(currentResult)
      if (!Number.isFinite(baselineValue) || !Number.isFinite(currentValue)) continue
      // Baseline ~0 tornaria qualquer valor positivo uma regressão de "infinitos
      // %" — sem sinal real para decidir nada, então o par é pulado.
      if (baselineValue <= 0) continue

      scenarioCompared = true
      const absoluteDelta = currentValue - baselineValue
      const deltaPercent = (absoluteDelta / baselineValue) * 100
      const crossesPercentThreshold = deltaPercent > thresholdPercent
      const crossesAbsoluteFloor = !Number.isFinite(metric.minAbsoluteDelta) || absoluteDelta >= metric.minAbsoluteDelta
      if (crossesPercentThreshold && crossesAbsoluteFloor) {
        regressions.push({
          scenario: scenarioLabel(currentResult),
          metric: metric.label,
          baselineValue,
          currentValue,
          deltaPercent: Number(deltaPercent.toFixed(1)),
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
      lines.push(
        `  - ${regression.scenario} · ${regression.metric}: ` +
          `${regression.baselineValue} → ${regression.currentValue} ` +
          `(+${regression.deltaPercent}%, limiar ${regression.thresholdPercent}%)`,
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

Compara o relatório do benchmark de scrollback do terminal contra um
baseline de outro commit (não os limiares fixos internos de --check).

Opções:
  --baseline=arquivo.json   relatório do commit de referência (main)
  --current=arquivo.json    relatório da execução atual
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

  if (!options.baselinePath || !fs.existsSync(options.baselinePath)) {
    if (options.baselineMissingOk) {
      // Escreve o --out também aqui: o resumo do job no CI mostra o relatório,
      // e "sem baseline" precisa aparecer lá explicitamente, não como silêncio.
      writeOutput(options.outputPath, 'Gate de regressão de performance — sem baseline disponível (artefato de main ausente ou expirado); nada comparado, não é falha.')
      return 0
    }
    throw new Error(`Baseline não encontrado: ${options.baselinePath ?? '(não informado)'}`)
  }

  const baseline = JSON.parse(fs.readFileSync(options.baselinePath, 'utf8'))
  const current = JSON.parse(fs.readFileSync(options.currentPath, 'utf8'))
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
      baselineCommit: options.baselineCommit || baseline?.commit,
      baselineRunUrl: options.baselineRunUrl,
      currentCommit: options.currentCommit || current?.commit,
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

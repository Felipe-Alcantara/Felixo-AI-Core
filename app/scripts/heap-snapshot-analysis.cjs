'use strict'

/**
 * Resume e compara heap snapshots reais (`.heapsnapshot`, formato V8/DevTools)
 * capturados via `felixo devtools heap-snapshot`.
 *
 * Não reimplementa o algoritmo de dominadores do DevTools (retained size
 * exato exige o grafo completo de dominância). Em vez disso soma o que já
 * decide a pergunta desta task — "sobrou algo que não deveria" — sem abrir o
 * Chrome DevTools numa máquina sem display:
 *
 * - self_size agregado por nome de construtor (classe/função), que aponta o
 *   componente responsável por um crescimento sem precisar de retained size;
 * - o campo `detachedness` que o V8 já grava por nó (2 = destacado do DOM) —
 *   é o mesmo sinal que o DevTools usa para o filtro "Detached", só que já
 *   pronto no arquivo, sem heurística de nome "Detached ...".
 *
 * Um par de snapshots (antes → depois de remover nós / Limpar canvas) usa
 * `diffSummaries` para separar o que persistiu do que a carga esperada some
 * sozinha.
 */

const fs = require('node:fs')

function parseHeapSnapshot(raw) {
  const data = JSON.parse(raw)
  const { snapshot, nodes, edges, strings } = data
  const nodeFieldCount = snapshot.meta.node_fields.length
  const nodeFields = snapshot.meta.node_fields
  const typeIndex = nodeFields.indexOf('type')
  const nameIndex = nodeFields.indexOf('name')
  const selfSizeIndex = nodeFields.indexOf('self_size')
  const edgeCountIndex = nodeFields.indexOf('edge_count')
  const detachednessIndex = nodeFields.indexOf('detachedness')
  const typeStrings = snapshot.meta.node_types[typeIndex]

  const parsedNodes = []
  for (let offset = 0; offset < nodes.length; offset += nodeFieldCount) {
    const typeOrdinal = nodes[offset + typeIndex]
    parsedNodes.push({
      type: Array.isArray(typeStrings) ? typeStrings[typeOrdinal] : typeOrdinal,
      name: strings[nodes[offset + nameIndex]] ?? '',
      selfSize: nodes[offset + selfSizeIndex] ?? 0,
      edgeCount: nodes[offset + edgeCountIndex] ?? 0,
      detached: detachednessIndex >= 0 ? nodes[offset + detachednessIndex] === 2 : false,
    })
  }

  return {
    nodeCount: snapshot.node_count,
    edgeCount: snapshot.edge_count,
    totalSelfSize: parsedNodes.reduce((sum, node) => sum + node.selfSize, 0),
    nodes: parsedNodes,
    hasDetachednessField: detachednessIndex >= 0,
  }
}

/**
 * Agrupa por `${type}:${name}` — dois construtores homônimos de tipos
 * diferentes (ex.: uma classe JS "Terminal" vs um nó DOM "Terminal") não
 * devem ser somados juntos.
 */
function summarizeHeapSnapshot(parsed) {
  const byConstructor = new Map()
  let detachedCount = 0
  let detachedSelfSize = 0

  for (const node of parsed.nodes) {
    const key = `${node.type}:${node.name}`
    const entry = byConstructor.get(key) ?? { type: node.type, name: node.name, count: 0, selfSize: 0, detachedCount: 0, detachedSelfSize: 0 }
    entry.count += 1
    entry.selfSize += node.selfSize
    if (node.detached) {
      entry.detachedCount += 1
      entry.detachedSelfSize += node.selfSize
      detachedCount += 1
      detachedSelfSize += node.selfSize
    }
    byConstructor.set(key, entry)
  }

  const constructors = [...byConstructor.values()].sort((a, b) => b.selfSize - a.selfSize)

  return {
    nodeCount: parsed.nodeCount,
    edgeCount: parsed.edgeCount,
    totalSelfSize: parsed.totalSelfSize,
    hasDetachednessField: parsed.hasDetachednessField,
    detached: { count: detachedCount, selfSize: detachedSelfSize },
    topConstructors: constructors.slice(0, 30),
    constructorsByKey: Object.fromEntries(constructors.map((entry) => [`${entry.type}:${entry.name}`, entry])),
  }
}

function loadAndSummarize(filePath, deps = {}) {
  const fileSystem = deps.fs ?? fs
  const raw = fileSystem.readFileSync(filePath, 'utf8')
  return summarizeHeapSnapshot(parseHeapSnapshot(raw))
}

/**
 * Compara dois resumos (tipicamente antes → depois de remover nós ou Limpar
 * canvas). `thresholdBytes` existe porque nunca sobra exatamente zero — GC do
 * V8 é conservador o bastante para deixar um resíduo pequeno e estável; só
 * crescimento acima do limiar conta como candidato a retenção.
 */
function diffSummaries(before, after, { thresholdBytes = 512 * 1024 } = {}) {
  const keys = new Set([...Object.keys(before.constructorsByKey), ...Object.keys(after.constructorsByKey)])
  const growth = []
  for (const key of keys) {
    const beforeEntry = before.constructorsByKey[key] ?? { count: 0, selfSize: 0, detachedCount: 0, detachedSelfSize: 0 }
    const afterEntry = after.constructorsByKey[key] ?? { count: 0, selfSize: 0, detachedCount: 0, detachedSelfSize: 0 }
    const selfSizeDelta = afterEntry.selfSize - beforeEntry.selfSize
    const countDelta = afterEntry.count - beforeEntry.count
    if (Math.abs(selfSizeDelta) >= thresholdBytes || afterEntry.detachedCount > beforeEntry.detachedCount) {
      growth.push({ key, countDelta, selfSizeDelta, detachedCountAfter: afterEntry.detachedCount, detachedSelfSizeAfter: afterEntry.detachedSelfSize })
    }
  }
  growth.sort((a, b) => b.selfSizeDelta - a.selfSizeDelta)
  return {
    totalSelfSizeDelta: after.totalSelfSize - before.totalSelfSize,
    nodeCountDelta: after.nodeCount - before.nodeCount,
    detachedSelfSizeDelta: after.detached.selfSize - before.detached.selfSize,
    detachedCountDelta: after.detached.count - before.detached.count,
    growth,
  }
}

function formatBytes(bytes) {
  const sign = bytes < 0 ? '-' : ''
  const abs = Math.abs(bytes)
  if (abs < 1024) return `${sign}${abs} B`
  if (abs < 1024 * 1024) return `${sign}${(abs / 1024).toFixed(1)} KiB`
  return `${sign}${(abs / (1024 * 1024)).toFixed(1)} MiB`
}

/**
 * Nós do tipo `string`/`concatenated string` guardam o conteúdo inteiro no
 * campo `name` — sem truncar, um bundle inteiro ou um source map em base64
 * vira uma linha de tabela ilegível.
 */
function truncateName(name, maxLength = 80) {
  if (!name) return '(sem nome)'
  const singleLine = name.replace(/\s+/g, ' ')
  return singleLine.length > maxLength ? `${singleLine.slice(0, maxLength)}…` : singleLine
}

function formatSummary(summary, label) {
  const lines = [
    `## ${label}`,
    `- Nós: ${summary.nodeCount} · Arestas: ${summary.edgeCount} · self_size total: ${formatBytes(summary.totalSelfSize)}`,
    `- Nós destacados do DOM (detachedness=2): ${summary.detached.count} (${formatBytes(summary.detached.selfSize)})`,
    '',
    '| construtor | contagem | self_size | destacados |',
    '| --- | ---: | ---: | ---: |',
    ...summary.topConstructors.slice(0, 15).map((entry) => `| ${entry.type}:${truncateName(entry.name)} | ${entry.count} | ${formatBytes(entry.selfSize)} | ${entry.detachedCount} |`),
  ]
  return lines.join('\n')
}

function formatDiff(diff, beforeLabel, afterLabel, thresholdBytes) {
  const lines = [
    `## ${beforeLabel} → ${afterLabel}`,
    `- Δ self_size total: ${formatBytes(diff.totalSelfSizeDelta)} · Δ nós: ${diff.nodeCountDelta}`,
    `- Δ destacados do DOM: ${diff.detachedCountDelta} (${formatBytes(diff.detachedSelfSizeDelta)})`,
    `- Candidatos a retenção (variação ≥ ${formatBytes(thresholdBytes)} ou destacados crescendo):`,
    '',
  ]
  if (diff.growth.length === 0) {
    lines.push('_Nenhum construtor cresceu acima do limiar — sem candidato a retenção nesta comparação._')
  } else {
    lines.push('| construtor | Δ contagem | Δ self_size | destacados depois |', '| --- | ---: | ---: | ---: |')
    for (const entry of diff.growth.slice(0, 20)) {
      lines.push(`| ${truncateName(entry.key)} | ${entry.countDelta} | ${formatBytes(entry.selfSizeDelta)} | ${entry.detachedCountAfter} |`)
    }
  }
  return lines.join('\n')
}

function printHelp() {
  process.stdout.write(
    'uso:\n' +
    '  node scripts/heap-snapshot-analysis.cjs summarize <arquivo.heapsnapshot> [--json]\n' +
    '  node scripts/heap-snapshot-analysis.cjs diff <antes.heapsnapshot> <depois.heapsnapshot> [--threshold-bytes=N] [--json]\n',
  )
}

async function main(argv, deps = {}) {
  const [command, ...rest] = argv
  const asJson = rest.includes('--json')
  const positional = rest.filter((arg) => !arg.startsWith('--'))
  const thresholdArg = rest.find((arg) => arg.startsWith('--threshold-bytes='))
  const thresholdBytes = thresholdArg ? Number(thresholdArg.split('=')[1]) : 512 * 1024

  if (command === 'summarize') {
    if (!positional[0]) { printHelp(); process.exitCode = 2; return }
    const summary = loadAndSummarize(positional[0], deps)
    process.stdout.write(asJson ? `${JSON.stringify(summary, null, 2)}\n` : `${formatSummary(summary, positional[0])}\n`)
    return
  }
  if (command === 'diff') {
    if (!positional[0] || !positional[1]) { printHelp(); process.exitCode = 2; return }
    const before = loadAndSummarize(positional[0], deps)
    const after = loadAndSummarize(positional[1], deps)
    const diff = diffSummaries(before, after, { thresholdBytes })
    process.stdout.write(asJson ? `${JSON.stringify(diff, null, 2)}\n` : `${formatDiff(diff, positional[0], positional[1], thresholdBytes)}\n`)
    return
  }
  printHelp()
  process.exitCode = command ? 2 : 0
}

module.exports = { diffSummaries, formatBytes, formatDiff, formatSummary, loadAndSummarize, parseHeapSnapshot, summarizeHeapSnapshot, truncateName }

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`)
    process.exitCode = 1
  })
}

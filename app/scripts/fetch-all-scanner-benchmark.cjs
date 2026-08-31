#!/usr/bin/env node
'use strict'

/**
 * Bancada reproduzível do scanner do Fetch All.
 *
 * A raiz é obrigatória de propósito: esta ferramenta mede um escopo que foi
 * escolhido explicitamente e nunca transforma a bancada em uma varredura
 * acidental de `/`.
 *
 * Uso: `npm run benchmark:fetch-all -- --root=/caminho --iterations=5 --concurrency=16`
 */

const fs = require('node:fs')
const path = require('node:path')
const { performance } = require('node:perf_hooks')

const { DEFAULT_EXCLUDE_DIRS, findGitRepos } = require('../electron/services/fetch-all/repo-scanner.cjs')

const DEFAULT_ITERATIONS = 5
const DEFAULT_CONCURRENCY = 16
const MAX_ITERATIONS = 20
const MAX_CONCURRENCY = 64

/**
 * Percentil linear, igual ao usado nas outras bancadas do projeto.
 *
 * @param {number[]} values
 * @param {number} percentage
 * @returns {number|null}
 */
function percentile(values, percentage) {
  const clean = values.filter(Number.isFinite).sort((left, right) => left - right)
  if (!clean.length) return null

  const index = (clean.length - 1) * percentage
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  const result =
    lower === upper
      ? clean[lower]
      : clean[lower] + (clean[upper] - clean[lower]) * (index - lower)

  return Number(result.toFixed(3))
}

/**
 * @param {string|undefined} value
 * @param {number} fallback
 * @param {number} maximum
 * @param {string} label
 * @returns {number}
 */
function parsePositiveInteger(value, fallback, maximum, label) {
  if (value === undefined || value === '') return fallback

  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`${label} deve ser um inteiro entre 1 e ${maximum}.`)
  }

  return parsed
}

/**
 * @param {string[]} argv
 * @returns {{ root: string|null, iterations: number, concurrency: number, json: boolean }}
 */
function parseArgs(argv = []) {
  const options = {
    root: null,
    iterations: DEFAULT_ITERATIONS,
    concurrency: DEFAULT_CONCURRENCY,
    json: false,
  }

  for (const argument of argv) {
    if (argument === '--json') {
      options.json = true
      continue
    }
    if (!argument.startsWith('--')) {
      throw new Error(`Argumento desconhecido: ${argument}`)
    }

    const separator = argument.indexOf('=')
    const name = separator >= 0 ? argument.slice(2, separator) : argument.slice(2)
    const value = separator >= 0 ? argument.slice(separator + 1) : undefined

    if (name === 'root') {
      if (!value?.trim()) throw new Error('--root precisa receber uma pasta.')
      options.root = path.resolve(value)
    } else if (name === 'iterations') {
      options.iterations = parsePositiveInteger(
        value,
        DEFAULT_ITERATIONS,
        MAX_ITERATIONS,
        'iterations',
      )
    } else if (name === 'concurrency') {
      options.concurrency = parsePositiveInteger(
        value,
        DEFAULT_CONCURRENCY,
        MAX_CONCURRENCY,
        'concurrency',
      )
    } else {
      throw new Error(`Opção desconhecida: --${name}`)
    }
  }

  return options
}

/**
 * Executa a mesma raiz várias vezes e coleta diretórios, repositórios e tempo.
 *
 * @param {{ root: string, iterations?: number, concurrency?: number }} options
 * @returns {Promise<object>}
 */
async function measureScan({
  root,
  iterations = DEFAULT_ITERATIONS,
  concurrency = DEFAULT_CONCURRENCY,
}) {
  const runs = []

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let scannedDirs = 0
    const startedAt = performance.now()
    const repos = await findGitRepos({
      roots: [root],
      excludeDirs: DEFAULT_EXCLUDE_DIRS,
      skipPaths: [],
      concurrency,
      onProgress: ({ scannedDirs: count }) => {
        scannedDirs = count
      },
    })

    runs.push({
      iteration: iteration + 1,
      scannedDirs,
      foundRepos: repos.length,
      durationMs: Number((performance.now() - startedAt).toFixed(3)),
    })
  }

  const durations = runs.map((run) => run.durationMs)

  return {
    root,
    iterations,
    concurrency,
    scannedDirs: runs.at(-1)?.scannedDirs ?? 0,
    foundRepos: runs.at(-1)?.foundRepos ?? 0,
    p50Ms: percentile(durations, 0.5),
    p95Ms: percentile(durations, 0.95),
    runs,
  }
}

/**
 * @param {object} report
 * @param {boolean} json
 * @returns {string}
 */
function formatReport(report, json = false) {
  if (json) return JSON.stringify(report, null, 2)

  return [
    'Fetch All scanner benchmark',
    `root:        ${report.root}`,
    `directories: ${report.scannedDirs}`,
    `repositories:${report.foundRepos}`,
    `concurrency: ${report.concurrency}`,
    `iterations:  ${report.iterations}`,
    `p50:         ${report.p50Ms} ms`,
    `p95:         ${report.p95Ms} ms`,
  ].join('\n')
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)

  if (!options.root) {
    throw new Error(
      'Informe uma raiz explícita: npm run benchmark:fetch-all -- --root=/caminho',
    )
  }

  if (!fs.statSync(options.root).isDirectory()) {
    throw new Error(`A raiz não é uma pasta: ${options.root}`)
  }

  return formatReport(await measureScan(options), options.json)
}

if (require.main === module) {
  main()
    .then((output) => process.stdout.write(`${output}\n`))
    .catch((error) => {
      process.stderr.write(`${error?.message ?? 'Falha no benchmark.'}\n`)
      process.exitCode = 1
    })
}

module.exports = {
  DEFAULT_CONCURRENCY,
  DEFAULT_ITERATIONS,
  formatReport,
  main,
  measureScan,
  parseArgs,
  percentile,
}

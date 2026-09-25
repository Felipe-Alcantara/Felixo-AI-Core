'use strict'

/**
 * Mede o custo do typecheck por projeto, comparando cache frio e incremental.
 *
 * Uso:
 *   node scripts/typecheck-performance.cjs --iterations=5 --mode=both \
 *     --out=/tmp/felixo-typecheck.json --check
 *
 * O benchmark move os tsbuildinfo anteriores para um diretório temporário
 * próprio quando faz uma amostra fria. Ele não apaga arquivos do projeto.
 *
 * O compilador medido é o mesmo do `npm run typecheck`: o `tsc` do TypeScript
 * 7 instalado como `@typescript/native` (ver scripts/typescript-toolchain.cjs).
 * O pacote `typescript` do app é só a API do TS 6 para o typescript-eslint.
 * RSS é coletado do processo iniciado; quando o lançador do TS 7 roda o
 * executável nativo como processo filho (Windows, ou Node sem
 * `process.execve`), esse PID não é o do compilador e o relatório deixa o
 * valor como null em vez de publicar a memória do lançador. No Linux e no
 * macOS o lançador vira o compilador no mesmo PID (`execve`), e as amostras
 * de antes da troca, ainda do Node, são descartadas. Em plataformas sem uma
 * consulta disponível, o valor também fica null.
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawn } = require('node:child_process')
const { performance } = require('node:perf_hooks')

const toolchain = require('./typescript-toolchain.cjs')

const APP_ROOT = toolchain.APP_ROOT
const TSC_PATH = toolchain.caminhoDoCompilador(APP_ROOT)
const PROJECTS = ['tsconfig.app.json', 'tsconfig.node.json']

function buildTscArgs(extraArgs = []) {
  return ['-b', 'tsconfig.json', '--pretty', 'false', ...extraArgs]
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    check: false,
    iterations: 5,
    mode: 'both',
    out: null,
  }

  for (const argument of argv) {
    if (argument === '--check') {
      options.check = true
      continue
    }

    const [key, value] = argument.split('=', 2)
    if (key === '--iterations') {
      const parsed = Number(value)
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 20) {
        throw new Error('--iterations deve ser um inteiro entre 1 e 20')
      }
      options.iterations = parsed
      continue
    }

    if (key === '--mode') {
      if (!['cold', 'incremental', 'both'].includes(value)) {
        throw new Error('--mode deve ser cold, incremental ou both')
      }
      options.mode = value
      continue
    }

    if (key === '--out') {
      if (!value) {
        throw new Error('--out precisa de um caminho')
      }
      options.out = path.resolve(value)
      continue
    }

    throw new Error(`argumento desconhecido: ${argument}`)
  }

  return options
}

function percentile(values, proportion) {
  if (!values.length) return null
  const ordered = [...values].sort((left, right) => left - right)
  const position = (ordered.length - 1) * proportion
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return ordered[lower]
  return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)
}

function summarize(samples) {
  const successful = samples.filter((sample) => sample.exitCode === 0)
  return {
    samples: samples.length,
    successful: successful.length,
    wallMs: {
      p50: percentile(samples.map((sample) => sample.wallMs), 0.5),
      p95: percentile(samples.map((sample) => sample.wallMs), 0.95),
    },
    peakRssKb: {
      p50: percentile(
        samples.map((sample) => sample.peakRssKb).filter((value) => value != null),
        0.5,
      ),
      p95: percentile(
        samples.map((sample) => sample.peakRssKb).filter((value) => value != null),
        0.95,
      ),
    },
  }
}

function readRssKb(pid) {
  try {
    if (process.platform === 'linux') {
      const status = fs.readFileSync(`/proc/${pid}/status`, 'utf8')
      const match = status.match(/^VmRSS:\s+(\d+)\s+kB$/m)
      return match ? Number(match[1]) : null
    }

    if (process.platform === 'win32') {
      const output = execFileSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', `(Get-Process -Id ${pid}).WorkingSet64`],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
      )
      const bytes = Number(output.trim())
      return Number.isFinite(bytes) ? Math.round(bytes / 1024) : null
    }

    const output = execFileSync('ps', ['-o', 'rss=', '-p', String(pid)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const rss = Number(output.trim())
    return Number.isFinite(rss) ? rss : null
  } catch {
    return null
  }
}

/**
 * Caminho do executável que o PID está rodando agora, ou null se não der para
 * saber (processo já saiu, ou SO sem a consulta).
 */
function readExecutablePath(pid, { platform = process.platform } = {}) {
  try {
    if (platform === 'linux') return fs.realpathSync(`/proc/${pid}/exe`)
    if (platform === 'win32') return null
    const output = execFileSync('ps', ['-o', 'comm=', '-p', String(pid)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return output || null
  } catch {
    return null
  }
}

/**
 * No Linux e no macOS, o lançador do TS 7 (`bin/tsc`, um script Node) chama
 * `process.execve` e vira o compilador nativo no MESMO PID. Até essa troca, o
 * PID amostrado ainda é o Node do lançador. Num build incremental sem mudança,
 * esse Node (~40 MB) pesa mais que o compilador (~20 MB), e o pico publicava a
 * memória do lançador: medido na revisão de 25/09/2026, `tsc -b` pelo lançador
 * deu ~46.600 KB contra ~20.500 KB do binário nativo direto. Amostra tirada
 * enquanto o PID ainda é o Node é descartada.
 */
function isStillNodeLauncher(executablePath, nodePath = process.execPath) {
  if (!executablePath) return false
  let node = nodePath
  try {
    node = fs.realpathSync(nodePath)
  } catch {
    // Mantém o caminho como veio.
  }
  if (executablePath === node) return true
  // `ps -o comm=` no macOS pode trazer só o nome do executável.
  return !executablePath.includes(path.sep) && executablePath === path.basename(node)
}

function moveCacheFiles(temporaryDirectory, iteration) {
  for (const project of PROJECTS) {
    const cacheName = project.replace(/\.json$/, '') + '.tsbuildinfo'
    const source = path.join(APP_ROOT, 'node_modules', '.tmp', cacheName)
    if (!fs.existsSync(source)) continue
    const destination = path.join(temporaryDirectory, `cold-${iteration}-${cacheName}`)
    fs.renameSync(source, destination)
  }
}

function runBuild(extraArgs = [], { sampleRss = toolchain.compiladorRodaNoProcessoIniciado() } = {}) {
  return new Promise((resolve) => {
    const startedAt = performance.now()
    const child = spawn(process.execPath, [TSC_PATH, ...buildTscArgs(extraArgs)], {
      cwd: APP_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    let peakRssKb = null
    child.stdout.on('data', (chunk) => {
      output += chunk
    })
    child.stderr.on('data', (chunk) => {
      output += chunk
    })

    const sample = () => {
      if (!sampleRss) return
      if (isStillNodeLauncher(readExecutablePath(child.pid))) return
      const rss = readRssKb(child.pid)
      if (rss != null && (peakRssKb == null || rss > peakRssKb)) peakRssKb = rss
    }
    sample()
    const timer = setInterval(sample, 100)

    child.on('error', (error) => {
      clearInterval(timer)
      resolve({
        wallMs: performance.now() - startedAt,
        peakRssKb,
        exitCode: 1,
        output: error.message,
      })
    })
    child.on('close', (exitCode, signal) => {
      clearInterval(timer)
      sample()
      resolve({
        wallMs: performance.now() - startedAt,
        peakRssKb,
        exitCode: exitCode ?? 1,
        signal,
        output,
      })
    })
  })
}

async function runSample(mode, iteration, temporaryDirectory) {
  if (mode === 'cold') moveCacheFiles(temporaryDirectory, iteration)

  const result = await runBuild()

  return {
    iteration,
    mode,
    projects: PROJECTS.map((project) => ({ project, exitCode: result.exitCode })),
    wallMs: result.wallMs,
    peakRssKb: result.peakRssKb,
    exitCode: result.exitCode,
    output: result.output,
  }
}

function validateReport(report, expectedIterations) {
  for (const mode of Object.keys(report.modes)) {
    const data = report.modes[mode]
    if (data.samples.length !== expectedIterations) return `amostras incompletas em ${mode}`
    if (data.samples.some((sample) => sample.exitCode !== 0)) return `falha em ${mode}`
    if (data.summary.successful !== expectedIterations) return `resumo incompleto em ${mode}`
  }
  return null
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-typecheck-'))
  const modes = options.mode === 'both' ? ['cold', 'incremental'] : [options.mode]
  const report = {
    generatedAt: new Date().toISOString(),
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    typescript: toolchain.versaoDoCompilador(APP_ROOT),
    projects: PROJECTS,
    modes: {},
  }

  if (!toolchain.compiladorRodaNoProcessoIniciado()) {
    console.log(
      '[typecheck] RSS n/d: neste SO/Node o lançador do TS 7 roda o compilador nativo como processo filho; a memória do lançador não é publicada como a do compilador.',
    )
  }

  try {
    for (const mode of modes) {
      const samples = []
      for (let iteration = 1; iteration <= options.iterations; iteration += 1) {
        const sample = await runSample(mode, iteration, temporaryDirectory)
        samples.push(sample)
        console.log(
          `[typecheck:${mode}] ${iteration}/${options.iterations} ${Math.round(sample.wallMs)}ms ${sample.peakRssKb ?? 'RSS n/d'}KB exit=${sample.exitCode}`,
        )
        if (sample.exitCode !== 0) {
          if (sample.output) process.stderr.write(sample.output)
          break
        }
      }
      report.modes[mode] = { samples, summary: summarize(samples) }
    }
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true })
  }

  if (options.out) {
    fs.mkdirSync(path.dirname(options.out), { recursive: true })
    fs.writeFileSync(options.out, `${JSON.stringify(report, null, 2)}\n`)
  }

  const validationError = options.check ? validateReport(report, options.iterations) : null
  if (validationError) throw new Error(validationError)

  for (const [mode, data] of Object.entries(report.modes)) {
    console.log(
      `[typecheck:${mode}] p50/p95 wall=${Math.round(data.summary.wallMs.p50)}/${Math.round(data.summary.wallMs.p95)}ms rss=${data.summary.peakRssKb.p50 == null ? 'n/d' : `${Math.round(data.summary.peakRssKb.p50)}/${Math.round(data.summary.peakRssKb.p95)}KB`}`,
    )
  }

  return report
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[typecheck] ${error.message}`)
    process.exitCode = 1
  })
}

module.exports = {
  TSC_PATH,
  isStillNodeLauncher,
  parseArgs,
  readExecutablePath,
  percentile,
  summarize,
  validateReport,
  buildTscArgs,
}

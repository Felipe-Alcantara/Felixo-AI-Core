'use strict'

/**
 * @module terminal-responsiveness-during-install
 * Fatia 2/4 de "Performance — correlacionar instalação do gerenciador com
 * responsividade e energia no artefato".
 *
 * Mede o tempo até o primeiro output de um terminal real (PtyProcessManager,
 * o mesmo usado pelo app — sem Electron rodando, node-pty funciona
 * standalone) em dois cenários: parado (baseline) e com N instalações do
 * gerenciador de pacotes rodando ao mesmo tempo (1/2/5/10 agentes,
 * reaproveitando o discoverManagers/createEnvironment/writeFixture já
 * medidos e testados em `package-manager-operational-performance.cjs`).
 *
 * Não mede pan/drag/digitação do Canvas: isso exige o renderer real
 * (Electron + driver de automação) rodando ao mesmo tempo que a instalação,
 * o que setup atual dos benchmarks de renderer não cobre ainda —
 * documentado como limitação explícita, não escondida atrás de um "n/a".
 * O tempo de primeiro output do terminal já é o sinal mais direto de
 * responsividade percebida citado no "O que fazer" da task.
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { performance } = require('node:perf_hooks')

const { PtyProcessManager } = require('../electron/services/pty-process-manager.cjs')
const {
  createEnvironment,
  discoverManagers,
  runWithRetry,
  summarize,
  writeFixture,
} = require('./package-manager-operational-performance.cjs')
const { collectEnvironmentMetadata } = require('./environment-metadata.cjs')

const DEFAULT_ITERATIONS = 5
const DEFAULT_AGENT_COUNTS = [1, 2, 5, 10]
const FIRST_OUTPUT_MARKER = 'FELIXO_RESPONSIVENESS_FIRST_OUTPUT_OK'
const FIRST_OUTPUT_TIMEOUT_MS = 15_000

function parseBoundedInteger(value, min, max, name) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} deve estar entre ${min} e ${max}.`)
  }
  return parsed
}

function parseArgs(argv = []) {
  const options = {
    iterations: DEFAULT_ITERATIONS,
    agentCounts: [...DEFAULT_AGENT_COUNTS],
    out: null,
    managers: null,
  }
  for (const argument of argv) {
    if (argument.startsWith('--iterations=')) {
      options.iterations = parseBoundedInteger(argument.slice('--iterations='.length), 1, 20, 'iterations')
    } else if (argument.startsWith('--agents=')) {
      const values = argument.slice('--agents='.length).split(',').map((value) => parseBoundedInteger(value, 1, 10, 'agents'))
      if (values.length === 0 || new Set(values).size !== values.length) throw new Error('agents deve conter contagens únicas.')
      options.agentCounts = values
    } else if (argument.startsWith('--out=')) {
      options.out = argument.slice('--out='.length)
    } else if (argument.startsWith('--managers=')) {
      options.managers = argument.slice('--managers='.length).split(',')
    } else {
      throw new Error(`Argumento desconhecido: ${argument}`)
    }
  }
  return options
}

/**
 * Um único terminal real, do início do spawn até o primeiro output que bate
 * com o marcador — cada chamada é uma sessão nova (o app abre uma sessão por
 * terminal; medir a reabertura é o que corresponde à experiência real).
 *
 * @param {PtyProcessManager} manager
 * @param {number} [timeoutMs] - Injetável nos testes.
 * @returns {Promise<number>} milissegundos até o primeiro output.
 */
function measureFirstOutput(manager, timeoutMs = FIRST_OUTPUT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const sessionId = `responsiveness-${process.pid}-${Math.random().toString(36).slice(2)}`
    let settled = false
    let timer = null

    const finish = (callback, value) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      callback(value)
    }

    timer = setTimeout(() => {
      try {
        manager.kill(sessionId, { force: true })
      } catch {
        // O timeout em si já é o diagnóstico útil.
      }
      finish(reject, new Error('Terminal não produziu o primeiro output dentro do tempo limite.'))
    }, timeoutMs)

    const startedAt = performance.now()
    let firstOutputAt = null

    try {
      manager.spawn(sessionId, {
        onData: (data) => {
          if (firstOutputAt === null) {
            firstOutputAt = performance.now()
          }
          if (String(data).includes(FIRST_OUTPUT_MARKER)) {
            finish(resolve, firstOutputAt - startedAt)
          }
        },
        onExit: () => {
          // Sessão pode encerrar antes do marcador aparecer em SOs onde o
          // shell padrão já imprime algo e sai rápido — não é o cenário
          // normal, mas não deve travar a bancada inteira num timeout cheio.
          if (firstOutputAt !== null && !settled) {
            finish(resolve, firstOutputAt - startedAt)
          }
        },
      })

      const input = process.platform === 'win32'
        ? `echo ${FIRST_OUTPUT_MARKER}\r\nexit\r\n`
        : `printf '${FIRST_OUTPUT_MARKER}\\n'\nexit\n`
      manager.write(sessionId, input)
    } catch (error) {
      finish(reject, error)
    }
  })
}

/**
 * Roda `iterations` medições de primeiro-output, uma sessão de terminal por
 * vez (sequencial — mede a experiência de abrir terminais um após o outro,
 * não N ao mesmo tempo, que é um cenário distinto e não pedido aqui).
 *
 * @param {number} iterations
 * @returns {Promise<number[]>}
 */
async function measureFirstOutputSeries(iterations) {
  const manager = new PtyProcessManager()
  const samples = []
  try {
    for (let index = 0; index < iterations; index += 1) {
      samples.push(await measureFirstOutput(manager))
    }
  } finally {
    manager.killAll({ force: true })
  }
  return samples
}

/**
 * Dispara `agentCount` instalações concorrentes do gerenciador e devolve uma
 * promise que resolve quando todas terminam — para o chamador poder medir
 * responsividade ENQUANTO elas rodam, sem esperar por elas antes.
 *
 * @param {object} manager - Entrada de `discoverManagers()`.
 * @param {number} agentCount
 * @param {string} temporaryRoot
 * @returns {{ done: Promise<unknown[]>, root: string }}
 */
function startConcurrentInstalls(manager, agentCount, temporaryRoot) {
  const root = fs.mkdtempSync(path.join(temporaryRoot, `${manager.id}-load-`))
  const fixture = writeFixture(root)
  const env = createEnvironment(root, manager)
  const installRoots = Array.from({ length: agentCount }, (_, index) => {
    const installRoot = path.join(root, `agent-${index + 1}`)
    fs.mkdirSync(installRoot, { recursive: true })
    return installRoot
  })

  const done = Promise.all(installRoots.map((installRoot, index) => runWithRetry(
    manager.command,
    manager.installArgs(installRoot, fixture),
    {
      cwd: root,
      env: { ...env, FELIXO_PACKAGE_MANAGER_MARKER: path.join(root, `marker-${index + 1}`) },
      timeoutMs: 120_000,
    },
  )))

  return { done, root }
}

/**
 * @param {object} options
 * @returns {Promise<object>} relatório completo.
 */
async function runBenchmark(options) {
  const startedAt = new Date().toISOString()
  const environment = await collectEnvironmentMetadata()
  const allManagers = discoverManagers()
  const managers = options.managers
    ? allManagers.filter((manager) => options.managers.includes(manager.id))
    : allManagers.filter((manager) => manager.id === 'npm-runtime' || manager.id === 'yarn-classic')

  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-responsiveness-'))
  const results = []
  let baseline = null

  try {
    const baselineSamples = await measureFirstOutputSeries(options.iterations)
    baseline = { firstOutputMs: summarize(baselineSamples) }

    for (const manager of managers) {
      if (!manager.available) {
        results.push({
          manager: manager.id,
          available: false,
          reason: manager.availabilityReason,
        })
        continue
      }

      const perAgentCount = []
      for (const agentCount of options.agentCounts) {
        const { done, root } = startConcurrentInstalls(manager, agentCount, temporaryRoot)
        let installOutcome = null
        try {
          const duringSamples = await measureFirstOutputSeries(options.iterations)
          installOutcome = await done
          perAgentCount.push({
            agentCount,
            firstOutputMs: summarize(duringSamples),
            installsSucceeded: installOutcome.every((result) => !result.error && !result.timedOut && result.code === 0),
          })
        } finally {
          fs.rmSync(root, { recursive: true, force: true })
        }
      }

      results.push({ manager: manager.id, available: true, perAgentCount })
    }
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true })
  }

  return {
    schemaVersion: 1,
    startedAt,
    finishedAt: new Date().toISOString(),
    environment,
    iterations: options.iterations,
    agentCounts: options.agentCounts,
    baseline,
    results,
  }
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  const report = await runBenchmark(options)
  const encoded = JSON.stringify(report, null, 2)
  if (options.out) {
    fs.writeFileSync(options.out, encoded, 'utf8')
  }
  console.log(encoded)
}

if (require.main === module) {
  main().catch((error) => {
    process.exitCode = 1
    console.error(error instanceof Error ? error.message : String(error))
  })
}

module.exports = {
  measureFirstOutput,
  measureFirstOutputSeries,
  parseArgs,
  runBenchmark,
  startConcurrentInstalls,
}

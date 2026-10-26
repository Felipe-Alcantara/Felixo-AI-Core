#!/usr/bin/env node
'use strict'

/**
 * Bancada de carga do "Atualizar" do painel de Limites com N contas.
 *
 * Roda o `createAgentUsageService` de verdade (SQLite, pool de consultas,
 * cancelamento) contra contas com login próprio e mede o que o orçamento pede:
 * consultas e processos filhos abertos ao mesmo tempo, latência da rodada,
 * atraso do laço de eventos do processo principal, memória e processos que
 * sobram depois do cancelamento. Três modos:
 *
 * - `sim` (padrão): comandos e consultas falsos, só timers. Mede o serviço, sem
 *   processo nenhum; roda em qualquer máquina e no CI.
 * - `spawn`: cada comando e cada consulta é um processo Node de verdade (uma CLI
 *   falsa), lançado pelo mesmo `runBufferedCommand` do app. Confere o número real
 *   de filhos, a memória deles e se o cancelamento mata a árvore.
 * - `real`: as CLIs de verdade (`claude auth status --json`, `codex login status`)
 *   em perfis TEMPORÁRIOS VAZIOS, ou seja, sem login: nenhuma credencial pessoal,
 *   nenhuma chamada de rede paga, nenhuma consulta ao vivo (PTY). Só roda com
 *   `FELIXO_USAGE_REAL_CLI=1` e nunca com `CI` definido. É o "smoke real
 *   controlado": o custo de um processo de CLI de verdade, não um modelo dele.
 *
 * Tetos do `--check` definidos ANTES de medir (política: `PLANO-CADEIA-CONTAS.md`
 * §15.1; só podem baixar, subir exige entrada datada no IA.md):
 *   1. consultas em voo ≤ o teto do serviço (`REFRESH_MAX_CONCURRENCY`) e, com
 *      contas de sobra, igual a ele (o teto não pode ser mais baixo que o devido);
 *   2. toda conta ganha uma amostra, e só as contas que falham ficam em erro;
 *   3. latência da rodada ≤ 2 × ceil(consultas / teto) × tempo de uma consulta + 15 ms ×
 *      consultas + 500 ms (os 15 ms são o custo fixo por conta: gravar a amostra e montar o
 *      painel, ~11 ms medidos em 26/10/2026; a primeira calibração dos tetos, que daqui só descem);
 *   4. atraso do laço de eventos p99 ≤ 100 ms;
 *   5. crescimento da memória residente do processo principal ≤ 60 MB;
 *   6. (spawn) nenhum filho vivo 2 s depois da rodada, inclusive depois do cancelamento.
 *
 * Uso: `npm run benchmark:agent-usage -- --mode=sim --accounts=50 [--limit=4]
 *   [--latency=30] [--fail=25] [--hang=0] [--deadline=90000] [--check] [--json] [--out=arquivo]`
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFile } = require('node:child_process')
const spawn = require('cross-spawn') // o mesmo do app: resolve o shim `.cmd`/`.ps1` das CLIs no Windows
const { monitorEventLoopDelay, performance } = require('node:perf_hooks')

const { createStorageDatabase } = require('../electron/services/storage/sqlite-database.cjs')
const { createAgentUsageRepository } = require('../electron/services/storage/agent-usage-repository.cjs')
const { REFRESH_MAX_CONCURRENCY, createAgentUsageService } = require('../electron/services/agent-usage-service.cjs')
const { runBufferedCommand } = require('../electron/services/official-cli-service.cjs')

const DEFAULT_ACCOUNTS = 50
const MAX_ACCOUNTS = 200
/** No modo real cada conta abre um processo de CLI de verdade: a rampa é curta de propósito. */
const REAL_MAX_ACCOUNTS = 12
const REAL_MIN_FREE_MEMORY_MB = 1_024
const SAMPLE_INTERVAL_MS = 200

const BUDGET = {
  eventLoopP99Ms: 100,
  rssGrowthMb: 60,
  makespanFactor: 2,
  perTaskOverheadMs: 15,
  makespanSlackMs: 500,
  leftoverChildren: 0,
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function parseArgs(argv) {
  const options = {
    mode: 'sim',
    accounts: DEFAULT_ACCOUNTS,
    limit: REFRESH_MAX_CONCURRENCY,
    latency: null,
    fail: 25,
    hang: 0,
    deadline: null,
    check: false,
    json: false,
    out: null,
  }

  for (const argument of argv) {
    if (argument === '--check') options.check = true
    else if (argument === '--json') options.json = true
    else if (argument.startsWith('--') && argument.includes('=')) {
      const separator = argument.indexOf('=')
      const name = argument.slice(2, separator)
      const value = argument.slice(separator + 1)
      if (name === 'mode') {
        if (!['sim', 'spawn', 'real'].includes(value)) throw new Error('--mode precisa ser sim, spawn ou real.')
        options.mode = value
      } else if (name === 'out') options.out = path.resolve(value)
      else if (['accounts', 'limit', 'latency', 'fail', 'hang', 'deadline'].includes(name)) {
        const number = Number(value)
        if (!Number.isInteger(number) || number < 0) throw new Error(`--${name} precisa ser um inteiro não negativo.`)
        options[name] = number
      } else throw new Error(`Opção desconhecida: --${name}`)
    } else throw new Error(`Argumento desconhecido: ${argument}`)
  }

  if (options.accounts < 1 || options.accounts > MAX_ACCOUNTS) throw new Error(`--accounts vai de 1 a ${MAX_ACCOUNTS}.`)
  if (options.limit < 1) throw new Error('--limit precisa ser pelo menos 1.')
  options.latency ??= options.mode === 'sim' ? 30 : 150
  return options
}

/** Contas alternando Claude e Codex; `fail` e `hang` em % espalhados pelos índices. */
function planAccounts({ accounts, fail, hang }) {
  const every = (percent) => (percent > 0 ? Math.max(1, Math.round(100 / percent)) : Number.POSITIVE_INFINITY)
  const failEvery = every(fail)
  const hangEvery = every(hang)
  return Array.from({ length: accounts }, (_, index) => ({
    index,
    providerId: index % 2 === 0 ? 'claude' : 'codex',
    mode: Number.isFinite(hangEvery) && index % hangEvery === 0 ? 'trava' : Number.isFinite(failEvery) && index % failEvery === 1 ? 'falha' : 'ok',
  }))
}

function profileFor(account, dir) {
  const folder = path.join(dir, `${account.providerId}-${account.index}`)
  fs.mkdirSync(folder, { recursive: true })
  const variable = account.providerId === 'claude' ? 'CLAUDE_CONFIG_DIR' : 'CODEX_HOME'
  return {
    id: `${account.providerId}-${account.index}`,
    providerId: account.providerId,
    label: `${account.providerId} ${account.index}`,
    probeOptions: account.providerId === 'codex' ? { codexHome: folder } : undefined,
    profileEnv: { [variable]: folder, FELIXO_BENCH_MODE: account.mode, FELIXO_BENCH_INDEX: String(account.index) },
  }
}

function loginJson(providerId, index) {
  return providerId === 'claude'
    ? JSON.stringify({ loggedIn: true, email: `c${index}@example.com`, subscriptionType: 'pro' })
    : `Logged in using ChatGPT\nAccount: x${index}@example.com`
}

function usage(index) {
  return {
    ok: true,
    collectedAt: new Date().toISOString(),
    measuredAt: new Date().toISOString(),
    metrics: [{ key: 'rate_limits.seven_day', label: 'Janela de 7 dias', used: index % 100, limit: 100, remaining: 100 - (index % 100), unit: '%', precision: 'percentage', resetAt: null }],
    details: null,
    message: null,
  }
}

/** Conta quantos comandos/consultas estão em voo; o pico é o orçamento de processos. */
function createGauge() {
  const state = { current: 0, peak: 0, calls: 0 }
  return {
    state,
    enter() {
      state.current += 1
      state.calls += 1
      state.peak = Math.max(state.peak, state.current)
    },
    leave() {
      state.current -= 1
    },
  }
}

const runExec = (file, args) =>
  new Promise((resolve) => execFile(file, args, { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => resolve(error ? '' : stdout)))

/** Processos descendentes de `rootPid` (nome, bytes residentes), sem o próprio amostrador. */
async function sampleDescendants(rootPid) {
  const text = process.platform === 'win32'
    ? await runExec('powershell', ['-NoProfile', '-NonInteractive', '-Command', "Get-CimInstance Win32_Process | ForEach-Object { '{0},{1},{2},{3}' -f $_.ProcessId,$_.ParentProcessId,$_.WorkingSetSize,$_.Name }"])
    : await runExec('ps', ['-A', '-o', 'pid=,ppid=,rss=,comm='])
  const rows = []
  for (const line of text.split(/\r?\n/)) {
    const match = process.platform === 'win32'
      ? /^(\d+),(\d+),(\d+),(.+)$/.exec(line.trim())
      : /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/.exec(line)
    if (!match) continue
    const bytes = Number(match[3]) * (process.platform === 'win32' ? 1 : 1024)
    rows.push({ pid: Number(match[1]), ppid: Number(match[2]), bytes, name: match[4].trim() })
  }
  const children = new Map()
  for (const row of rows) (children.get(row.ppid) ?? children.set(row.ppid, []).get(row.ppid)).push(row)
  const found = []
  const stack = [rootPid]
  while (stack.length) for (const row of children.get(stack.pop()) ?? []) { found.push(row); stack.push(row.pid) }
  return found.filter((row) => !/^(powershell|pwsh|ps)(\.exe)?$/i.test(row.name))
}

/** Amostra a árvore de filhos em segundo plano e guarda o pico de processos e de memória. */
function watchTree() {
  const peak = { processes: 0, megabytes: 0, samples: 0 }
  let running = true
  const loop = (async () => {
    while (running) {
      const children = await sampleDescendants(process.pid)
      peak.samples += 1
      peak.processes = Math.max(peak.processes, children.length)
      peak.megabytes = Math.max(peak.megabytes, Math.round(children.reduce((sum, row) => sum + row.bytes, 0) / 1_048_576))
      await sleep(SAMPLE_INTERVAL_MS)
    }
  })()
  return { peak, stop: async () => { running = false; await loop } }
}

function isAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** CLI falsa em disco: uma linha de comando, um comportamento (`ok`, `falha` ou `trava`). */
function writeFakeCli(dir) {
  const file = path.join(dir, 'cli-falsa.cjs')
  fs.writeFileSync(file, [
    "'use strict'",
    'const [, , mode, latency, provider, index] = process.argv',
    "if (mode === 'trava') setInterval(() => {}, 1000)",
    'else setTimeout(() => {',
    "  if (mode === 'falha') { console.error('Error: falha simulada'); process.exit(1) }",
    "  console.log(provider === 'claude' ? JSON.stringify({ loggedIn: true, email: `c${index}@example.com`, subscriptionType: 'pro' }) : `Logged in using ChatGPT\\nAccount: x${index}@example.com`)",
    '}, Number(latency))',
  ].join('\n'))
  return file
}

async function run(options) {
  if (options.mode === 'real') {
    if (process.env.FELIXO_USAGE_REAL_CLI !== '1') throw new Error('O modo real abre as CLIs de verdade: exige FELIXO_USAGE_REAL_CLI=1.')
    if (process.env.CI) throw new Error('O modo real não roda no CI (CI definido).')
    if (options.accounts > REAL_MAX_ACCOUNTS) throw new Error(`O modo real vai até ${REAL_MAX_ACCOUNTS} contas: cada uma é um processo de CLI de verdade.`)
    if (os.freemem() / 1_048_576 < REAL_MIN_FREE_MEMORY_MB) throw new Error(`Memória livre abaixo de ${REAL_MIN_FREE_MEMORY_MB} MB: o modo real não roda assim.`)
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-usage-bench-'))
  const database = createStorageDatabase({ databaseDir: path.join(dir, 'db') })
  const repository = createAgentUsageRepository(database)
  const plan = planAccounts(options)
  // No modo real as contas não têm login: o plano de falha/trava não se aplica.
  if (options.mode === 'real') for (const account of plan) account.mode = 'ok'
  const profiles = plan.map((account) => profileFor(account, dir))
  const gauge = createGauge()
  const children = { spawned: [], current: 0, peak: 0 }
  const fakeCli = options.mode === 'spawn' ? writeFakeCli(dir) : null
  const scratch = path.join(dir, 'sem-login')
  fs.mkdirSync(scratch, { recursive: true })

  const trackedSpawn = (command, args, spawnOptions) => {
    const child = spawn(command, args, spawnOptions)
    children.spawned.push(child.pid)
    children.current += 1
    children.peak = Math.max(children.peak, children.current)
    child.once('exit', () => { children.current -= 1 })
    return child
  }

  let runCommand
  let queryLive
  if (options.mode === 'sim') {
    runCommand = async ({ env, signal }) => {
      gauge.enter()
      try {
        if (env.FELIXO_BENCH_MODE === 'trava') {
          return await new Promise((resolve) => signal?.addEventListener('abort', () => resolve({ ok: false, cancelled: true, stdout: '', stderr: '' }), { once: true }))
        }
        await sleep(options.latency)
        if (env.FELIXO_BENCH_MODE === 'falha') return { ok: false, stdout: '', stderr: 'Error: falha simulada' }
        return { ok: true, stdout: loginJson(env.CLAUDE_CONFIG_DIR ? 'claude' : 'codex', env.FELIXO_BENCH_INDEX), stderr: '' }
      } finally {
        gauge.leave()
      }
    }
    queryLive = async ({ env }) => {
      gauge.enter()
      try {
        await sleep(options.latency)
        return usage(Number(env.FELIXO_BENCH_INDEX))
      } finally {
        gauge.leave()
      }
    }
  } else if (options.mode === 'spawn') {
    const viaFakeCli = (env, signal) => {
      gauge.enter()
      return runBufferedCommand({
        command: process.execPath,
        args: [fakeCli, env.FELIXO_BENCH_MODE ?? 'ok', String(options.latency), env.CLAUDE_CONFIG_DIR ? 'claude' : 'codex', env.FELIXO_BENCH_INDEX ?? '0'],
        env: { ...process.env, ...env },
        timeoutMs: 30_000,
        signal,
        spawn: trackedSpawn,
      }).finally(() => gauge.leave())
    }
    runCommand = ({ env, signal }) => viaFakeCli(env, signal)
    queryLive = async ({ env, signal }) => {
      const result = await viaFakeCli({ ...env, FELIXO_BENCH_MODE: 'ok' }, signal)
      return result.ok ? usage(Number(env.FELIXO_BENCH_INDEX)) : { ok: false, message: 'consulta cancelada' }
    }
  } else {
    // Real: o comando de verdade, e o login do sistema também em perfil vazio.
    runCommand = (args) => {
      gauge.enter()
      const hasProfile = Boolean(args.env.CLAUDE_CONFIG_DIR || args.env.CODEX_HOME)
      const env = hasProfile ? args.env : { ...args.env, CLAUDE_CONFIG_DIR: scratch, CODEX_HOME: scratch }
      return runBufferedCommand({ ...args, env, spawn: trackedSpawn }).finally(() => gauge.leave())
    }
    queryLive = null
  }

  const service = createAgentUsageService({
    repository,
    probe: () => null,
    listCatalog: async () => [],
    listProfiles: () => profiles,
    runCommand,
    queryLiveUsage: queryLive ? { 'claude-status': queryLive, 'codex-rate-limits': queryLive } : {},
    maxConcurrent: options.limit,
    ...(options.deadline ? { refreshDeadlineMs: options.deadline } : {}),
  })

  const loopDelay = monitorEventLoopDelay({ resolution: 10 })
  const tree = options.mode === 'sim' ? null : watchTree()
  const rssBefore = process.memoryUsage().rss
  let rssPeak = rssBefore
  const rssTimer = setInterval(() => { rssPeak = Math.max(rssPeak, process.memoryUsage().rss) }, 25)
  loopDelay.enable()
  const startedAt = performance.now()
  const dashboard = await service.refresh()
  const roundMs = performance.now() - startedAt
  loopDelay.disable()
  clearInterval(rssTimer)
  const rssAfter = process.memoryUsage().rss

  await sleep(2_000) // folga para os filhos terminarem antes de contar os que sobraram
  if (tree) await tree.stop()

  const samples = profiles.map((profile) => ({ plan: plan.find((account) => `${account.providerId}-${account.index}` === profile.id), sample: repository.getLatestSample(profile.id) }))
  const byStatus = {}
  for (const { sample } of samples) byStatus[sample?.status ?? 'sem-amostra'] = (byStatus[sample?.status ?? 'sem-amostra'] ?? 0) + 1
  const leftover = children.spawned.filter(isAlive).length
  const tasks = options.accounts + 2 // um login de sistema por provedor
  const commandsPerTask = options.mode === 'real' ? 1 : 2

  const result = {
    mode: options.mode,
    accounts: options.accounts,
    limit: options.limit,
    latencyMs: options.latency,
    failPercent: options.mode === 'real' ? 0 : options.fail,
    hangPercent: options.mode === 'real' ? 0 : options.hang,
    deadlineMs: options.deadline ?? 90_000,
    dashboardOk: dashboard.ok === true,
    peakInFlight: gauge.state.peak,
    commands: gauge.state.calls,
    roundMs: Math.round(roundMs),
    expectedMakespanMs: Math.ceil(tasks / options.limit) * commandsPerTask * options.latency,
    budgetMakespanMs: BUDGET.makespanFactor * Math.ceil(tasks / options.limit) * commandsPerTask * options.latency + BUDGET.perTaskOverheadMs * tasks + BUDGET.makespanSlackMs,
    eventLoopDelayMs: { p50: +(loopDelay.percentile(50) / 1e6).toFixed(1), p99: +(loopDelay.percentile(99) / 1e6).toFixed(1), max: +(loopDelay.max / 1e6).toFixed(1) },
    rssGrowthMb: Math.round((Math.max(rssPeak, rssAfter) - rssBefore) / 1_048_576),
    statuses: byStatus,
    expectedFailing: samples.filter(({ plan: account }) => account.mode !== 'ok').length,
    children: options.mode === 'sim' ? null : {
      spawned: children.spawned.length,
      peakAlive: children.peak,
      peakTreeProcesses: tree.peak.processes,
      peakTreeMb: tree.peak.megabytes,
      peakTreeMbPerProcess: tree.peak.processes ? +(tree.peak.megabytes / tree.peak.processes).toFixed(1) : 0,
      treeSamples: tree.peak.samples,
      leftoverAlive: leftover,
    },
    machine: { cpus: os.availableParallelism(), totalMemoryMb: Math.round(os.totalmem() / 1_048_576), freeMemoryMbBefore: null, platform: process.platform, node: process.version },
  }

  database.close()
  fs.rmSync(dir, { recursive: true, force: true })
  return result
}

function evaluate(result) {
  const failures = []
  const need = (ok, message) => { if (!ok) failures.push(message) }
  need(result.dashboardOk, 'o Atualizar não devolveu ok')
  // O teto é o contrato do serviço: `--limit` maior que ele (o "antes" sem limite) reprova.
  const ceiling = Math.min(result.limit, REFRESH_MAX_CONCURRENCY)
  need(result.peakInFlight <= ceiling, `pico de ${result.peakInFlight} em voo passa do teto ${ceiling}`)
  if (result.accounts + 2 >= ceiling) need(result.peakInFlight >= ceiling, `o pico de ${result.peakInFlight} ficou abaixo do teto ${ceiling}: o teto está mais baixo que o devido`)
  const semAmostra = result.statuses['sem-amostra'] ?? 0
  need(semAmostra === 0, `${semAmostra} contas ficaram sem amostra`)
  if (result.mode !== 'real') {
    const emErro = result.statuses.error ?? 0
    // Com contas que travam o teto de tempo cancela a rodada, e as que a fila não alcançou também ficam em erro.
    if (result.hangPercent === 0) need(emErro === result.expectedFailing, `${emErro} contas em erro; esperado ${result.expectedFailing} (as que falham de propósito)`)
    else need(emErro >= result.expectedFailing, `${emErro} contas em erro; as ${result.expectedFailing} que travam de propósito têm que estar entre elas`)
    if (result.hangPercent === 0) need(result.roundMs <= result.budgetMakespanMs, `rodada de ${result.roundMs} ms passa do teto de ${result.budgetMakespanMs} ms (${BUDGET.makespanFactor} × ${result.expectedMakespanMs} ms + ${BUDGET.perTaskOverheadMs} ms × ${result.accounts + 2} + ${BUDGET.makespanSlackMs} ms)`)
    need(result.eventLoopDelayMs.p99 <= BUDGET.eventLoopP99Ms, `atraso do laço de eventos p99 de ${result.eventLoopDelayMs.p99} ms passa de ${BUDGET.eventLoopP99Ms} ms`)
    need(result.rssGrowthMb <= BUDGET.rssGrowthMb, `memória do processo principal cresceu ${result.rssGrowthMb} MB (teto ${BUDGET.rssGrowthMb} MB)`)
  }
  if (result.children) need(result.children.leftoverAlive <= BUDGET.leftoverChildren, `${result.children.leftoverAlive} filho(s) vivo(s) depois da rodada`)
  return failures
}

function printHuman(result, failures) {
  const lines = [
    `Bancada de carga do Atualizar — modo ${result.mode}, ${result.accounts} contas, teto ${result.limit}`,
    `  em voo (pico)        ${result.peakInFlight}  (${result.commands} comandos/consultas)`,
    `  rodada               ${result.roundMs} ms  (consultas ~${result.expectedMakespanMs} ms; teto ${result.budgetMakespanMs} ms)`,
    `  laço de eventos      p50 ${result.eventLoopDelayMs.p50} ms | p99 ${result.eventLoopDelayMs.p99} ms | máx ${result.eventLoopDelayMs.max} ms`,
    `  memória (principal)  +${result.rssGrowthMb} MB`,
    `  amostras             ${JSON.stringify(result.statuses)}  (falhas de propósito: ${result.expectedFailing})`,
  ]
  if (result.children) {
    lines.push(`  filhos               lançados ${result.children.spawned} | pico vivos ${result.children.peakAlive} | pico na árvore ${result.children.peakTreeProcesses} processos, ${result.children.peakTreeMb} MB | sobraram ${result.children.leftoverAlive}`)
  }
  lines.push(failures.length ? `\nREPROVADO:\n${failures.map((failure) => `  - ${failure}`).join('\n')}` : '\nDentro dos tetos.')
  console.log(lines.join('\n'))
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const freeBefore = Math.round(os.freemem() / 1_048_576)
  const result = await run(options)
  result.machine.freeMemoryMbBefore = freeBefore
  const failures = evaluate(result)
  if (options.out) fs.writeFileSync(options.out, JSON.stringify({ ...result, failures }, null, 2))
  if (options.json) console.log(JSON.stringify({ ...result, failures }, null, 2))
  else printHuman(result, failures)
  if (options.check && failures.length) process.exitCode = 1
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

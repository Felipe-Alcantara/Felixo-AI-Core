'use strict'

/**
 * Cancelar e deixar expirar a instalação de uma CLI pelo app EMPACOTADO, e provar
 * que nenhum processo da árvore do npm sobra.
 *
 * Por que existe: `core/process-tree.cjs` (PR #84) só tinha prova no runner do CI e
 * em teste unitário. Este cenário roda o `managed-cli-installer` que vai DENTRO do
 * `app.asar`, com o npm que vai dentro do pacote, contra um pacote local cujo
 * `postinstall` sobe um neto — a árvore que um `npm install` de verdade monta
 * (npm → shell → script → neto).
 *
 * Quem prova que a árvore morreu NÃO é o código testado. O driver (que roda dentro
 * do executável empacotado, como Node) só tira uma fotografia da árvore com
 * `ps`/`Get-CimInstance`; o runner, depois que o driver saiu, confere pid a pid se
 * algum sobrou. O controle negativo (`--control`) mata só o npm, como o
 * `child.kill()` de antes do PR #84, e PRECISA deixar órfãos: é o que prova que a
 * sonda enxerga o defeito que ela existe para pegar.
 *
 * Uso, a partir de `app/`:
 *   node scripts/installer-kill-smoke.cjs --artifact release/win-unpacked
 *   node scripts/installer-kill-smoke.cjs --source          # árvore de trabalho, sem empacotar
 *   node scripts/installer-kill-smoke.cjs --artifact ... --control
 * No CI ele roda como parte de `scripts/release-smoke.cjs`, nos três sistemas.
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')

const FIXTURE_NAME = 'felixo-kill-smoke-cli'
const HOLD_ENV_KEY = 'FELIXO_KILL_SMOKE_HOLD_FILE'
const DRIVER_FLAG = '--driver'
const SCENARIOS = ['cancel', 'timeout']
/** Quanto esperar o `postinstall` subir: o primeiro npm de um runner frio é lento. */
const HOLD_WAIT_MS = 90_000
/** Depois do kill, quanto esperar até o último processo da árvore sumir. */
const SURVIVOR_WAIT_MS = 15_000
const POLL_MS = 100
const DEFAULT_DEADLINE_MS = 180_000
const MIN_TIMEOUT_SCENARIO_MS = 20_000
const MAX_TIMEOUT_SCENARIO_MS = 120_000

// ---------------------------------------------------------------------------
// Sonda de processos — independente do código que está sendo testado.
// ---------------------------------------------------------------------------

/**
 * @typedef {object} ProcessEntry
 * @property {number} pid
 * @property {number} ppid
 * @property {string} name
 */

function parseWindowsProcessTable(text) {
  const raw = JSON.parse(String(text).trim() || '[]')
  const rows = Array.isArray(raw) ? raw : [raw]
  return rows
    .map((row) => ({
      pid: Number(row?.ProcessId),
      ppid: Number(row?.ParentProcessId),
      name: String(row?.Name ?? ''),
    }))
    .filter((row) => Number.isInteger(row.pid) && row.pid > 0)
}

function parsePosixProcessTable(text) {
  const rows = []
  for (const line of String(text).split(/\r?\n/)) {
    // `comm` pode ter espaços e, no macOS, vem com o caminho inteiro.
    const match = /^\s*(\d+)\s+(\d+)\s+(.*\S)\s*$/.exec(line)
    if (!match) continue
    rows.push({ pid: Number(match[1]), ppid: Number(match[2]), name: path.posix.basename(match[3]) })
  }
  return rows
}

/**
 * Fotografia dos processos do sistema. O próprio processo da sonda (e o que ele
 * criar, como o `conhost.exe` do PowerShell) sai da lista: ele existe só por causa
 * da medição e não pode contar como "filho do instalador".
 *
 * @returns {ProcessEntry[]}
 */
function listProcesses({ platformName = process.platform, run = spawnSync } = {}) {
  const probe = platformName === 'win32'
    ? run(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name | ConvertTo-Json -Compress',
      ],
      { encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024, timeout: 60_000 },
    )
    : run('ps', ['-A', '-o', 'pid=,ppid=,comm='], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      timeout: 60_000,
    })

  if (probe.error || probe.status !== 0) {
    throw new Error(`A sonda de processos falhou: ${probe.error?.message ?? `codigo ${probe.status}`}`)
  }

  const table = platformName === 'win32'
    ? parseWindowsProcessTable(probe.stdout)
    : parsePosixProcessTable(probe.stdout)

  if (!Number.isInteger(probe.pid)) return table
  const own = new Set([probe.pid, ...descendantsOf(probe.pid, table).map((entry) => entry.pid)])
  return table.filter((entry) => !own.has(entry.pid))
}

/**
 * Todos os descendentes de `rootPid` (filhos, netos, ...), em largura. A raiz não
 * entra. Um pid repetido ou um ciclo (pid reaproveitado) não trava a busca.
 *
 * @param {number} rootPid
 * @param {ProcessEntry[]} table
 * @returns {Array<ProcessEntry & { depth: number }>}
 */
function descendantsOf(rootPid, table) {
  const childrenByParent = new Map()
  for (const row of table) {
    if (row.pid === row.ppid) continue
    const siblings = childrenByParent.get(row.ppid) ?? []
    siblings.push(row)
    childrenByParent.set(row.ppid, siblings)
  }

  const found = []
  const seen = new Set([rootPid])
  let level = [rootPid]
  for (let depth = 1; level.length > 0; depth += 1) {
    const next = []
    for (const parent of level) {
      for (const child of childrenByParent.get(parent) ?? []) {
        if (seen.has(child.pid)) continue
        seen.add(child.pid)
        found.push({ pid: child.pid, ppid: child.ppid, name: child.name, depth })
        next.push(child.pid)
      }
    }
    level = next
  }
  return found
}

function isAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM: existe, só não é nosso. Só ESRCH quer dizer "morreu".
    return error?.code === 'EPERM'
  }
}

function sameProcessName(left, right) {
  const normalize = (value) => String(value).toLowerCase().replace(/\.exe$/, '')
  return normalize(left) === normalize(right)
}

/**
 * Pid vivo não basta: o SO reaproveita pid. Sobrevivente é quem ainda tem o MESMO
 * pid E o mesmo nome de quando a fotografia foi tirada.
 *
 * @param {Array<{ pid: number, name: string }>} recorded
 * @param {ProcessEntry[]} table
 */
function findSurvivors(recorded, table) {
  return recorded.filter((entry) =>
    table.some((row) => row.pid === entry.pid && sameProcessName(row.name, entry.name)),
  )
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * O atalho `node.cmd` que o app gera grava o caminho do executável em UTF-8 e o
 * `cmd.exe` o lê na página de código OEM do console. Sem console visível (a
 * instalação roda com `windowsHide`) isso é cp850/cp437, e um caminho com acento
 * vira "O sistema não pode encontrar o caminho especificado" (medido em
 * 21/10/2026). Falhar aqui, com a causa, poupa um smoke que ia demorar minutos
 * para mostrar um erro de npm que não tem relação com o que se quer provar.
 */
function assertShimSafeExecutable(executable, platformName = process.platform) {
  if (platformName === 'win32' && /[^\x00-\x7F]/.test(String(executable))) {
    throw new Error(
      'O caminho do executavel empacotado tem caracteres fora do ASCII, e o atalho node.cmd que o app gera nao e lido pelo cmd.exe nesse caso. Rode o smoke a partir de uma pasta sem acento, como no CI.',
    )
  }
}

/**
 * Espera a árvore fotografada sumir. Devolve quem ainda estiver lá quando o prazo
 * acabar (lista vazia = nenhum órfão).
 */
async function waitForDisappearance(recorded, {
  timeoutMs = SURVIVOR_WAIT_MS,
  pollMs = POLL_MS,
  alive = isAlive,
  list = listProcesses,
  sleep = delay,
} = {}) {
  const deadline = Date.now() + timeoutMs
  let remaining = recorded
  while (remaining.length > 0 && Date.now() < deadline) {
    remaining = remaining.filter((entry) => alive(entry.pid))
    if (remaining.length > 0) await sleep(pollMs)
  }
  if (remaining.length === 0) return []
  return findSurvivors(remaining, list())
}

/** Limpeza: um órfão achado pelo smoke não pode continuar na máquina de quem rodou. */
function killLeftovers(survivors, kill = process.kill.bind(process)) {
  for (const entry of survivors) {
    try {
      kill(entry.pid, 'SIGKILL')
    } catch {
      // Já morreu entre a conferência e a limpeza.
    }
  }
}

// ---------------------------------------------------------------------------
// Pacote de teste: um `postinstall` que sobe um neto e fica esperando.
// ---------------------------------------------------------------------------

function writeKillFixture(directory) {
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(
    path.join(directory, 'package.json'),
    `${JSON.stringify({
      name: FIXTURE_NAME,
      version: '1.0.0',
      scripts: { postinstall: 'node hold.cjs' },
    }, null, 2)}\n`,
    'utf8',
  )
  fs.writeFileSync(
    path.join(directory, 'hold.cjs'),
    [
      "'use strict'",
      '// Simula o pós-instalação de uma CLI que deixa um processo rodando: sobe um neto',
      '// e fica vivo. Os dois se desligam sozinhos em 5 min, para que um kill que falhe',
      '// não deixe lixo na máquina de quem rodou o smoke.',
      "const { spawn } = require('node:child_process')",
      "const fs = require('node:fs')",
      "const grandchild = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 300000)'], { stdio: 'ignore' })",
      `fs.writeFileSync(process.env.${HOLD_ENV_KEY}, JSON.stringify({ pid: process.pid, grandchildPid: grandchild.pid }))`,
      'setTimeout(() => process.exit(0), 300000)',
      '',
    ].join('\n'),
    'utf8',
  )
}

// ---------------------------------------------------------------------------
// Driver: roda DENTRO do executável empacotado (Electron como Node).
// ---------------------------------------------------------------------------

function parseDriverArgs(argv) {
  const options = { control: false }
  const valued = {
    '--scenario': 'scenario',
    '--user-data': 'userData',
    '--electron-dir': 'electronDir',
    '--npm-cli': 'npmCliPath',
    '--fixture': 'fixtureDir',
    '--hold-file': 'holdFile',
    '--out': 'out',
    '--install-timeout-ms': 'installTimeoutMs',
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--control') {
      options.control = true
      continue
    }
    const key = valued[argument]
    if (!key) throw new Error(`Argumento desconhecido do driver: ${argument}`)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`${argument} exige um valor.`)
    options[key] = value
    index += 1
  }

  for (const required of ['scenario', 'userData', 'electronDir', 'npmCliPath', 'fixtureDir', 'holdFile', 'out']) {
    if (!options[required]) throw new Error(`O driver exige ${required}.`)
  }
  if (!SCENARIOS.includes(options.scenario)) throw new Error(`Cenario desconhecido: ${options.scenario}`)
  options.installTimeoutMs = options.installTimeoutMs ? Number(options.installTimeoutMs) : undefined
  return options
}

async function waitForHold(holdFile, timeoutMs, { pollMs = POLL_MS, sleep = delay } = {}) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const hold = JSON.parse(fs.readFileSync(holdFile, 'utf8'))
      if (Number.isInteger(hold?.pid) && Number.isInteger(hold?.grandchildPid)) return hold
    } catch {
      // Ainda não existe, ou o postinstall está no meio da escrita.
    }
    await sleep(pollMs)
  }
  return null
}

/**
 * Final da saída do npm, só para diagnóstico de falha. Caminho da pasta temporária e
 * da pasta pessoal saem do texto: o relatório do smoke é publicado como artefato.
 */
function redactDetail(text, userData, home = os.homedir()) {
  let value = String(text ?? '')
  for (const [needle, label] of [[userData, '<tmp>'], [home, '~']]) {
    if (needle) value = value.split(needle).join(label)
  }
  return value.slice(-800)
}

/** Sem texto livre da instalação: ele traz o caminho da pasta temporária. */
function classifyOutcome(result) {
  if (result?.cancelled) return 'cancelled'
  if (result?.ok) return 'installed'
  if (/tempo limite/i.test(String(result?.message ?? ''))) return 'timeout'
  return 'failed'
}

async function runDriver(argv) {
  const options = parseDriverArgs(argv)
  const progress = { scenario: options.scenario, phase: 'start' }
  const save = (patch) => {
    Object.assign(progress, patch)
    fs.writeFileSync(options.out, `${JSON.stringify(progress)}\n`, 'utf8')
  }

  try {
    save({})
    const { installManagedPackage } = require(path.join(options.electronDir, 'services', 'managed-cli-installer.cjs'))
    const { ensureManagedCliRuntime } = require(path.join(options.electronDir, 'services', 'managed-cli-runtime.cjs'))
    const { getManagedCliLayout } = require(path.join(options.electronDir, 'core', 'managed-cli-paths.cjs'))

    // Mesma sequência do app (`cli-auto-install.cjs`): layout no userData,
    // atalhos node/npm do runtime e só então a instalação.
    const layout = getManagedCliLayout({ userData: options.userData })
    fs.mkdirSync(layout.root, { recursive: true })
    ensureManagedCliRuntime({
      layout,
      nodeExecutable: process.execPath,
      npmCliPath: options.npmCliPath,
    })

    const controller = new AbortController()
    let npmPid = null
    const spawnCapturing = (...spawnArguments) => {
      const child = spawn(...spawnArguments)
      npmPid = child.pid
      return child
    }
    // Controle negativo: matar só o npm, sem a árvore — o `child.kill()` de antes do PR #84.
    const killTree = options.control
      ? async ({ pid }) => {
        try {
          process.kill(pid, 'SIGKILL')
        } catch {
          // Já tinha saído.
        }
      }
      : undefined

    const startedAt = Date.now()
    let installResult = null
    const installPromise = installManagedPackage({
      npmPackage: options.fixtureDir,
      npmCliPath: options.npmCliPath,
      nodeExecutable: process.execPath,
      layout,
      signal: controller.signal,
      spawn: spawnCapturing,
      ...(options.installTimeoutMs ? { timeoutMs: options.installTimeoutMs } : {}),
      ...(killTree ? { killTree } : {}),
    }).then((result) => {
      installResult = result
      return result
    })

    const hold = await Promise.race([
      waitForHold(options.holdFile, HOLD_WAIT_MS),
      installPromise.then(() => null),
    ])

    if (!hold) {
      // A instalação acabou antes do postinstall subir (timeout curto demais) ou o
      // postinstall nunca subiu: o cenário não provou nada.
      const endedFirst = Boolean(installResult)
      if (!installResult) {
        controller.abort()
        await installPromise
      }
      save({
        phase: 'inconclusive',
        reason: endedFirst ? 'install-ended-before-hold' : 'hold-timeout',
        outcome: classifyOutcome(installResult),
        detail: redactDetail(installResult?.output, options.userData),
      })
      return
    }

    const holdMs = Date.now() - startedAt
    const table = listProcesses()
    const tree = descendantsOf(process.pid, table)
    save({
      phase: 'hold',
      holdMs,
      hold,
      npmSpawned: Number.isInteger(npmPid),
      tree: tree.map(({ pid, name, depth }) => ({ pid, name, depth })),
    })

    const resolvedFrom = Date.now()
    if (options.scenario === 'cancel') controller.abort()
    await installPromise

    save({
      phase: 'done',
      outcome: classifyOutcome(installResult),
      resolvedAfterMs: Date.now() - resolvedFrom,
    })
  } catch (error) {
    save({ phase: 'error', error: String(error?.message ?? error).slice(0, 500) })
    process.exitCode = 1
  }
}

// ---------------------------------------------------------------------------
// Runner: dispara o driver no executável empacotado e confere o resultado.
// ---------------------------------------------------------------------------

function readJsonIfPresent(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function computeTimeoutScenarioMs(holdMs) {
  const wanted = Number.isFinite(holdMs) ? holdMs * 2 + 5_000 : MIN_TIMEOUT_SCENARIO_MS
  return Math.min(MAX_TIMEOUT_SCENARIO_MS, Math.max(MIN_TIMEOUT_SCENARIO_MS, Math.round(wanted)))
}

function runDriverProcess({ executable, args, env, deadlineMs }) {
  return new Promise((resolve) => {
    let stderr = ''
    let settled = false
    let timedOut = false
    let timer = null
    let child

    const finish = (result) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      resolve({ ...result, timedOut, stderr: stderr.slice(-2_000) })
    }

    try {
      child = spawn(executable, args, { env, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
    } catch (error) {
      finish({ code: null, error })
      return
    }

    child.stderr?.on('data', (chunk) => {
      stderr = `${stderr}${String(chunk)}`
    })
    child.once('error', (error) => finish({ code: null, error }))
    child.once('close', (code) => finish({ code }))

    timer = setTimeout(() => {
      timedOut = true
      // Prazo estourou: o que o driver subiu não pode ficar para trás.
      try {
        killLeftovers(descendantsOf(child.pid, listProcesses()))
      } catch {
        // A sonda falhou; a conferência de sobreviventes ainda usa a fotografia do driver.
      }
      try {
        child.kill('SIGKILL')
      } catch {
        // Já saiu.
      }
    }, deadlineMs)
  })
}

/**
 * @returns {Promise<object>} Registro do cenário; `ok` é o veredito.
 */
async function runScenario({
  scenario,
  executable,
  electronDir,
  npmCliPath,
  workRoot,
  deadlineMs,
  installTimeoutMs,
  control,
}) {
  const userData = path.join(workRoot, scenario)
  const fixtureDir = path.join(userData, 'fixture')
  const holdFile = path.join(userData, 'hold.json')
  const out = path.join(userData, 'driver.json')
  const userConfig = path.join(userData, 'npmrc')
  fs.mkdirSync(userData, { recursive: true })
  writeKillFixture(fixtureDir)
  fs.writeFileSync(userConfig, '', 'utf8')

  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    [HOLD_ENV_KEY]: holdFile,
    npm_config_userconfig: userConfig,
    npm_config_cache: path.join(userData, 'npm-cache'),
    npm_config_update_notifier: 'false',
  }
  delete env.ELECTRON_NO_ATTACH_CONSOLE
  delete env.ELECTRON_FORCE_WINDOW_MENU_BAR

  const args = [
    __filename,
    DRIVER_FLAG,
    '--scenario', scenario,
    '--user-data', userData,
    '--electron-dir', electronDir,
    '--npm-cli', npmCliPath,
    '--fixture', fixtureDir,
    '--hold-file', holdFile,
    '--out', out,
    ...(scenario === 'timeout' ? ['--install-timeout-ms', String(installTimeoutMs)] : []),
    ...(control ? ['--control'] : []),
  ]

  const driver = await runDriverProcess({ executable, args, env, deadlineMs })
  const progress = readJsonIfPresent(out) ?? {}
  const recorded = (progress.tree ?? []).map(({ pid, name }) => ({ pid, name }))
  const survivors = await waitForDisappearance(recorded)
  killLeftovers(survivors)

  const problems = []
  const expectedOutcome = scenario === 'cancel' ? 'cancelled' : 'timeout'

  if (driver.error) problems.push(`o executavel empacotado nao abriu (${driver.error.code ?? driver.error.message})`)
  else if (driver.timedOut) problems.push('o driver estourou o prazo')
  else if (driver.code !== 0) problems.push(`o driver saiu com codigo ${driver.code}`)

  if (progress.phase === 'error') problems.push(`falha no driver: ${progress.error}`)
  if (progress.phase === 'inconclusive') {
    problems.push(
      progress.reason === 'install-ended-before-hold'
        ? `a instalacao terminou (${progress.outcome}) antes do postinstall subir`
        : 'o postinstall nao subiu a tempo',
    )
  }
  if (progress.phase === 'done' && progress.outcome !== expectedOutcome) {
    problems.push(`resultado ${progress.outcome}, esperado ${expectedOutcome}`)
  }

  const treeKnown = progress.phase === 'hold' || progress.phase === 'done'
  if (treeKnown) {
    const observed = new Set(recorded.map((entry) => entry.pid))
    if (!progress.hold || !observed.has(progress.hold.pid) || !observed.has(progress.hold.grandchildPid)) {
      problems.push('a fotografia nao incluiu o postinstall e o neto: a arvore nao foi observada')
    }
  }

  if (control) {
    if (survivors.length === 0 && treeKnown) problems.push('controle: o kill so do npm nao deixou orfao; a sonda nao provou nada')
  } else if (survivors.length > 0) {
    problems.push(`${survivors.length} processo(s) sobraram: ${survivors.map((entry) => entry.name).join(', ')}`)
  }

  return {
    scenario,
    ok: problems.length === 0,
    outcome: progress.outcome ?? null,
    holdMs: progress.holdMs ?? null,
    resolvedAfterMs: progress.resolvedAfterMs ?? null,
    treeSize: recorded.length,
    treeDepth: Math.max(0, ...(progress.tree ?? []).map((entry) => entry.depth)),
    processes: (progress.tree ?? []).map((entry) => entry.name),
    survivors: survivors.length,
    survivorNames: survivors.map((entry) => entry.name),
    problems,
    // A saída do npm só acompanha a falha; no caminho feliz ela é ruído.
    ...(problems.length > 0 && progress.detail ? { detail: progress.detail } : {}),
  }
}

/**
 * Roda os cenários `cancel` e `timeout` contra o instalador do app.
 *
 * @param {object} options
 * @param {string} options.executable - Binário que roda como Node (o Electron empacotado).
 * @param {string} options.electronDir - Pasta `electron/` do app (dentro do `app.asar`, ou a da fonte).
 * @param {string} options.npmCliPath - `npm-cli.js` do pacote.
 * @param {string} options.temporaryRoot - Pasta descartável.
 * @param {number} [options.timeoutMs] - Prazo de cada driver.
 * @param {boolean} [options.control] - Mata só o npm e exige que sobre órfão (prova da sonda).
 * @param {string[]} [options.scenarios]
 */
async function runInstallerKillSmoke({
  executable,
  electronDir,
  npmCliPath,
  temporaryRoot,
  timeoutMs = DEFAULT_DEADLINE_MS,
  control = false,
  scenarios = SCENARIOS,
}) {
  assertShimSafeExecutable(executable)
  const workRoot = fs.mkdtempSync(path.join(temporaryRoot, 'installer-kill-'))
  const results = []
  let installTimeoutMs = MIN_TIMEOUT_SCENARIO_MS

  for (const scenario of scenarios) {
    const record = await runScenario({
      scenario,
      executable,
      electronDir,
      npmCliPath,
      workRoot,
      // O driver do "timeout" vive pelo menos até o prazo da própria instalação.
      deadlineMs: timeoutMs + (scenario === 'timeout' ? installTimeoutMs : 0),
      installTimeoutMs,
      control,
    })
    results.push(record)
    // O prazo do cenário "timeout" tem de vencer DEPOIS do postinstall subir: usa
    // o tempo que o "cancel" mediu nesta máquina, com folga.
    if (scenario === 'cancel') installTimeoutMs = computeTimeoutScenarioMs(record.holdMs)
  }

  const summary = { ok: results.every((record) => record.ok), control, scenarios: results }
  if (!summary.ok) {
    const error = new Error(
      `O cenario de matar a arvore do instalador falhou: ${results
        .filter((record) => !record.ok)
        .map((record) => `${record.scenario}: ${record.problems.join('; ')}`)
        .join(' | ')}`,
    )
    error.installerKill = summary
    throw error
  }
  return summary
}

// ---------------------------------------------------------------------------
// CLI própria (o mesmo cenário, sem o resto do release-smoke).
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const options = {
    releaseDir: 'release',
    artifact: null,
    report: null,
    source: false,
    control: false,
    keepTemp: false,
    allowSystemInstall: false,
    only: SCENARIOS,
    timeoutMs: DEFAULT_DEADLINE_MS,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--source') { options.source = true; continue }
    if (argument === '--control') { options.control = true; continue }
    if (argument === '--keep-temp') { options.keepTemp = true; continue }
    if (argument === '--allow-system-install') { options.allowSystemInstall = true; continue }
    if (['--release-dir', '--artifact', '--report', '--timeout-ms', '--only'].includes(argument)) {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error(`${argument} exige um valor.`)
      index += 1
      if (argument === '--only') {
        options.only = value.split(',').map((name) => name.trim())
        const unknown = options.only.find((name) => !SCENARIOS.includes(name))
        if (unknown) throw new Error(`--only: cenario desconhecido (${unknown}). Use ${SCENARIOS.join(', ')}.`)
      }
      if (argument === '--release-dir') options.releaseDir = value
      if (argument === '--artifact') options.artifact = value
      if (argument === '--report') options.report = value
      if (argument === '--timeout-ms') {
        const parsed = Number(value)
        if (!Number.isFinite(parsed) || parsed < 1_000) throw new Error('--timeout-ms precisa ser um numero >= 1000.')
        options.timeoutMs = Math.floor(parsed)
      }
      continue
    }
    throw new Error(`Argumento desconhecido: ${argument}`)
  }
  return options
}

function findNpmCliNextToNode(execPath = process.execPath, platformName = process.platform) {
  const candidate = platformName === 'win32'
    ? path.join(path.dirname(execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
    : path.join(path.dirname(execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')
  return fs.existsSync(candidate) ? candidate : null
}

function findPackagedElectronDir(resourcesPath) {
  // Com asar o Node comum não enxerga lá dentro; quem resolve é o Electron do driver.
  return fs.existsSync(path.join(resourcesPath, 'app.asar'))
    ? path.join(resourcesPath, 'app.asar', 'electron')
    : path.join(resourcesPath, 'app', 'electron')
}

async function main(argv = process.argv.slice(2)) {
  if (argv[0] === DRIVER_FLAG) {
    await runDriver(argv.slice(1))
    return null
  }

  // `release-smoke` também importa este módulo: o require é tardio para não haver ciclo.
  const releaseSmoke = require('./release-smoke.cjs')
  const options = parseArgs(argv)
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    mode: options.source ? 'source' : 'packaged',
    artifact: null,
    installerKill: null,
    result: 'failed',
    error: null,
  }
  let temporaryRoot = null

  try {
    temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-installer-kill-'))
    let target
    if (options.source) {
      const appRoot = path.resolve(__dirname, '..')
      const bundled = path.join(appRoot, 'build', 'npm-runtime', 'npm', 'bin', 'npm-cli.js')
      const npmCliPath = fs.existsSync(bundled) ? bundled : findNpmCliNextToNode()
      if (!npmCliPath) throw new Error('Nenhum npm-cli.js encontrado para o modo --source.')
      target = { executable: process.execPath, electronDir: path.join(appRoot, 'electron'), npmCliPath }
    } else {
      const allowSystemInstall = options.allowSystemInstall || releaseSmoke.isDisposableRunner()
      const artifactPath = releaseSmoke.resolveReleaseArtifact({
        releaseDir: path.resolve(options.releaseDir),
        explicitArtifact: options.artifact,
        allowSystemInstall,
      })
      const prepared = releaseSmoke.prepareArtifact({ artifactPath, temporaryRoot, allowSystemInstall })
      report.artifact = { name: path.basename(artifactPath), kind: releaseSmoke.getArtifactKind(artifactPath) }
      target = {
        executable: prepared.executable,
        electronDir: findPackagedElectronDir(prepared.resourcesPath),
        npmCliPath: path.join(prepared.resourcesPath, 'npm-runtime', 'npm', 'bin', 'npm-cli.js'),
      }
    }

    report.installerKill = await runInstallerKillSmoke({
      ...target,
      temporaryRoot,
      timeoutMs: options.timeoutMs,
      control: options.control,
      scenarios: options.only,
    })
    report.result = 'passed'
  } catch (error) {
    report.result = 'failed'
    report.error = String(error?.message ?? error)
    if (error?.installerKill) report.installerKill = error.installerKill
  } finally {
    if (temporaryRoot && !options.keepTemp) fs.rmSync(temporaryRoot, { recursive: true, force: true, maxRetries: 5 })
  }

  if (options.report) {
    fs.mkdirSync(path.dirname(path.resolve(options.report)), { recursive: true })
    fs.writeFileSync(path.resolve(options.report), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  if (report.result !== 'passed') process.exitCode = 1
  return report
}

module.exports = {
  assertShimSafeExecutable,
  DRIVER_FLAG,
  HOLD_ENV_KEY,
  SCENARIOS,
  classifyOutcome,
  computeTimeoutScenarioMs,
  descendantsOf,
  findNpmCliNextToNode,
  findPackagedElectronDir,
  findSurvivors,
  isAlive,
  killLeftovers,
  listProcesses,
  main,
  parseArgs,
  parseDriverArgs,
  parsePosixProcessTable,
  parseWindowsProcessTable,
  redactDetail,
  runDriver,
  runInstallerKillSmoke,
  waitForDisappearance,
  waitForHold,
  writeKillFixture,
}

if (require.main === module) {
  main().catch((error) => {
    process.exitCode = 1
    process.stderr.write(`${String(error?.message ?? error)}\n`)
  })
}

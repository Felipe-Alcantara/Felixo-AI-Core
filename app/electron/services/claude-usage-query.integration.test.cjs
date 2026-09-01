'use strict'

/**
 * Exercita a consulta ao /status do Claude com `node-pty` nativo, sem fake PTY
 * e sem rede. A fixture com o nome `claude` simula somente a interface
 * interativa necessária: prompt, quadro Status/Usage e recebimento de teclas.
 *
 * A resolução do comando continua sendo a de produção: Linux executa o shim
 * diretamente, macOS usa o shell de login e Windows usa cmd.exe/ConPTY para
 * localizar o `.cmd`. Isso evita que uma suíte verde esconda uma diferença de
 * launch entre os três sistemas.
 */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test } = require('node:test')

const platform = require('../core/platform/index.cjs')
const {
  createClaudeUsageQuery,
  parseClaudeUsageOutput,
} = require('./claude-usage-query.cjs')

const NOW = Date.parse('2026-08-30T19:00:00.000Z')
const TEMPO_LIMITE_MS = 15_000

const STATUS_OUTPUT = `
Status
Version: 2.1.251
Session name: /rename to add a name
Session ID: native-session-123
Session kind: interactive
Peer address: uds:/tmp/felixo-native-session
cwd: /tmp/felixo-status
Login method: Claude Pro account
Organization: Felixo
Email: pessoa@example.com
Model: sonnet (claude-sonnet-5)
Setting sources: User settings
Config
Usage
Total cost: $0.0000
Total duration (API): 1s
Total duration (wall): 2s
Total code changes: 3 lines added, 1 line removed
Usage by model: sonnet 10 input, 20 output
Current session
12% used
Resets 6:50pm (America/Sao_Paulo)
Current week (all models)
100% used
Resets Sep 2, 2am (America/Sao_Paulo)
+50% weekly limits promo through Aug 31 · clau.de/cc-50-promo
What's contributing to your limits usage?
Approximate, based on local sessions on this machine—does not include other devices or claude.ai
Last 24h, these independent factors are affecting your usage:
100% of your usage was at >150k context
100% of your usage was in sessions active for 8+ hours
Usage credits
Off
Stats
`

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`
}

function windowsQuote(value) {
  return `"${String(value).replaceAll('"', '""')}"`
}

function conferirRunnerNativo() {
  assert.ok(
    ['linux', 'darwin', 'win32'].includes(process.platform),
    `[Claude /status PTY] runner incompatível: ${process.platform}; esperado Linux, macOS ou Windows`,
  )

  if (process.platform === 'win32') {
    const shell = process.env.ComSpec || process.env.COMSPEC
    assert.ok(
      shell,
      '[Claude /status PTY] Windows sem ComSpec/COMSPEC; não é possível validar cmd.exe/ConPTY',
    )
    assert.ok(
      fs.existsSync(shell),
      `[Claude /status PTY] shell do Windows não encontrado: ${shell}`,
    )
    return
  }

  if (process.platform === 'darwin') {
    const shell = platform.getDefaultShell(process.env)
    assert.ok(
      shell,
      '[Claude /status PTY] macOS sem shell padrão; não é possível validar o launch spec',
    )
    assert.ok(
      fs.existsSync(shell),
      `[Claude /status PTY] shell do macOS não encontrado: ${shell}`,
    )
  }
}

function criarFixtureClaude(diretorio) {
  const script = path.join(diretorio, 'claude-native-fixture.cjs')
  const source = [
    "'use strict'",
    "const fs = require('node:fs')",
    `const STATUS_OUTPUT = ${JSON.stringify(STATUS_OUTPUT)}`,
    'const logPath = process.env.FELIXO_NATIVE_CLAUDE_LOG',
    'let entrada = ""',
    'let statusPublicado = false',
    'function registrar(evento) {',
    "  fs.appendFileSync(logPath, JSON.stringify(evento) + '\\n', 'utf8')",
    '}',
    'registrar({',
    "  type: 'startup',",
    '  cwd: process.cwd(),',
    '  args: process.argv.slice(2),',
    '  env: {',
    '    claudeConfigDir: process.env.CLAUDE_CONFIG_DIR,',
    '    skipPromptHistory: process.env.CLAUDE_CODE_SKIP_PROMPT_HISTORY,',
    '  },',
    '})',
    "process.stdout.write('❯\\nSettings Status Config Usage Stats\\n')",
    'if (process.stdin.isTTY) process.stdin.setRawMode(true)',
    "process.stdin.setEncoding('utf8')",
    'process.stdin.on(\'data\', (dados) => {',
    '  const texto = String(dados)',
    '  entrada += texto',
    "  registrar({ type: 'input', value: texto })",
    "  if (!statusPublicado && entrada.includes('/status')) {",
    '    statusPublicado = true',
    '    process.stdout.write(STATUS_OUTPUT)',
    '  }',
    '})',
    'process.stdin.resume()',
  ].join('\n')

  fs.writeFileSync(script, source, 'utf8')

  if (process.platform === 'win32') {
    const launcher = path.join(diretorio, 'claude.cmd')
    fs.writeFileSync(
      launcher,
      `@echo off\r\n${windowsQuote(process.execPath)} ${windowsQuote(script)} %*\r\n`,
      'utf8',
    )
    return launcher
  }

  const launcher = path.join(diretorio, 'claude')
  fs.writeFileSync(
    launcher,
    `#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(script)} "$@"\n`,
    'utf8',
  )
  fs.chmodSync(launcher, 0o755)
  return launcher
}

function lerEventos(caminho) {
  return fs
    .readFileSync(caminho, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((linha) => JSON.parse(linha))
}

function esperarSaida(saida) {
  let timer
  const limite = new Promise((_, rejeitar) => {
    timer = setTimeout(() => {
      rejeitar(
        new Error(
          `[Claude /status PTY] fixture não encerrou em ${TEMPO_LIMITE_MS} ms ` +
            `no runner ${process.platform}`,
        ),
      )
    }, TEMPO_LIMITE_MS)
  })

  return Promise.race([saida, limite]).finally(() => clearTimeout(timer))
}

function esperarEncerramento(opcao) {
  let timer
  return new Promise((resolver) => {
    timer = setTimeout(resolver, 250)
    opcao?.then?.(() => {
      clearTimeout(timer)
      resolver()
    })
  })
}

test('consulta o /status do Claude por PTY nativa e navega até Usage', async () => {
  conferirRunnerNativo()
  const diretorio = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-claude-native-'))
  const configDir = path.join(diretorio, 'claude-profile')
  const logPath = path.join(diretorio, 'fixture-events.jsonl')
  fs.mkdirSync(configDir)
  criarFixtureClaude(diretorio)

  const pathKey = platform.getPathEnvKey(process.env)
  const currentPath = process.env[pathKey] || process.env.PATH || ''
  const env = {
    FELIXO_CLI_PATHS: diretorio,
    [pathKey]: [diretorio, currentPath].filter(Boolean).join(path.delimiter),
    CLAUDE_CONFIG_DIR: configDir,
    FELIXO_NATIVE_CLAUDE_LOG: logPath,
  }

  const nodePty = require('node-pty')
  let ptyProcess
  let launch
  let nativeExit
  const exitPromise = new Promise((resolver) => {
    nativeExit = resolver
  })

  const originalSpawn = nodePty.spawn
  nodePty.spawn = (file, args, options) => {
    launch = { file, args, options }
    ptyProcess = originalSpawn(file, args, options)
    ptyProcess.onExit(nativeExit)
    return ptyProcess
  }

  const query = createClaudeUsageQuery({
    now: () => NOW,
    platform,
  })

  try {
    const result = await query({
      env,
      cwd: diretorio,
      timeoutMs: 10_000,
      startupFallbackMs: 250,
      navigationDelayMs: 20,
      resultSettleMs: 80,
    })

    assert.equal(
      result.ok,
      true,
      `[Claude /status PTY] fixture falhou no ${process.platform}: ${result.message}; ` +
        `launch: ${JSON.stringify(launch ? { file: launch.file, args: launch.args } : null)}`,
    )
    assert.deepEqual(
      result.metrics.map(({ key, used }) => ({ key, used })),
      [
        { key: 'rate_limits.five_hour', used: 12 },
        { key: 'rate_limits.seven_day', used: 100 },
      ],
    )
    assert.equal(result.details.status.email, 'pessoa@example.com')
    assert.equal(result.details.status.model, 'sonnet (claude-sonnet-5)')
    assert.equal(result.details.usage.sessionStats.totalCost, '$0.0000')
    assert.equal(result.details.usage.currentWeek.used, 100)

    const eventos = lerEventos(logPath)
    const startup = eventos.find(({ type }) => type === 'startup')
    const entradas = eventos
      .filter(({ type }) => type === 'input')
      .map(({ value }) => value)
      .join('')
    assert.deepEqual(startup?.env, {
      claudeConfigDir: configDir,
      skipPromptHistory: '1',
    })
    assert.ok(entradas.includes('/status\r') || entradas.includes('/status\n'))
    assert.ok(
      (entradas.match(/\u001b\[C/g) || []).length >= 2,
      `a navegação para Usage não atravessou a PTY; entradas=${JSON.stringify(entradas)}`,
    )

    assert.equal(launch.options.cwd, diretorio)
    assert.equal(launch.options.env.CLAUDE_CONFIG_DIR, configDir)
    if (process.platform === 'win32') {
      assert.equal(launch.file.toLowerCase(), 'cmd.exe')
      assert.ok(launch.args.includes('/c'))
      assert.ok(launch.args.includes('claude'))
    } else if (process.platform === 'darwin') {
      assert.equal(launch.file, platform.getDefaultShell(launch.options.env))
      assert.match(launch.args.at(-1), /exec .*claude/)
    } else {
      assert.equal(launch.file, 'claude')
    }

    // O parser usado pelo resultado também precisa continuar seguro quando
    // receber a mesma saída em uma chamada independente.
    assert.equal(parseClaudeUsageOutput(STATUS_OUTPUT, { now: () => NOW }).metrics.length, 2)
  } finally {
    try {
      ptyProcess?.kill?.()
    } catch {
      // O processo pode já ter sido encerrado pelo timeout/resultado.
    }
    await esperarEncerramento(exitPromise)
    nodePty.spawn = originalSpawn
    fs.rmSync(diretorio, { recursive: true, force: true })
  }
})

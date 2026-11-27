'use strict'
require('../../scripts/test-support/pasta-do-teste.cjs') // isola o temporário deste arquivo (ver pasta-do-teste.cjs)

/**
 * Exercita a consulta de uso do Claude com processo de verdade, sem rede. A
 * fixture com o nome `claude` imita o que a CLI real faz (medido na 2.1.332):
 * em modo interativo, numa pasta ainda não confiada, pergunta se confia e sai
 * quando recebe Enter; com `-p /usage` responde direto, sem perguntar.
 *
 * A resolução do comando é a de produção (no Windows, o `.cmd` achado pelo PATH),
 * para uma suíte verde não esconder diferença de launch entre os sistemas.
 */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test } = require('node:test')

const { createClaudeUsageQuery } = require('./claude-usage-query.cjs')

const NOW = Date.parse('2026-08-30T19:00:00.000Z')

const USAGE_TEXT = [
  'You are currently using your subscription to power your Claude Code usage',
  '',
  'Current session: 12% used · resets 6:50pm (America/Sao_Paulo)',
  'Current week (all models): 100% used · resets Sep 2, 2am (America/Sao_Paulo)',
].join('\n')

function criarFixtureClaude(diretorio) {
  const script = path.join(diretorio, 'claude-native-fixture.cjs')
  fs.writeFileSync(script, [
    "'use strict'",
    "const fs = require('node:fs')",
    'const args = process.argv.slice(2)',
    'fs.writeFileSync(process.env.FELIXO_NATIVE_CLAUDE_LOG, JSON.stringify({',
    '  args, cwd: process.cwd(),',
    '  claudeConfigDir: process.env.CLAUDE_CONFIG_DIR,',
    '  skipPromptHistory: process.env.CLAUDE_CODE_SKIP_PROMPT_HISTORY,',
    '}))',
    "if (args.includes('-p')) {",
    // Com `"verbose": true` a saída é a lista de eventos numa linha só, e passa
    // fácil dos 12 mil caracteres que o executor guarda por padrão.
    "  const init = { type: 'system', slash_commands: Array(2000).fill('comando') }",
    `  console.log(JSON.stringify([init, { type: 'result', is_error: false, num_turns: 0, result: ${JSON.stringify(USAGE_TEXT)} }]))`,
    '} else {',
    "  process.stdout.write('Quick safety check: Is this a project you trust?\\n> No, exit\\n')",
    "  process.stdin.once('data', () => process.exit(1))",
    '}',
  ].join('\n'), 'utf8')

  if (process.platform === 'win32') {
    fs.writeFileSync(path.join(diretorio, 'claude.cmd'), `@echo off\r\n"${process.execPath}" "${script}" %*\r\n`, 'utf8')
    return
  }

  const launcher = path.join(diretorio, 'claude')
  fs.writeFileSync(launcher, `#!/bin/sh\nexec '${process.execPath}' '${script}' "$@"\n`, 'utf8')
  fs.chmodSync(launcher, 0o755)
}

test('consulta o uso do Claude numa pasta nunca confiada, com processo de verdade', async (t) => {
  const diretorio = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-claude-native-'))
  t.after(() => fs.rmSync(diretorio, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }))
  const configDir = path.join(diretorio, 'claude-profile')
  const logPath = path.join(diretorio, 'fixture.json')
  fs.mkdirSync(configDir)
  criarFixtureClaude(diretorio)

  // Pasta configurada vence o PATH, como no app. Sobrescrever só `Path` ou `PATH`
  // deixaria o `claude` real da máquina vencer pela outra grafia no Windows.
  const anterior = process.env.FELIXO_CLI_PATHS
  process.env.FELIXO_CLI_PATHS = diretorio
  t.after(() => {
    if (anterior === undefined) delete process.env.FELIXO_CLI_PATHS
    else process.env.FELIXO_CLI_PATHS = anterior
  })
  const env = { CLAUDE_CONFIG_DIR: configDir, FELIXO_NATIVE_CLAUDE_LOG: logPath }

  const result = await createClaudeUsageQuery({ now: () => NOW })({ env, cwd: diretorio, timeoutMs: 10_000 })

  assert.equal(result.ok, true, `fixture falhou no ${process.platform}: ${result.message}`)
  assert.deepEqual(
    result.metrics.map(({ key, used }) => ({ key, used })),
    [
      { key: 'rate_limits.five_hour', used: 12 },
      { key: 'rate_limits.seven_day', used: 100 },
    ],
  )

  const chamada = JSON.parse(fs.readFileSync(logPath, 'utf8'))
  // O argumento vazio de `--tools` precisa chegar vazio, inclusive pelo `.cmd`.
  assert.deepEqual(chamada.args.slice(0, 6), ['-p', '/usage', '--safe-mode', '--tools', '', '--setting-sources'])
  assert.equal(chamada.claudeConfigDir, configDir)
  assert.equal(chamada.skipPromptHistory, '1')
})

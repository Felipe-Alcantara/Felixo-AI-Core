'use strict'

/**
 * Grava o fluxo real de bytes do banner de limite de uma CLI de agente, para
 * as fixtures da vigia da cadeia de contas (`__fixtures__/limit-banners`).
 *
 * A CLI de verdade roda num PTY, com o xterm do app respondendo às perguntas
 * do terminal, mas fala com um servidor local que responde como o backend no
 * limite. Nenhuma conta é usada: chave ou token falsos e pastas de
 * configuração temporárias. Quem desenha o banner é a própria TUI, com as
 * quebras de linha, o desenho de caixa e a repintura do sistema em que roda
 * (o ConPTY no Windows).
 *
 * Uso:
 *   node scripts/record-limit-banner.cjs --provider codex|claude|gemini [--out <pasta>] [--cols 100] [--rows 40]
 *
 * Roda nos três sistemas pelo workflow "Gravar banner de limite"
 * (`.github/workflows/gravar-banner-limite.yml`). Sai com 1, sem gravar nada,
 * se o banner não aparecer no prazo: a tela final vai para o stderr.
 */

const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { anonymize, assertAnonymous, assertNoSecrets, createScreen, mergeChunks } = require('./record-terminal-fixture.cjs')
const { createNodePtySpawn } = require('../electron/services/node-pty-windows-kill.cjs')
const { ensureNodePtySpawnHelperExecutable } = require('../electron/services/pty-native-assets.cjs')

const APP_DIR = path.resolve(__dirname, '..')
const DEFAULT_OUT = path.join(APP_DIR, 'electron', '__fixtures__', 'limit-banners')
const PROMPT = 'diga oi'
const BANNER_TIMEOUT_MS = 120_000
/** Depois do banner, o tempo para a TUI terminar de repintar. */
const AFTER_BANNER_MS = 2_500
/** Fim do limite simulado: três horas depois de agora. */
const RESET_IN_SECONDS = 3 * 3600

/**
 * A resposta de cada backend no limite, no formato que a CLI interpreta como
 * limite de uso (e não como erro de rede). Rotas que não são a do modelo
 * recebem 404, e a CLI segue sem elas.
 */
const BACKENDS = {
  codex: {
    route: /^\/v1\/responses/,
    respond(res) {
      res.writeHead(429, { 'content-type': 'application/json' })
      res.end(JSON.stringify({
        error: {
          type: 'usage_limit_reached',
          message: 'The usage limit has been reached',
          plan_type: 'plus',
          resets_at: Math.floor(Date.now() / 1000) + RESET_IN_SECONDS,
          resets_in_seconds: RESET_IN_SECONDS,
        },
      }))
    },
  },
  claude: {
    route: /^\/v1\/messages/,
    respond(res) {
      // Os cabeçalhos do limite da assinatura (janela de 5 horas).
      const reset = String(Math.floor(Date.now() / 1000) + RESET_IN_SECONDS)
      res.writeHead(429, {
        'content-type': 'application/json',
        'anthropic-ratelimit-unified-status': 'rejected',
        'anthropic-ratelimit-unified-reset': reset,
        'anthropic-ratelimit-unified-representative-claim': 'five_hour',
        'anthropic-ratelimit-unified-5h-status': 'rejected',
        'anthropic-ratelimit-unified-5h-reset': reset,
      })
      res.end(JSON.stringify({ type: 'error', error: { type: 'rate_limit_error', message: 'Rate limited' } }))
    },
  },
  gemini: {
    route: /:(?:stream)?[gG]enerateContent/,
    respond(res) {
      res.writeHead(429, { 'content-type': 'application/json' })
      res.end(JSON.stringify({
        error: {
          code: 429,
          status: 'RESOURCE_EXHAUSTED',
          message: "Quota exceeded for quota metric 'Generate Content API requests per day' and limit 'Requests per day per model'.",
          details: [{
            '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
            violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel' }],
          }],
        },
      }))
    },
  },
}

/** O banner já está na tela? Por texto da tela, não pela taxonomia: a gravação existe para achar o que ela ainda não conhece. */
const BANNER_ON_SCREEN = {
  codex: /hit your usage limit/i,
  claude: /limit · resets|usage limit reached/i,
  gemini: /usage limit reached|exhausted|quota exceeded/i,
}

/** Como abrir cada CLI contra o servidor local, sem conta e sem tocar nas configurações da pessoa. */
function launchPlan(provider, { baseUrl, home, workdir }) {
  if (provider === 'codex') {
    return {
      command: 'codex',
      args: [
        '-c', 'check_for_update_on_startup=false',
        '-c', 'model_provider="felixo"',
        '-c', `model_providers.felixo={name="felixo",base_url="${baseUrl}/v1",wire_api="responses",env_key="FELIXO_FAKE_KEY",request_max_retries=0,stream_max_retries=0}`,
        '-c', 'model="gpt-5"',
        PROMPT,
      ],
      env: { CODEX_HOME: home, FELIXO_FAKE_KEY: 'chave-falsa-da-gravacao' },
    }
  }
  if (provider === 'claude') {
    // Onboarding feito e a pasta já confiada: a CLI vai direto ao pedido.
    const trusted = { hasTrustDialogAccepted: true }
    fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({
      hasCompletedOnboarding: true,
      theme: 'dark',
      projects: { [workdir]: trusted, [workdir.split(path.sep).join('/')]: trusted },
    }))
    return {
      command: 'claude',
      args: [PROMPT],
      // Token no formato da assinatura: é com ele que a CLI desenha o banner de limite de quem assina.
      env: {
        CLAUDE_CONFIG_DIR: home,
        ANTHROPIC_BASE_URL: baseUrl,
        CLAUDE_CODE_OAUTH_TOKEN: 'token-falso-da-gravacao',
        DISABLE_AUTOUPDATER: '1',
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      },
    }
  }
  fs.mkdirSync(path.join(home, '.gemini'), { recursive: true })
  fs.writeFileSync(path.join(home, '.gemini', 'settings.json'), JSON.stringify({
    security: { auth: { selectedType: 'gemini-api-key' } },
    general: { disableAutoUpdate: true },
  }))
  return {
    command: 'gemini',
    // A versão estável recusa pasta não confiada antes do pedido; a gravação usa uma pasta temporária.
    args: ['--skip-trust', '-i', PROMPT],
    env: { GEMINI_CLI_HOME: home, GEMINI_API_KEY: 'chave-falsa-da-gravacao', GOOGLE_GEMINI_BASE_URL: baseUrl },
  }
}

function parseArgs(argv) {
  const args = { out: DEFAULT_OUT, cols: 100, rows: 40 }
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (flag === '--provider') args.provider = value
    else if (flag === '--out') args.out = path.resolve(value)
    else if (flag === '--cols') args.cols = Number(value)
    else if (flag === '--rows') args.rows = Number(value)
    else throw new Error(`Argumento desconhecido: ${flag}`)
    index += 1
  }
  if (!BACKENDS[args.provider]) throw new Error('Use --provider codex, claude ou gemini.')
  return args
}

/** O ambiente da pessoa sem nada de conta das CLIs: a gravação nunca herda chave, token nem pasta de configuração. */
function cleanEnv(extra) {
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !/^(CLAUDE|ANTHROPIC|CODEX|OPENAI|GEMINI|GOOGLE)/i.test(key)),
  )
  return { ...inherited, ...extra, TERM: 'xterm-256color', TZ: 'UTC' }
}

/** No Windows as CLIs do npm são `.cmd`: o PTY abre pelo cmd. */
function spawnSpec(command, args) {
  return process.platform === 'win32'
    ? { file: 'cmd.exe', args: ['/d', '/s', '/c', command, ...args] }
    : { file: command, args }
}

function cliVersion(command) {
  try {
    const output = execFileSync(command, ['--version'], { encoding: 'utf8', shell: process.platform === 'win32', timeout: 30_000 })
    return output.trim().split('\n')[0].replace(/\s*\(.*\)$/, '').replace(/^\D+/, '')
  } catch {
    return null
  }
}

function startBackend(provider) {
  const backend = BACKENDS[provider]
  const server = http.createServer((req, res) => {
    req.resume()
    req.on('end', () => {
      if (req.method === 'POST' && backend.route.test(req.url)) {
        backend.respond(res)
        return
      }
      res.writeHead(404, { 'content-type': 'application/json' })
      res.end('{}')
    })
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

async function record(args) {
  // O mesmo `spawn` do app: no macOS o `spawn-helper` do npm vem sem permissão de execução
  // (`posix_spawnp failed`), e no Windows o `kill()` cru do node-pty imprime "AttachConsole failed".
  ensureNodePtySpawnHelperExecutable()
  const spawnPty = createNodePtySpawn(require('node-pty'))
  const server = await startBackend(args.provider)
  // Caminhos longos (`realpath.native`): no Windows a pasta temporária vem no formato curto (C:\Users\NOME~1),
  // e a anonimização só reconhece o caminho que a CLI imprime.
  const tmp = fs.realpathSync.native(os.tmpdir())
  const home = fs.mkdtempSync(path.join(tmp, 'felixo-limite-home-'))
  const workdir = fs.mkdtempSync(path.join(tmp, 'felixo-limite-pasta-'))
  const plan = launchPlan(args.provider, { baseUrl: `http://127.0.0.1:${server.address().port}`, home, workdir })
  const spec = spawnSpec(plan.command, plan.args)
  const screen = createScreen(args.cols, args.rows)
  const started = Date.now()
  const chunks = []
  let exited = false

  const child = spawnPty(spec.file, spec.args, {
    name: 'xterm-256color',
    cols: args.cols,
    rows: args.rows,
    cwd: workdir,
    env: cleanEnv(plan.env),
  })
  child.onData((data) => {
    chunks.push({ t: Date.now() - started, data })
    void screen.write(data)
  })
  child.onExit(() => {
    exited = true
  })
  // Respostas do terminal às perguntas da CLI (cor de fundo, cursor, teclado): sem elas a TUI espera para sempre.
  screen.terminal.onData((data) => {
    if (!exited) child.write(data)
  })

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const deadline = Date.now() + BANNER_TIMEOUT_MS
  while (!BANNER_ON_SCREEN[args.provider].test(screen.text()) && Date.now() < deadline && !exited) await sleep(200)
  const seen = BANNER_ON_SCREEN[args.provider].test(screen.text())
  if (seen) await sleep(AFTER_BANNER_MS)
  // Como o gravador da Leitura: espera a sessão sair antes de seguir, ou o PTY segura o processo.
  if (!exited) child.kill()
  for (let waited = 0; !exited && waited < 3000; waited += 250) await sleep(250)
  if (!exited) child.kill('SIGKILL')
  server.closeAllConnections?.()
  server.close()

  if (!seen) {
    process.stderr.write(`[banner] o banner de ${args.provider} não apareceu em ${BANNER_TIMEOUT_MS / 1000} s; nada gravado. Tela final:\n`)
    process.stderr.write(`${anonymize(screen.text(), workdir)}\n`)
    return 1
  }

  const anonymized = mergeChunks(chunks).map((chunk) => ({ t: chunk.t, data: anonymize(chunk.data, workdir) }))
  assertNoSecrets(JSON.stringify(anonymized))
  const replay = createScreen(args.cols, args.rows)
  for (const chunk of anonymized) await replay.write(chunk.data)
  assertAnonymous(replay.text())
  const fixture = {
    provider: args.provider,
    version: cliVersion(plan.command),
    platform: process.platform,
    cols: args.cols,
    rows: args.rows,
    recordedAt: new Date().toISOString().slice(0, 10),
    simulated: 'servidor local respondendo como o backend no limite; nenhuma conta',
    anonymized: true,
    chunks: anonymized,
  }
  fs.mkdirSync(args.out, { recursive: true })
  const out = path.join(args.out, `${args.provider}-${process.platform}.json`)
  fs.writeFileSync(out, `${JSON.stringify(fixture, null, 1)}\n`)
  process.stderr.write(`[banner] ${fixture.chunks.length} pedaços de ${args.provider} ${fixture.version} em ${out}\n`)
  return 0
}

if (require.main === module) {
  record(parseArgs(process.argv.slice(2)))
    .then((code) => process.exit(code))
    .catch((error) => {
      process.stderr.write(`${error.stack || error.message}\n`)
      process.exit(1)
    })
}

module.exports = { BACKENDS, BANNER_ON_SCREEN, cleanEnv, launchPlan, parseArgs }

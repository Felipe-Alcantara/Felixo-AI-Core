'use strict'

/**
 * Grava a saída real de uma CLI de agente num PTY e salva como fixture dos
 * testes da Leitura (o Markdown do terminal).
 *
 * Os testes nunca rodam CLI de verdade: eles reproduzem estes pedaços de
 * saída, com os tempos gravados, num xterm. Este script é a única coisa que
 * fala com a CLI real, e só quando alguém o roda à mão, com a própria conta.
 *
 * Uso:
 *   node scripts/record-terminal-fixture.cjs --provider claude --scenario resposta
 *   node scripts/record-terminal-fixture.cjs --provider codex --explore
 *   node scripts/record-terminal-fixture.cjs --provider claude --scenario telacheia
 *
 * - `--explore` só abre a CLI, espera a tela parar e imprime o que ela mostra.
 *   Serve para ver diálogos novos (confiança na pasta, login) antes de
 *   ensinar o roteiro a respondê-los.
 * - Cada provedor roda numa pasta fixa de gravação
 *   (`~/.cache/felixo-ai-core/fixture-recordings/<provedor>`): a CLI pede
 *   confiança na pasta uma vez só, e a retomada encontra a conversa gravada
 *   antes, que fica na mesma pasta. Nenhum repositório de verdade é usado.
 * - O Gemini roda com uma pasta pessoal própria (`GEMINI_CLI_HOME`) cujo
 *   `settings.json` desliga a atualização automática, sem tocar no
 *   `~/.gemini/settings.json` da pessoa.
 * - A fixture sai anonimizada (pasta pessoal, usuário, máquina, e-mails e
 *   IDs trocados por marcadores) e o script se recusa a gravar se ainda achar
 *   algo com cara de chave ou token.
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const APP_DIR = path.resolve(__dirname, '..')
const FIXTURES_DIR = path.join(APP_DIR, 'src', 'features', 'canvas', 'terminal', '__fixtures__', 'terminal-output')
const RECORDINGS_ROOT = path.join(os.homedir(), '.cache', 'felixo-ai-core', 'fixture-recordings')
const DEFAULT_COLS = 100
/** Alto o bastante para a resposta inteira caber na tela das CLIs que usam a tela alternativa (sem rolagem). */
const DEFAULT_ROWS = 50
/** Pedaços que chegam a menos disto um do outro viram um só na fixture. */
const MERGE_WINDOW_MS = 40

/**
 * O pedido que faz o agente responder com todos os blocos que a Leitura
 * precisa reconhecer. Texto puro: o agente não precisa de ferramenta nenhuma.
 */
const MARKDOWN_PROMPT = [
  'Responda só com texto, sem usar ferramentas e sem ler nem criar arquivos.',
  'Use exatamente estes blocos em Markdown, nesta ordem:',
  'um título de nível 2 "Resumo"; um parágrafo curto com uma palavra em negrito e outra em itálico;',
  'uma lista com três itens; uma lista numerada com dois itens; um bloco de código python com uma função soma;',
  'uma tabela com as colunas Nome e Valor e duas linhas; uma citação curta; e um link para https://example.com/docs.',
].join(' ')

/** Pedido longo, para dar tempo de cancelar no meio. */
const LONG_PROMPT =
  'Responda só com texto, sem ferramentas: escreva uma lista numerada com 40 curiosidades curtas sobre terminais de computador, uma por linha.'

function parseArgs(argv) {
  const args = { cols: DEFAULT_COLS, rows: DEFAULT_ROWS }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--explore') args.explore = true
    else if (arg === '--provider') args.provider = argv[++index]
    else if (arg === '--scenario') args.scenario = argv[++index]
    else if (arg === '--cols') args.cols = Number(argv[++index])
    else if (arg === '--rows') args.rows = Number(argv[++index])
    else throw new Error(`Argumento desconhecido: ${arg}`)
  }
  if (!args.provider) throw new Error('Informe --provider (claude, codex, gemini ou openia).')
  return args
}

/** Ambiente da CLI: o da pessoa (contas incluídas), sem as variáveis desta sessão de agente. */
function createEnv(provider, workdir) {
  const env = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_PID|CLAUDE_EFFORT|FELIXO_)/.test(key)) continue
    env[key] = value
  }
  env.TERM = 'xterm-256color'
  env.COLORTERM = 'truecolor'
  if (provider === 'gemini') {
    env.GEMINI_CLI_HOME = prepareGeminiHome(workdir)
    env.GEMINI_CLI_TRUST_WORKSPACE = 'true'
  }
  return env
}

/**
 * O Gemini se atualiza sozinho ao abrir, e o arquivo de configuração do
 * sistema só vale numa pasta do root. Então a gravação dá a ele uma pasta
 * pessoal própria (`GEMINI_CLI_HOME`) que aponta para os arquivos do
 * `~/.gemini` de verdade (conta e histórico), menos o `settings.json`: esse é
 * uma cópia com a atualização automática desligada.
 */
function prepareGeminiHome(workdir) {
  const realDir = path.join(os.homedir(), '.gemini')
  const home = path.join(workdir, '..', 'gemini-home')
  const geminiDir = path.join(home, '.gemini')
  fs.mkdirSync(geminiDir, { recursive: true })
  for (const entry of fs.existsSync(realDir) ? fs.readdirSync(realDir) : []) {
    if (entry === 'settings.json') continue
    const link = path.join(geminiDir, entry)
    if (!fs.existsSync(link)) fs.symlinkSync(path.join(realDir, entry), link)
  }
  const realSettings = path.join(realDir, 'settings.json')
  const settings = fs.existsSync(realSettings) ? JSON.parse(fs.readFileSync(realSettings, 'utf8')) : {}
  settings.general = { ...settings.general, enableAutoUpdate: false, enableAutoUpdateNotification: false }
  fs.writeFileSync(path.join(geminiDir, 'settings.json'), JSON.stringify(settings, null, 2))
  return home
}

function cliVersion(command) {
  try {
    const output = execFileSync(command, ['--version'], { encoding: 'utf8', timeout: 30_000 })
    return (output.match(/\d+\.\d+(?:\.\d+)?(?:-[\w.]+)?/) ?? [''])[0]
  } catch {
    return 'desconhecida'
  }
}

/** Uma tela virtual com o xterm do próprio app, para o roteiro saber o que está desenhado. */
function createScreen(cols, rows) {
  // O xterm consulta `window` e `navigator`; o Node 21+ já tem um `navigator` só de leitura.
  if (!globalThis.navigator) globalThis.navigator = { platform: process.platform, userAgent: 'node' }
  if (!globalThis.window) globalThis.window = { navigator: globalThis.navigator }
  const { Terminal } = require('@xterm/xterm')
  const terminal = new Terminal({ cols, rows, allowProposedApi: true, scrollback: 5000 })
  return {
    terminal,
    write: (data) => new Promise((resolve) => terminal.write(data, resolve)),
    text: () => {
      const buffer = terminal.buffer.active
      const lines = []
      for (let row = 0; row < buffer.length; row += 1) {
        lines.push(buffer.getLine(row)?.translateToString(true).trimEnd() ?? '')
      }
      return lines.join('\n')
    },
    viewport: () => {
      const buffer = terminal.buffer.active
      const lines = []
      for (let row = buffer.viewportY; row < buffer.viewportY + rows; row += 1) {
        lines.push(buffer.getLine(row)?.translateToString(true).trimEnd() ?? '')
      }
      return lines.join('\n')
    },
  }
}

const COMMANDS = { claude: 'claude', codex: 'codex', gemini: 'gemini', openia: 'openia' }
/**
 * O Codex pergunta se quer se atualizar ao abrir (e Enter atualiza); a gravação
 * desliga a pergunta. O Claude grava sem as configurações do usuário: ao abrir,
 * ele imprime avisos sobre as regras de permissão delas (dado da pessoa).
 */
const BASE_ARGS = {
  codex: ['-c', 'check_for_update_on_startup=false'],
  claude: ['--setting-sources', 'project,local'],
}

/**
 * Diálogos que a CLI pode abrir antes do primeiro pedido. A resposta padrão
 * (Enter) é sempre a que segue: confiar na pasta de gravação. A CLI grava
 * essa confiança nas configurações da pessoa uma vez, só para essa pasta.
 */
const TRUST_DIALOG = /Trust this folder\?|Do you trust the files in this folder\?/

/**
 * Roteiro por provedor e cenário: comando, argumentos e os passos. Cada passo
 * espera algo aparecer na tela (`untilScreen`), a tela parar (`idleMs`) ou um
 * tempo fixo (`waitMs`) e envia teclas (`send`) — só se a tela mostrar algo
 * (`ifScreen`), quando pedido.
 */
function scenarioFor(provider, scenario) {
  const command = COMMANDS[provider]
  if (!command) throw new Error(`Provedor desconhecido: ${provider}`)
  const base = BASE_ARGS[provider] ?? []
  const exitKeys = provider === 'claude' ? ['/exit', '\r'] : ['\u0003', '\u0003']
  // A gravação para antes de sair: na saída, as CLIs imprimem avisos sobre as
  // configurações da pessoa (regras de permissão, por exemplo).
  const exit = exitKeys.map((keys, index) => ({ label: 'sai', send: keys, waitMs: 1500, stopRecording: index === 0 }))
  const ready = [
    { label: 'espera a CLI abrir', idleMs: 4000, maxMs: 90_000 },
    { label: 'confia na pasta de gravação, se perguntar', ifScreen: TRUST_DIALOG, send: '\r', waitMs: 500 },
    { label: 'espera a CLI ficar pronta', idleMs: 4000, maxMs: 90_000 },
  ]
  const ask = (prompt) => [
    ...ready,
    { label: 'digita o pedido', send: prompt },
    { label: 'pausa antes do Enter', waitMs: 800 },
    { label: 'envia', send: '\r' },
  ]
  const finish = [{ label: 'espera a resposta terminar', idleMs: 9000, maxMs: 300_000 }, ...exit]

  if (provider === 'openia') {
    const argsByScenario = { lista: ['list'], ajuda: ['--help'], erro: ['run', 'interface-que-nao-existe'] }
    const args = argsByScenario[scenario]
    if (!args) throw new Error(`Cenários do Openia: ${Object.keys(argsByScenario).join(', ')}`)
    return { command, args, steps: [{ label: 'espera sair', idleMs: 3000, maxMs: 60_000 }] }
  }
  if (provider === 'gemini' && scenario === 'erro') {
    // A conta pessoal do Google não entra mais no Gemini CLI: o erro é a própria tela de login.
    return { command, args: base, steps: [{ label: 'espera a tela de login', idleMs: 5000, maxMs: 90_000 }, ...exit] }
  }

  switch (scenario) {
    case 'resposta':
      return { command, args: base, steps: [...ask(MARKDOWN_PROMPT), ...finish] }
    case 'telacheia':
      // Sem as configurações do usuário, o Claude desenha na tela clássica (com
      // histórico). Esta é a resposta na tela cheia (`tui: fullscreen`, sem
      // histórico), o modo que muita gente liga nas configurações.
      if (provider !== 'claude') throw new Error('O cenário "telacheia" é só do Claude.')
      return { command, args: [...base, '--settings', '{"tui":"fullscreen"}'], steps: [...ask(MARKDOWN_PROMPT), ...finish] }
    case 'cancelamento':
      return {
        command,
        args: base,
        steps: [
          ...ask(LONG_PROMPT),
          // Cancela com a resposta já na tela: o quinto item da lista desenhado.
          { label: 'deixa a resposta começar', untilScreen: /^\s*(?:[•●]\s*)?5\.\s/m, maxMs: 180_000 },
          { label: 'cancela (Esc)', send: '\u001b' },
          ...finish,
        ],
      }
    case 'erro': {
      const modelFlag = provider === 'codex' ? ['-m', 'modelo-que-nao-existe'] : ['--model', 'modelo-que-nao-existe']
      return { command, args: [...base, ...modelFlag], steps: [...ask('Diga oi.'), ...finish] }
    }
    case 'retomada': {
      // Retoma a última conversa da pasta de gravação (a do cenário "resposta").
      const resume = provider === 'codex' ? ['resume', '--last'] : ['--continue']
      return {
        command,
        args: [...base, ...resume],
        steps: [{ label: 'espera a conversa ser redesenhada', idleMs: 6000, maxMs: 90_000 }, ...exit],
      }
    }
    default:
      throw new Error('Cenários: resposta, telacheia (só Claude), cancelamento, erro, retomada.')
  }
}

/** Troca dados da pessoa e da máquina por marcadores; IDs mantêm o comprimento. */
function anonymize(text, workdir) {
  const home = os.homedir()
  const user = os.userInfo().username
  const host = os.hostname()
  let result = text
  for (const [from, to] of [
    [workdir, '/tmp/felixo-fixture'],
    [workdir.replace(home, '~'), '/tmp/felixo-fixture'],
    [home, '/home/pessoa'],
  ]) {
    result = result.split(from).join(to)
  }
  result = result
    // O Claude separa as palavras com espaço ou com um salto de cursor (`CSI 48 G`).
    .replace(/(Claude(?:\s|\u001b\[[0-9;?]*[A-Za-z])+)(Pro|Max|Team|Enterprise)\b/g, '$1Plano')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '00000000-0000-4000-8000-000000000000')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, 'pessoa@example.com')
  if (user && user.length > 2) result = result.replace(new RegExp(`\\b${escapeRegExp(user)}\\b`, 'gi'), 'pessoa')
  if (host && host.length > 2) result = result.replace(new RegExp(`\\b${escapeRegExp(host)}\\b`, 'gi'), 'maquina')
  return result
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Padrões de segredo que nunca podem entrar numa fixture versionada. */
const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{16,}/,
  /sk-or-v1-[A-Za-z0-9]{16,}/,
  /AIza[0-9A-Za-z_-]{20,}/,
  /gh[pousr]_[A-Za-z0-9]{20,}/,
  /eyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/,
  /xox[abpr]-[A-Za-z0-9-]{10,}/,
]

function assertNoSecrets(text) {
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(text)) throw new Error(`A gravação tem algo com cara de segredo (${pattern}); nada foi salvo.`)
  }
}

/** Dados da conta e das configurações da pessoa que uma CLI pode mostrar na tela. */
const ACCOUNT_DATA_PATTERNS = [
  /Claude (?:Pro|Max|Team|Enterprise)\b/,
  /Permission (?:allow|deny|ask) rule/i,
  /settings\.json/,
]

/**
 * Confere o texto já desenhado (sem os códigos de cor e de cursor, que podem
 * partir um nome no meio do texto bruto): nada da pessoa, da máquina ou da
 * conta pode sobrar.
 */
function assertAnonymous(renderedText) {
  const user = os.userInfo().username
  const leftovers = [os.homedir(), user, os.hostname()].filter((value) => value && value.length > 2 && renderedText.includes(value))
  if (leftovers.length > 0) throw new Error('A tela gravada ainda mostra a pasta pessoal, o usuário ou a máquina; nada foi salvo.')
  const account = ACCOUNT_DATA_PATTERNS.find((pattern) => pattern.test(renderedText))
  if (account) throw new Error(`A tela gravada mostra dado da conta ou das configurações (${account}); nada foi salvo.`)
  assertNoSecrets(renderedText)
}

function mergeChunks(chunks) {
  const merged = []
  for (const chunk of chunks) {
    const last = merged.at(-1)
    if (last && chunk.t - last.t < MERGE_WINDOW_MS) last.data += chunk.data
    else merged.push({ ...chunk })
  }
  return merged
}

async function run() {
  const args = parseArgs(process.argv.slice(2))
  const pty = require('node-pty')
  const workdir = path.join(RECORDINGS_ROOT, args.provider)
  fs.mkdirSync(workdir, { recursive: true })
  const plan = args.explore
    ? { command: COMMANDS[args.provider], args: BASE_ARGS[args.provider] ?? [], steps: [{ label: 'explora', idleMs: 5000, maxMs: 60_000 }] }
    : scenarioFor(args.provider, args.scenario)
  const screen = createScreen(args.cols, args.rows)
  const started = Date.now()
  const chunks = []
  const marks = []
  let recording = true
  let lastOutputAt = Date.now()
  let lastScreen = ''
  let exited = null

  const child = pty.spawn(plan.command, plan.args, {
    name: 'xterm-256color',
    cols: args.cols,
    rows: args.rows,
    cwd: workdir,
    env: createEnv(args.provider, workdir),
  })
  child.onData((data) => {
    if (recording) chunks.push({ t: Date.now() - started, data })
    lastOutputAt = Date.now()
    void screen.write(data)
  })
  child.onExit((event) => {
    exited = event
  })
  // Respostas do terminal às perguntas da CLI (cor de fundo, recursos do
  // teclado...): o Gemini espera por elas antes de desenhar a primeira tela.
  screen.terminal.onData((data) => {
    if (!exited) child.write(data)
  })

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  /** A tela parou: nada novo por `idleMs`, ignorando spinners e contadores de tempo. */
  const settledFor = (idleMs) => {
    const current = screen.viewport().replace(/[⠀-⣿✻✶✳✢·•∙*]|\(?\d+(?:\.\d+)?s\)?/g, '')
    if (current !== lastScreen) {
      lastScreen = current
      lastOutputAt = Date.now()
    }
    // Tela em branco não conta como parada: a CLI ainda nem desenhou (o Gemini leva segundos).
    return current.trim() !== '' && Date.now() - lastOutputAt >= idleMs
  }

  for (const step of plan.steps) {
    process.stderr.write(`[gravar] ${step.label}\n`)
    if (step.stopRecording) recording = false
    if (recording) marks.push({ t: Date.now() - started, label: step.label })
    if (step.untilScreen) {
      const deadline = Date.now() + (step.maxMs ?? 60_000)
      while (!step.untilScreen.test(screen.viewport()) && Date.now() < deadline && !exited) await sleep(100)
      if (Date.now() >= deadline) process.stderr.write('[gravar] prazo do passo esgotado; seguindo\n')
    }
    if (step.idleMs) {
      const deadline = Date.now() + (step.maxMs ?? 60_000)
      while (!settledFor(step.idleMs) && Date.now() < deadline && !exited) await sleep(250)
      if (Date.now() >= deadline) process.stderr.write('[gravar] prazo do passo esgotado; seguindo\n')
    }
    const wanted = step.ifScreen ? step.ifScreen.test(screen.viewport()) : true
    if (step.send !== undefined && wanted && !exited) child.write(step.send)
    if (step.waitMs) await sleep(step.waitMs)
  }
  await sleep(1500)
  if (!exited) child.kill()
  for (let waited = 0; !exited && waited < 3000; waited += 250) await sleep(250)
  if (!exited) child.kill('SIGKILL')

  if (args.explore) {
    process.stdout.write(`${anonymize(screen.viewport(), workdir)}\n`)
    process.exit(0)
  }

  // Pedaço a pedaço, sobre o texto cru (os códigos de escape ainda são bytes, não `\u001b` do JSON).
  const anonymized = mergeChunks(chunks).map((chunk) => ({ t: chunk.t, data: anonymize(chunk.data, workdir) }))
  const recorded = JSON.stringify(anonymized)
  assertNoSecrets(recorded)
  const replay = createScreen(args.cols, args.rows)
  for (const chunk of anonymized) await replay.write(chunk.data)
  assertAnonymous(replay.text())
  const fixture = {
    provider: args.provider,
    version: cliVersion(plan.command),
    scenario: args.scenario,
    cols: args.cols,
    rows: args.rows,
    platform: process.platform,
    recordedAt: new Date().toISOString().slice(0, 10),
    anonymized: true,
    marks,
    chunks: anonymized,
  }
  fs.mkdirSync(FIXTURES_DIR, { recursive: true })
  const out = path.join(FIXTURES_DIR, `${args.provider}-${args.scenario}.json`)
  fs.writeFileSync(out, `${JSON.stringify(fixture, null, 1)}\n`)
  process.stderr.write(`[gravar] ${fixture.chunks.length} pedaços em ${path.relative(APP_DIR, out)}\n`)
  process.exit(0)
}

if (require.main === module) {
  run().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`)
    process.exitCode = 1
  })
}

module.exports = { anonymize, assertAnonymous, assertNoSecrets, mergeChunks, parseArgs, scenarioFor, SECRET_PATTERNS }

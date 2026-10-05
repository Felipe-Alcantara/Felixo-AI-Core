'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { Terminal } = require('@xterm/headless')
const platform = require('../core/platform/index.cjs')
const { createCliEnv } = require('./cli-process-manager.cjs')
const { buildAccountProcessEnv } = require('./cli-account-profiles.cjs')
const { redactSecrets } = require('./official-cli-account-status.cjs')
const {
  createPtyLaunchSpec,
  resolvePtyCommand,
  resolveWindowsCodexPath,
} = require('./pty-process-manager.cjs')
const { ensureNodePtySpawnHelperExecutable } = require('./pty-native-assets.cjs')

/**
 * Lê a tela do `/status` do Codex numa sessão interativa descartável.
 *
 * O app-server já entrega os números (codex-account-rate-limits.cjs); esta
 * leitura existe para mostrar o texto exato que a CLI publica — a linha do
 * modelo com esforço e resumos, o provedor, o rótulo de cada limite e o link
 * da página de uso.
 *
 * Cuidados medidos ao vivo no Codex 0.156.1 (02/10/2026):
 * - Toda pasta nova abre a pergunta "Trust this folder?", e responder grava a
 *   resposta no `config.toml` da pessoa. A sessão nasce numa pasta temporária
 *   própria, marcada como confiável só para esta execução (`-c projects=...`),
 *   então a pergunta não aparece e nada é gravado. Se uma pergunta aparecer
 *   mesmo assim, a leitura sai com Esc — nunca com Enter.
 * - Nada é digitado sem o campo de mensagem vazio na tela: digitar dentro de
 *   um diálogo desconhecido poderia escolher uma opção.
 * - Enquanto os servidores MCP da pessoa sobem ("Starting MCP servers"), a CLI
 *   ignora o Enter de um comando e o texto fica no campo. Se alguém digitar
 *   `/status` de novo, o campo vira "/status/status" e o Enter seguinte manda
 *   isso como mensagem — uma conversa de verdade, com cota gasta (aconteceu
 *   numa gravação de fixture em 02/10/2026). Por isso a leitura espera os
 *   servidores subirem, só repete o Enter se o `/status` ainda estiver no
 *   campo e só digita de novo com o campo vazio.
 * - O primeiro `/status` de uma sessão nova costuma responder "refresh
 *   requested; run /status again shortly" no lugar dos limites. A leitura
 *   repete o comando até eles aparecerem ou o tempo acabar.
 * - Sem nenhuma mensagem enviada, a CLI não cria conversa, não toca o
 *   histórico nem o `config.toml` (conferido por hash antes/depois).
 * - O que está visível agora vem de um terminal virtual (`@xterm/headless`),
 *   porque a CLI redesenha a tela com cursor e regiões de rolagem. Os quadros
 *   do `/status` saem do fluxo de texto, que guarda a ordem em que foram
 *   impressos.
 * - `--no-daemon` impede a sessão de usar um servidor compartilhado de outra
 *   conta; `--no-alt-screen` mantém a tela em modo inline, em que o quadro do
 *   `/status` sai como linhas de texto mesmo se a pessoa preferir a tela
 *   alternativa no próprio config.
 */

const DEFAULT_TIMEOUT_MS = 25_000
const DEFAULT_READY_QUIET_MS = 700
// Enter colado no texto digitado parece colagem para a CLI (vira quebra de
// linha em vez de comando); a pausa curta separa os dois.
const DEFAULT_MIN_ENTER_DELAY_MS = 200
const DEFAULT_POPUP_FALLBACK_MS = 1_500
const DEFAULT_ENTER_RETRY_MS = 3_000
const DEFAULT_REFRESH_RETRY_MS = 1_500
const DEFAULT_MAX_STATUS_ATTEMPTS = 4
const MAX_ENTERS_PER_ATTEMPT = 3
const BOX_SETTLE_MS = 300
const CLEANUP_FALLBACK_MS = 3_000
const POLL_INTERVAL_MS = 100
const DEFAULT_COLS = 160
const DEFAULT_ROWS = 60
const MAX_OUTPUT_CHARS = 400_000
const SCREEN_SCROLLBACK = 500
const TEMP_DIR_PREFIX = 'felixo-codex-status-'
const CURSOR_POSITION_REQUEST = '\u001b[6n'
const CURSOR_POSITION_REPLY = '\u001b[1;1R'
const ESCAPE = '\u001b'
// Campo de mensagem vazio: o marcador "›" com o texto de exemplo (ou nada).
const EMPTY_COMPOSER_PATTERN = /^\s*›\s*(?:Ask Codex to do anything\s*)?$/
// O campo ainda com o comando digitado (o Enter não pegou).
const TYPED_STATUS_PATTERN = /^\s*›\s*\/status\s*$/
const MCP_STARTING_PATTERN = /Starting MCP servers|Booting MCP/i
const STATUS_POPUP_PATTERN = /\/status\s+show current session/
const TRUST_DIALOG_PATTERN = /trust (?:this|the files in this) folder/i
const LIMITS_PENDING_PATTERN = /refresh requested|run \/status again/i

/**
 * Rótulos do `/status` que descrevem a conversa aberta, não a conta. Saem da
 * leitura de propósito (decisão registrada no README, "Limites e uso por
 * conta"); qualquer rótulo novo e desconhecido continua aparecendo.
 */
const CODEX_SESSION_LABELS = Object.freeze([
  'Directory',
  'Permissions',
  'Agents.md',
  'Thread name',
  'Collaboration mode',
  'Session',
  'Context window',
  'Token usage',
])

const SESSION_LABEL_SET = new Set(CODEX_SESSION_LABELS.map((label) => label.toLowerCase()))

/**
 * @param {object} [dependencies]
 * @param {(file: string, args: string[], options: object) => object} [dependencies.spawnPty]
 * @param {() => number} [dependencies.now]
 * @param {typeof platform} [dependencies.platform]
 * @param {(command: string, env: Record<string, string>) => string | null} [dependencies.resolveCodexPath]
 * @param {{ mkdtempSync: Function, realpathSync: Function, rmSync: Function }} [dependencies.fileSystem]
 * @returns {(options?: object) => Promise<object>}
 */
function createCodexStatusScreenQuery({
  spawnPty,
  now = () => Date.now(),
  platform: platformAdapter = platform,
  resolveCodexPath = resolveWindowsCodexPath,
  fileSystem = fs,
} = {}) {
  return function readCodexStatusScreen({
    env: accountEnv = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
    readyQuietMs = DEFAULT_READY_QUIET_MS,
    minEnterDelayMs = DEFAULT_MIN_ENTER_DELAY_MS,
    popupFallbackMs = DEFAULT_POPUP_FALLBACK_MS,
    enterRetryMs = DEFAULT_ENTER_RETRY_MS,
    refreshRetryMs = DEFAULT_REFRESH_RETRY_MS,
    maxStatusAttempts = DEFAULT_MAX_STATUS_ATTEMPTS,
    // Cancelamento de fora (teto da rodada ou "Reconectar"): fecha o PTY.
    signal = null,
  } = {}) {
    return new Promise((resolve) => {
      if (signal?.aborted) {
        resolve(failure('A leitura da tela do /status foi cancelada.'))
        return
      }
      let workDir
      try {
        workDir = fileSystem.mkdtempSync(path.join(os.tmpdir(), TEMP_DIR_PREFIX))
      } catch {
        resolve(failure('Não foi possível criar a pasta temporária da leitura.'))
        return
      }

      const queryEnv = createCliEnv(
        buildAccountProcessEnv(process.env, { providerId: 'codex', profileEnv: accountEnv }),
      )
      const launchCommand = resolvePtyCommand('codex', true, queryEnv, platformAdapter, resolveCodexPath)
      const launch = createPtyLaunchSpec(
        launchCommand,
        buildCodexStatusArgs(trustedPaths(workDir, fileSystem)),
        queryEnv,
        platformAdapter,
      )
      // O rodapé da CLI mostra a pasta da sessão: o nome único da pasta
      // temporária confirma que o campo visível é o desta sessão, e não uma
      // lista de opções de um diálogo.
      const dirMarker = path.basename(workDir)
      const screen = createScreenModel(DEFAULT_COLS, DEFAULT_ROWS)

      let ptyProcess
      let output = ''
      let text = ''
      let dirty = false
      let settled = false
      let exited = false
      let lastOutputAt = now()
      // starting → typed → sent → (waiting-retry → typed → sent)…
      let stage = 'starting'
      let typedAt = 0
      let sentAt = 0
      let entersThisAttempt = 0
      let attempts = 0
      let boxesAtSend = 0
      let boxesSeen = 0
      let lastBoxAt = 0
      let retryAt = 0
      let pollTimer = null
      let timeoutTimer = null

      const removeWorkDir = () => {
        try {
          fileSystem.rmSync(workDir, { recursive: true, force: true })
        } catch {
          // Pasta vazia em tmp: o sistema limpa depois se o Windows ainda
          // segurar o handle do processo que acabou de sair.
        }
      }

      const finish = (result) => {
        if (settled) {
          return
        }
        settled = true
        clearInterval(pollTimer)
        clearTimeout(timeoutTimer)
        screen.dispose()
        if (exited) {
          removeWorkDir()
        } else {
          try {
            ptyProcess?.kill?.()
          } catch {
            // O resultado não depende da forma de encerramento do PTY.
          }
          // A pasta sai quando o PTY avisa que fechou (onExit); este prazo
          // cobre um PTY que nunca avise.
          setTimeout(removeWorkDir, CLEANUP_FALLBACK_MS).unref?.()
        }
        resolve(result)
      }

      const write = (data) => {
        if (settled || exited) {
          return
        }
        try {
          ptyProcess.write(data)
        } catch {
          finish(failure('A sessão descartável do Codex não aceitou a consulta.'))
        }
      }

      const typeStatus = () => {
        attempts += 1
        stage = 'typed'
        typedAt = now()
        write('/status')
      }

      const pressEnter = () => {
        stage = 'sent'
        sentAt = now()
        entersThisAttempt += 1
        write('\r')
      }

      const currentText = () => {
        if (dirty) {
          text = stripCodexTerminalOutput(output)
          dirty = false
        }
        return text
      }

      const latestBox = () => {
        const boxes = findStatusBoxes(currentText())
        return { count: boxes.length, latest: boxes.length ? parseStatusBox(boxes[boxes.length - 1]) : null }
      }

      const finishWithScreen = (parsed) => {
        const selected = selectAccountStatusLines(parsed)
        finish({
          ok: true,
          readAt: new Date(now()).toISOString(),
          version: parsed.version,
          usagePage: parsed.usagePage,
          limitsPending: parsed.limitsPending,
          lines: selected.lines,
          omittedLabels: selected.omittedLabels,
          message: null,
        })
      }

      const poll = () => {
        if (settled) {
          return
        }

        const visible = screen.viewport()
        if (visible.some((line) => TRUST_DIALOG_PATTERN.test(line))) {
          // Esc sai do diálogo sem responder; Enter gravaria a confiança no
          // config.toml da pessoa.
          write(ESCAPE)
          finish(failure('O Codex pediu confiança na pasta temporária; a leitura saiu sem responder.'))
          return
        }

        const quiet = now() - lastOutputAt >= readyQuietMs
        // Campo vazio, rodapé desta sessão, nenhum servidor MCP subindo e a
        // tela parada: só assim um comando digitado é executado.
        const canType = () =>
          quiet &&
          visible.some((line) => EMPTY_COMPOSER_PATTERN.test(line)) &&
          visible.some((line) => line.includes(dirMarker)) &&
          !visible.some((line) => MCP_STARTING_PATTERN.test(line))

        if (stage === 'starting') {
          if (canType()) {
            typeStatus()
          }
          return
        }

        if (stage === 'waiting-retry') {
          if (now() >= retryAt && canType()) {
            typeStatus()
          }
          return
        }

        if (stage === 'typed') {
          const elapsed = now() - typedAt
          const popupVisible = visible.some((line) => STATUS_POPUP_PATTERN.test(line))
          if (elapsed >= minEnterDelayMs && (popupVisible || elapsed >= popupFallbackMs)) {
            entersThisAttempt = 0
            boxesAtSend = latestBox().count
            pressEnter()
          }
          return
        }

        // stage === 'sent'
        const { count, latest } = latestBox()
        if (count > boxesSeen) {
          boxesSeen = count
          lastBoxAt = now()
        }

        if (count <= boxesAtSend) {
          // O Enter caiu antes de a CLI aceitar comandos: o `/status` continua
          // no campo e um novo Enter o executa. Com qualquer outra coisa no
          // campo, nada é enviado — um Enter ali poderia virar mensagem.
          const statusStillTyped = visible.some((line) => TYPED_STATUS_PATTERN.test(line))
          if (
            statusStillTyped &&
            now() - sentAt >= enterRetryMs &&
            entersThisAttempt < MAX_ENTERS_PER_ATTEMPT &&
            !visible.some((line) => MCP_STARTING_PATTERN.test(line))
          ) {
            pressEnter()
          }
          return
        }

        if (!latest || now() - lastBoxAt < BOX_SETTLE_MS) {
          return
        }

        if (!latest.limitsPending || attempts >= maxStatusAttempts) {
          finishWithScreen(latest)
          return
        }

        // Os limites ainda não tinham chegado: repetir o /status depois de
        // uma pausa, como a própria CLI pede.
        stage = 'waiting-retry'
        retryAt = now() + refreshRetryMs
      }

      try {
        const factory = spawnPty ?? loadNodePtySpawn(platformAdapter.name)
        ptyProcess = factory(launch.command, launch.args, {
          name: 'xterm-256color',
          cols: DEFAULT_COLS,
          rows: DEFAULT_ROWS,
          cwd: workDir,
          env: queryEnv,
        })
      } catch {
        removeWorkDir()
        finish(failure('Não foi possível abrir o Codex para ler o /status.'))
        return
      }

      ptyProcess.onData((data) => {
        if (settled) {
          return
        }
        const chunk = String(data)
        output = `${output}${chunk}`.slice(-MAX_OUTPUT_CHARS)
        dirty = true
        lastOutputAt = now()
        screen.write(chunk)
        // A CLI pergunta a posição do cursor ao abrir e espera a resposta de
        // um terminal de verdade.
        if (chunk.includes(CURSOR_POSITION_REQUEST)) {
          write(CURSOR_POSITION_REPLY)
        }
      })

      ptyProcess.onExit(() => {
        exited = true
        if (settled) {
          removeWorkDir()
          return
        }
        const { latest } = latestBox()
        if (latest) {
          finishWithScreen(latest)
          return
        }
        finish(failure('O Codex fechou antes de mostrar o /status.'))
      })

      signal?.addEventListener('abort', () => finish(failure('A leitura da tela do /status foi cancelada.')), {
        once: true,
      })
      pollTimer = setInterval(poll, POLL_INTERVAL_MS)
      timeoutTimer = setTimeout(() => {
        // Sem tempo para mais uma tentativa: vale o último quadro, mesmo que
        // a CLI ainda não tivesse os limites (os números vêm do app-server).
        const { latest } = latestBox()
        if (latest) {
          finishWithScreen(latest)
          return
        }
        finish(failure(
          stage === 'starting'
            ? 'A tela do Codex não ficou pronta para receber o /status a tempo.'
            : 'O /status do Codex não apareceu a tempo.',
        ))
      }, timeoutMs)
    })
  }
}

/**
 * Tela virtual com o mesmo motor do terminal do app, sem DOM. Só responde o
 * que está visível agora — o texto de cada linha do viewport.
 */
function createScreenModel(cols, rows) {
  const terminal = new Terminal({ cols, rows, scrollback: SCREEN_SCROLLBACK, allowProposedApi: true })
  let disposed = false
  return {
    write(data) {
      if (!disposed) {
        terminal.write(data)
      }
    },
    viewport() {
      if (disposed) {
        return []
      }
      const buffer = terminal.buffer.active
      const lines = []
      for (let row = buffer.viewportY; row < buffer.viewportY + rows; row += 1) {
        lines.push(buffer.getLine(row)?.translateToString(true) ?? '')
      }
      return lines
    },
    dispose() {
      if (!disposed) {
        disposed = true
        terminal.dispose()
      }
    },
  }
}

function failure(message) {
  return {
    ok: false,
    readAt: null,
    version: null,
    usagePage: null,
    limitsPending: false,
    lines: [],
    omittedLabels: [],
    message,
  }
}

/**
 * Argumentos da sessão de leitura. A pasta temporária entra como confiável
 * só nesta execução: `-c` nunca escreve no config.toml.
 */
function buildCodexStatusArgs(paths) {
  const projects = paths
    .map((value) => `${toTomlString(value)}={trust_level='trusted'}`)
    .join(',')
  return [
    '--no-daemon',
    '--no-alt-screen',
    '-c',
    'check_for_update_on_startup=false',
    '-c',
    `projects={${projects}}`,
  ]
}

/** O caminho como a CLI pode vê-lo: o criado e o resolvido (/var → /private/var no macOS). */
function trustedPaths(workDir, fileSystem) {
  let resolved = workDir
  try {
    resolved = fileSystem.realpathSync(workDir)
  } catch {
    // Fica só o caminho criado.
  }
  return [...new Set([workDir, resolved])]
}

/**
 * String TOML para chave/valor. A literal (aspas simples) não interpreta
 * barras invertidas — o caminho do Windows passa intacto. Se o caminho tiver
 * aspas simples, cai na string básica, com escape no formato do JSON, que o
 * TOML aceita.
 */
function toTomlString(value) {
  const text = String(value)
  return !text.includes("'") && !/[\u0000-\u001f\u007f]/.test(text)
    ? `'${text}'`
    : JSON.stringify(text)
}

/**
 * Remove os códigos de terminal sem reconstituir a tela: o quadro do
 * `/status` sai no modo inline como linhas inteiras (`\r\n` + texto), então
 * basta tirar cores, links OSC 8 e movimentos de cursor.
 */
function stripCodexTerminalOutput(value) {
  return String(value ?? '')
    .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g, '')
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\u001b[()][0-2A-Z]/g, '')
    .replace(/\u001b./g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
}

/**
 * Quadros do `/status` no texto, na ordem em que saíram. Um quadro vai de
 * `╭` a `╰`; o da abertura (com "model:" e "directory:" em minúsculas) não
 * conta, porque não tem nenhum dos rótulos do `/status`.
 */
function findStatusBoxes(text) {
  const lines = String(text ?? '').split('\n')
  const boxes = []
  let current = null

  for (const line of lines) {
    if (/^\s*╭/.test(line)) {
      current = []
      continue
    }
    if (!current) {
      continue
    }
    if (/^\s*╰/.test(line)) {
      if (current.some((inner) => parseFieldLine(inner) && isStatusField(parseFieldLine(inner).label))) {
        boxes.push(current)
      }
      current = null
      continue
    }
    const inner = extractBoxInner(line)
    if (inner !== null) {
      current.push(inner)
    }
  }

  return boxes
}

function extractBoxInner(line) {
  const start = line.indexOf('│')
  if (start < 0) {
    return null
  }
  const end = line.lastIndexOf('│')
  const inner = end > start ? line.slice(start + 1, end) : line.slice(start + 1)
  return inner.replace(/\s+$/, '')
}

/**
 * Rótulos que só o quadro do `/status` tem. Diferencia maiúsculas de
 * propósito: o quadro de boas-vindas da CLI usa "model:" e "directory:".
 */
function isStatusField(label) {
  return /^(Model|Model provider|Account|Limits)$/.test(label) || /\blimit$/.test(label)
}

function parseFieldLine(inner) {
  const match = /^\s{1,3}([A-Za-z0-9][^:│]{0,48}?):\s+(\S.*)$/.exec(inner)
  if (!match || /^https?$/i.test(match[1])) {
    return null
  }
  return { label: match[1].trim(), value: match[2].trim() }
}

/**
 * Lê um quadro: cabeçalho com a versão, avisos em texto corrido (o link da
 * página de uso) e os pares "Rótulo: valor" na ordem da tela.
 */
function parseStatusBox(innerLines) {
  const fields = []
  const notices = []
  let version = null
  let noticeBuffer = []

  const flushNotice = () => {
    if (noticeBuffer.length) {
      notices.push(noticeBuffer.join(' '))
      noticeBuffer = []
    }
  }

  for (const inner of innerLines) {
    const trimmed = inner.trim()
    if (!trimmed) {
      flushNotice()
      continue
    }

    const header = /OpenAI Codex\s*\(v([^)\s]+)\)/.exec(trimmed)
    if (header) {
      flushNotice()
      version = header[1]
      continue
    }

    const field = parseFieldLine(inner)
    if (field) {
      flushNotice()
      fields.push(field)
      continue
    }

    // Valor longo quebrado em duas linhas: a continuação vem alinhada com a
    // coluna dos valores, bem mais à direita que um aviso.
    if (fields.length && !noticeBuffer.length && /^\s{6,}\S/.test(inner)) {
      fields[fields.length - 1].value = `${fields[fields.length - 1].value} ${trimmed}`
      continue
    }

    noticeBuffer.push(trimmed)
  }
  flushNotice()

  const usagePage = notices
    .map((notice) => /https:\/\/[^\s)]+/.exec(notice)?.[0] ?? null)
    .find(Boolean) ?? null
  const limitsPending = fields.some(
    (field) => /^limits$/i.test(field.label) && LIMITS_PENDING_PATTERN.test(field.value),
  )

  return { version, usagePage, notices, fields, limitsPending }
}

/**
 * Linhas da conta, prontas para o painel: o cabeçalho, os avisos e cada
 * "Rótulo: valor", menos os rótulos da conversa aberta e o aviso transitório
 * "Limits: refresh requested". Segredos são redigidos antes de sair daqui.
 */
function selectAccountStatusLines(parsed) {
  const lines = []
  const omittedLabels = []

  if (parsed.version) {
    lines.push(`OpenAI Codex (v${parsed.version})`)
  }
  lines.push(...parsed.notices)

  for (const field of parsed.fields) {
    if (SESSION_LABEL_SET.has(field.label.toLowerCase())) {
      omittedLabels.push(field.label)
      continue
    }
    if (/^limits$/i.test(field.label) && LIMITS_PENDING_PATTERN.test(field.value)) {
      continue
    }
    lines.push(`${field.label}: ${field.value}`)
  }

  return {
    lines: lines.map((line) => redactSecrets(line).slice(0, 300)).slice(0, 40),
    omittedLabels,
  }
}

/** Atalho para testes e para quem já tem a saída inteira do PTY. */
function parseCodexStatusScreen(output) {
  const boxes = findStatusBoxes(stripCodexTerminalOutput(output))
  return boxes.length ? parseStatusBox(boxes[boxes.length - 1]) : null
}

function loadNodePtySpawn(platformName = process.platform) {
  // Mesmo preparo do terminal do Canvas: o tarball do node-pty pode trazer o
  // spawn-helper do macOS sem bit executável (ver claude-usage-query.cjs).
  if (platformName === 'darwin') {
    const helperState = ensureNodePtySpawnHelperExecutable({ platformName })
    if (!helperState.ok) {
      throw new Error(
        `não foi possível preparar o helper nativo do node-pty: ${helperState.reason}`,
      )
    }
  }

  return require('node-pty').spawn
}

const readCodexStatusScreen = createCodexStatusScreenQuery()

module.exports = {
  CODEX_SESSION_LABELS,
  buildCodexStatusArgs,
  createCodexStatusScreenQuery,
  parseCodexStatusScreen,
  readCodexStatusScreen,
  selectAccountStatusLines,
  stripCodexTerminalOutput,
  toTomlString,
}

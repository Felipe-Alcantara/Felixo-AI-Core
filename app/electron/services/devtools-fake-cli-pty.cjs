'use strict'

/**
 * @module devtools-fake-cli-pty
 * PTY roteirizado no processo principal, só para a instância de automação.
 *
 * O PTY falso que o smoke já usa vive no renderer
 * (`src/features/canvas/terminal/mock-terminal-session-store.ts`): a saída dele
 * nunca passa pelo `onData` do {@link module:pty-process-manager}, que é onde a
 * cadeia de contas escuta as falhas do terminal. Para o smoke provar o caminho
 * de verdade (onData do main → vigia → serviço → IPC → tela) sem abrir CLI
 * nenhuma, este módulo entra no lugar do `node-pty` como `spawnPty` do
 * `PtyProcessManager`, com a mesma superfície que ele usa: `pid`, `onData`,
 * `onExit`, `write`, `resize` e `kill`.
 *
 * Comportamento:
 * - imprime um banner e o prompt, e ecoa o que recebe, como um terminal;
 * - uma linha enviada (Enter) que seja **exatamente** um dos gatilhos faz a
 *   "CLI" imprimir a frase real do Codex, tirada do vocabulário versionado
 *   (`__fixtures__/cli-failure-vocabulary.json`), em 3 pedaços e com CSI de
 *   cursor no meio, como o TUI redesenha. A linha precisa ser só o gatilho:
 *   o contexto de passagem colado num bloco novo pode repetir o texto do bloco
 *   antigo, e isso não pode disparar outra falha;
 * - os gatilhos do smoke de links imprimem hyperlinks OSC 8 (um texto na tela,
 *   outro destino, e um `file:` que o app recusa) ou uma saída em streaming,
 *   linha a linha, para o menu de link ser testado com a tela rolando;
 * - outros dois ligam e desligam o mouse tracking, como a Claude Code e o
 *   Codex fazem, para o menu de link ser testado com o gesto retido pelo
 *   renderer;
 * - toda saída é assíncrona e em ordem, como no `node-pty` (nunca dentro do
 *   `write` de quem chamou);
 * - `kill` encerra com um único `onExit`, e nada é escrito depois dele.
 *
 * Também expõe um executor falso da checagem de login, com a saída real do
 * `codex login status`, para a elegibilidade da cadeia ser injetada na mesma
 * instância. Nenhuma CLI real roda.
 *
 * Carregado só por `core/devtools-fake-cli-pty-guard.cjs` (porta de depuração
 * válida **e** `FELIXO_DEVTOOLS_FAKE_CLI_PTY=1`). O app normal nunca carrega
 * este arquivo.
 */

const os = require('node:os')
const path = require('node:path')
const vocabulary = require('../__fixtures__/cli-failure-vocabulary.json')

const CSI = '\u001b['
const PROMPT = '› '
const BANNER =
  '[Felixo] CLI roteirizada da instância de automação.\r\n' +
  'Nenhum processo externo foi iniciado.\r\n\r\n'
/** Intervalo entre os pedaços de uma frase roteirizada. */
const DEFAULT_CHUNK_DELAY_MS = 20
/** Longe de qualquer PID real; o manager nunca usa o PID do PTY. */
const FAKE_PID_BASE = 4_000_000
/** `signal` do `onExit` quando `kill()` vem sem sinal (padrão do node-pty). */
const DEFAULT_KILL_SIGNAL = 'SIGHUP'
const INPUT_ESCAPE_PATTERN = /^\u001b(?:\[[0-?]*[ -/]*[@-~]|O.|.)?/
const WINDOWS_EXECUTABLE_SUFFIX = /\.(?:exe|cmd|bat|ps1)$/i

/**
 * Gatilho digitado → frase do Codex no vocabulário versionado. Só frases que
 * valem no terminal (`terminal: true`), senão a vigia do PTY as ignoraria.
 */
const SMOKE_TRIGGER_PHRASES = Object.freeze({
  __felixo_smoke_limite__: 'codex.limit.purchase-credits',
  __felixo_smoke_rede__: 'codex.network.stream-disconnected',
  __felixo_smoke_401__: 'codex.auth.access-token-not-refreshed',
})

const OSC = '\u001b]'
const STRING_TERMINATOR = '\u001b\\'

/** Hyperlink OSC 8: `text` na tela, `url` como destino. */
function osc8(url, text) {
  return `${OSC}8;;${url}${STRING_TERMINATOR}${text}${OSC}8;;${STRING_TERMINATOR}`
}

/**
 * Gatilhos do smoke de links (sessão D). O primeiro link diz um host na tela e
 * leva a outro, o caso em que só o menu mostra o destino de verdade. O
 * segundo é um arquivo local, que o app mostra, explica e não abre.
 */
const SMOKE_LINK_OUTPUTS = Object.freeze({
  __felixo_smoke_osc8__:
    `Destino disfarçado: ${osc8('https://example.com/destino-real', 'banco.example')}\r\n` +
    `Arquivo local: ${osc8('file:///etc/hosts', 'hosts do sistema')}\r\n`,
})
/** Imprime linhas de saída por alguns segundos: a tela rola sob o menu aberto. */
const SMOKE_STREAM_TRIGGER = '__felixo_smoke_stream__'
const SMOKE_STREAM_LINES = 60
const SMOKE_STREAM_LINE_DELAY_MS = 50

/**
 * Liga e desliga o mouse tracking, como a Claude Code e o Codex fazem ao
 * desenhar a tela cheia: `?1000` pede o relato de cada clique ao processo e
 * `?1006` pede as coordenadas em SGR (`CSI < … M`), que a leitura de escapes
 * do prompt descarta em vez de ecoar como texto. Com o modo ligado, o
 * renderer retém o `mousedown` e devolve o gesto como sintético
 * (`terminal-mouse-selection.ts`): é o caminho em que o smoke prova, no app
 * real, que um toque no link ainda abre o menu de destino. O `off` devolve o
 * terminal ao estado de shell, para os passos seguintes não herdarem o modo.
 */
const SMOKE_MOUSE_TRACKING_OUTPUTS = Object.freeze({
  __felixo_smoke_mouse_on__: `${CSI}?1000h${CSI}?1006h`,
  __felixo_smoke_mouse_off__: `${CSI}?1000l${CSI}?1006l`,
})

/** Saída real de `codex login status` com login pela conta do ChatGPT. */
const FAKE_CODEX_LOGIN_STATUS_OUTPUT = 'Logged in using ChatGPT\n'

/**
 * @param {string} phraseId
 * @returns {string}
 */
function readCodexFixture(phraseId) {
  const phrase = vocabulary.providers?.codex?.phrases?.find((item) => item.id === phraseId)
  if (!phrase || phrase.terminal !== true || typeof phrase.example !== 'string') {
    throw new Error(`Frase ${phraseId} do Codex ausente do vocabulário ou fora do terminal.`)
  }
  return phrase.example
}

// Resolvido ao carregar: um id que sumiu do vocabulário falha no teste, não
// no meio do smoke.
const SMOKE_TRIGGER_OUTPUTS = Object.freeze(
  Object.fromEntries(
    Object.entries(SMOKE_TRIGGER_PHRASES).map(([trigger, phraseId]) => [
      trigger,
      readCodexFixture(phraseId),
    ]),
  ),
)

/**
 * Parte a frase em 3 pedaços como o TUI a entrega: o primeiro corta a
 * frase-chave no meio (a vigia precisa juntar pedaços), um espaço do pedaço do
 * meio vira avanço de cursor (`CSI 1 C`, célula que não mudou) e as pontas
 * limpam a linha e escondem/mostram o cursor.
 *
 * @param {string} text - Uma linha, como a CLI a imprime.
 * @returns {string[]}
 */
function splitIntoTerminalChunks(text) {
  const words = String(text).split(' ')
  const firstCut = Math.max(1, Math.floor(words.length / 4))
  const secondCut = Math.max(firstCut + 1, Math.floor((words.length * 2) / 3))
  const groups = [
    words.slice(0, firstCut),
    words.slice(firstCut, secondCut),
    words.slice(secondCut),
  ].filter((group) => group.length > 0)

  return groups.map((group, index) => {
    const middle = index > 0 && index < groups.length - 1
    const body = middle && group.length > 1
      ? `${group[0]}${CSI}1C${group.slice(1).join(' ')}`
      : group.join(' ')
    const lead = index === 0 ? `\r${CSI}2K${CSI}?25l` : ' '
    const tail = index === groups.length - 1 ? `${CSI}K\r\n${CSI}?25h` : ''
    return `${lead}${body}${tail}`
  })
}

/**
 * Fila de saída em ordem, sempre assíncrona.
 *
 * @param {{ emit: (data: string) => void, setTimer: Function, clearTimer: Function }} deps
 */
function createOutputQueue({ emit, setTimer, clearTimer }) {
  const pending = []
  let timer = null

  function pump() {
    if (timer !== null || pending.length === 0) return
    const next = pending[0]
    timer = setTimer(() => {
      timer = null
      pending.shift()
      emit(next.data)
      pump()
    }, next.delayMs)
  }

  return {
    push(data, delayMs = 0) {
      pending.push({ data, delayMs })
      pump()
    },
    clear() {
      pending.length = 0
      if (timer !== null) {
        clearTimer(timer)
        timer = null
      }
    },
  }
}

/**
 * @param {string | undefined} signal
 * @returns {number}
 */
function signalNumber(signal) {
  const name = typeof signal === 'string' && signal ? signal : DEFAULT_KILL_SIGNAL
  return os.constants.signals[name] ?? os.constants.signals[DEFAULT_KILL_SIGNAL] ?? 1
}

/**
 * @param {unknown} value
 * @param {number} fallback
 */
function positiveDimension(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback
}

/**
 * Um PTY roteirizado: a mesma superfície do `node-pty` que o manager usa.
 *
 * @param {object} params
 * @param {object} [params.options] - Opções do `node-pty` (só `cols`/`rows` importam).
 * @param {number} params.pid
 * @param {number} params.chunkDelayMs
 * @param {Function} params.setTimer
 * @param {Function} params.clearTimer
 * @returns {import('./pty-process-manager.cjs').PtyHandle & { readonly cols: number, readonly rows: number }}
 */
function createFakeCliPty({ options = {}, pid, chunkDelayMs, setTimer, clearTimer }) {
  const dataListeners = new Set()
  const exitListeners = new Set()
  let cols = positiveDimension(options.cols, 80)
  let rows = positiveDimension(options.rows, 24)
  let line = ''
  let lastWasCarriageReturn = false
  let exited = false

  const output = createOutputQueue({
    emit: (data) => {
      for (const listener of [...dataListeners]) listener(data)
    },
    setTimer,
    clearTimer,
  })

  function submitLine() {
    const submitted = line
    line = ''
    output.push('\r\n')
    const trigger = submitted.trim()
    const scripted = SMOKE_TRIGGER_OUTPUTS[trigger]
    if (scripted) {
      splitIntoTerminalChunks(scripted).forEach((chunk) => output.push(chunk, chunkDelayMs))
    } else if (SMOKE_LINK_OUTPUTS[trigger]) {
      output.push(SMOKE_LINK_OUTPUTS[trigger], chunkDelayMs)
    } else if (SMOKE_MOUSE_TRACKING_OUTPUTS[trigger]) {
      output.push(SMOKE_MOUSE_TRACKING_OUTPUTS[trigger], chunkDelayMs)
    } else if (trigger === SMOKE_STREAM_TRIGGER) {
      for (let index = 1; index <= SMOKE_STREAM_LINES; index += 1) {
        output.push(`linha ${index} de ${SMOKE_STREAM_LINES} da saída em streaming\r\n`, SMOKE_STREAM_LINE_DELAY_MS)
      }
    }
    output.push(PROMPT)
  }

  function handleInput(data) {
    let index = 0
    while (index < data.length) {
      const char = data[index]
      if (char === '\u001b') {
        // Setas, colagem entre colchetes e afins: nada disso é texto do prompt.
        const match = INPUT_ESCAPE_PATTERN.exec(data.slice(index))
        index += match[0].length
        lastWasCarriageReturn = false
        continue
      }
      index += 1

      if (char === '\n' && lastWasCarriageReturn) {
        lastWasCarriageReturn = false
        continue
      }
      lastWasCarriageReturn = char === '\r'

      if (char === '\r' || char === '\n') {
        submitLine()
      } else if (char === '\u007f' || char === '\b') {
        if (line) {
          line = Array.from(line).slice(0, -1).join('')
          output.push('\b \b')
        }
      } else if (char === '\u0003') {
        line = ''
        output.push(`^C\r\n${PROMPT}`)
      } else if (char >= ' ') {
        line += char
        output.push(char)
      }
    }
  }

  output.push(`${BANNER}${PROMPT}`)

  return {
    pid,
    get cols() {
      return cols
    },
    get rows() {
      return rows
    },
    onData(listener) {
      dataListeners.add(listener)
      return { dispose: () => dataListeners.delete(listener) }
    },
    onExit(listener) {
      exitListeners.add(listener)
      return { dispose: () => exitListeners.delete(listener) }
    },
    write(data) {
      if (exited) return
      handleInput(String(data ?? ''))
    },
    resize(nextCols, nextRows) {
      if (
        !Number.isFinite(nextCols) ||
        !Number.isFinite(nextRows) ||
        nextCols <= 0 ||
        nextRows <= 0
      ) {
        throw new Error('resizing must be done using positive cols and rows')
      }
      if (exited) return
      cols = nextCols
      rows = nextRows
    },
    kill(signal) {
      if (exited) return
      exited = true
      // Nada do roteiro sai depois do fim, como num processo morto.
      output.clear()
      const event = { exitCode: 0, signal: signalNumber(signal) }
      setTimer(() => {
        for (const listener of [...exitListeners]) listener(event)
      }, 0)
    },
  }
}

/**
 * Fábrica no formato do `spawnPty` do `PtyProcessManager`. O comando, os
 * argumentos, a pasta e o ambiente são ignorados de propósito: nada é
 * executado, e nada do ambiente (onde moram as credenciais) é impresso.
 *
 * @param {object} [deps]
 * @param {number} [deps.chunkDelayMs] - Intervalo entre pedaços do roteiro.
 * @param {Function} [deps.setTimer] - `setTimeout` injetável (testes).
 * @param {Function} [deps.clearTimer] - `clearTimeout` injetável (testes).
 * @returns {import('./pty-process-manager.cjs').PtyFactory}
 */
function createFakeCliPtyFactory({
  chunkDelayMs = DEFAULT_CHUNK_DELAY_MS,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  let nextPid = FAKE_PID_BASE
  return (_file, _args, options) => {
    nextPid += 1
    return createFakeCliPty({ options, pid: nextPid, chunkDelayMs, setTimer, clearTimer })
  }
}

/**
 * @param {unknown} command
 * @returns {string}
 */
function commandName(command) {
  // `win32.basename` aceita `/` e `\`: o mesmo nome em qualquer sistema.
  return path.win32
    .basename(String(command ?? ''))
    .replace(WINDOWS_EXECUTABLE_SUFFIX, '')
    .toLowerCase()
}

/**
 * Executor falso no formato de `runBufferedCommand`: responde à checagem de
 * login do Codex com a saída real e recusa todo o resto como CLI ausente
 * (fail-closed), sem iniciar processo nenhum.
 *
 * @returns {(request: { command?: string, args?: string[] }) => Promise<{ ok: boolean, message: string, stdout: string, stderr: string, errorCode?: string }>}
 */
function createFakeAuthCommandRunner() {
  return async function runFakeAuthCommand({ command, args = [] } = {}) {
    if (commandName(command) === 'codex' && args.join(' ') === 'login status') {
      return {
        ok: true,
        message: 'Comando concluido.',
        stdout: FAKE_CODEX_LOGIN_STATUS_OUTPUT,
        stderr: '',
      }
    }
    return {
      ok: false,
      message: 'Comando fora do roteiro da instância de automação; nenhuma CLI real roda aqui.',
      stdout: '',
      stderr: '',
      errorCode: 'ENOENT',
    }
  }
}

module.exports = {
  DEFAULT_CHUNK_DELAY_MS,
  FAKE_CODEX_LOGIN_STATUS_OUTPUT,
  PROMPT,
  SMOKE_LINK_OUTPUTS,
  SMOKE_MOUSE_TRACKING_OUTPUTS,
  SMOKE_STREAM_LINES,
  SMOKE_STREAM_TRIGGER,
  SMOKE_TRIGGER_OUTPUTS,
  SMOKE_TRIGGER_PHRASES,
  createFakeAuthCommandRunner,
  createFakeCliPtyFactory,
  splitIntoTerminalChunks,
}

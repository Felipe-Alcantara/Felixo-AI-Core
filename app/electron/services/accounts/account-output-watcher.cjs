'use strict'

/**
 * @module account-output-watcher
 * Vigia de falha por conta num terminal interativo de agente.
 *
 * Fica no caminho QUENTE: o `PtyProcessManager` chama `push()` em todo pedaço
 * de saída do PTY, depois de entregar o pedaço ao renderer. Por isso o
 * `push()` só marca que há texto novo e guarda o horário — sem regex, sem
 * cópia do pedaço, sem alocação — e arma no máximo um timer por sessão.
 *
 * A leitura de verdade é a varredura adiada: quando a saída fica
 * `OUTPUT_WATCHER_DEBOUNCE_MS` em silêncio, ou no máximo
 * `OUTPUT_WATCHER_MAX_WAIT_MS` depois do primeiro pedaço ainda não lido (uma
 * TUI com spinner nunca silencia), a vigia lê os últimos
 * `OUTPUT_WATCHER_TAIL_CHARS` caracteres da cauda de replay que o manager já
 * guarda (`tail(n)`, sem cópia do buffer inteiro) e passa um pré-filtro de
 * `indexOf` com as palavras das frases do provedor: primeiro na cauda
 * inteira (o spinner para aqui) e depois linha a linha, e só as últimas
 * `OUTPUT_WATCHER_MAX_LINES` linhas que passaram vão à taxonomia, na origem
 * `pty`. Varrer a cauda, e não o pedaço, é o que acha um aviso partido em
 * vários pedaços ou redesenhado com sequências de cursor entre as palavras.
 *
 * O pré-filtro olha o texto cru, sem normalizar: toda palavra de uma frase
 * sobrevive à normalização da taxonomia sem mudar (ela só troca por espaço o
 * que não é letra nem dígito, e só acrescenta quebras de linha), então uma
 * frase que a taxonomia reconheceria sempre deixa as palavras dela intactas
 * na mesma linha crua. O pré-filtro nunca esconde uma detecção; só evita
 * normalizar e classificar o que não tem o que achar — e a taxonomia
 * normaliza uma vez só.
 *
 * A mesma evidência não gera segunda detecção: cada sessão lembra as
 * `OUTPUT_WATCHER_SEEN_EVIDENCE_MAX` impressões digitais mais recentes.
 *
 * Esta vigia não decide nada: entrega a detecção a quem a criou
 * (`onDetection`), e uma falha desse consumidor nunca derruba a vigia nem o
 * terminal.
 */

const {
  OUTPUT_WATCHER_DEBOUNCE_MS,
  OUTPUT_WATCHER_MAX_LINES,
  OUTPUT_WATCHER_MAX_WAIT_MS,
  OUTPUT_WATCHER_SEEN_EVIDENCE_MAX,
  OUTPUT_WATCHER_TAIL_CHARS,
} = require('./account-chain-constants.cjs')
const { PROVIDER_PATTERNS } = require('./cli-failure-patterns.cjs')
const {
  classifyFailure,
  hasTerminalPatterns,
  resolveFailureProviderId,
} = require('./failure-taxonomy.cjs')

/**
 * Primeira quebra de linha para a taxonomia: LF, CR ou movimento de cursor
 * para outra linha (o mesmo conjunto que `normalizeTerminalText` quebra).
 */
const FIRST_LINE_BREAK_PATTERN = /[\r\n]|\u001b\[[0-?]*[ -/]*[ABEFHf]/

/**
 * A palavra mais longa de uma frase, na forma de comparação da taxonomia
 * (minúsculas; apóstrofo e sublinhado separam palavras). A mais longa é a
 * mais rara: "automatically" filtra muito mais que "you".
 *
 * @param {string} phrase
 * @returns {string | null}
 */
function longestWord(phrase) {
  const words = String(phrase).toLowerCase().match(/[a-z0-9]+/g) ?? []
  return words.reduce((longest, word) => (word.length > longest.length ? word : longest), '') || null
}

/**
 * Palavras do pré-filtro por provedor: uma por frase que vale no terminal
 * (as de `terminal: false` são códigos só da saída one-shot) e por aviso.
 */
const PREFILTER_WORDS = Object.freeze(Object.fromEntries(
  Object.entries(PROVIDER_PATTERNS).map(([providerId, patterns]) => {
    const phrases = [
      ...patterns.include.filter((rule) => rule.terminal !== false).map((rule) => rule.phrase),
      ...patterns.notices.map((rule) => rule.phrase),
    ]
    const words = new Set(phrases.map(longestWord).filter(Boolean))
    return [providerId, Object.freeze([...words])]
  }),
))

/**
 * O texto (já em minúsculas) tem alguma palavra do pré-filtro?
 *
 * @param {string} lowerText
 * @param {readonly string[]} words
 * @returns {boolean}
 */
function passesPrefilter(lowerText, words) {
  if (!lowerText) return false
  for (const word of words) {
    if (lowerText.indexOf(word) !== -1) return true
  }
  return false
}

function defaultSetTimer(callback, delayMs) {
  const handle = setTimeout(callback, delayMs)
  // A vigia nunca segura o processo aberto.
  if (typeof handle?.unref === 'function') handle.unref()
  return handle
}

function defaultClearTimer(handle) {
  clearTimeout(handle)
}

/**
 * @typedef {ReturnType<typeof classifyFailure>} FailureResult
 *
 * @typedef {(
 *   | { kind: 'failure', failure: FailureResult, detectedAt: number }
 *   | { kind: 'notice', notice: 'limit_reset', providerId: string, detectedAt: number }
 * )} OutputDetection
 *
 * @typedef {object} AccountOutputWatcher
 * @property {(at?: number) => void} push - Um pedaço novo chegou (O(1)).
 * @property {() => OutputDetection[]} scan - Varre agora e devolve o que emitiu.
 * @property {() => OutputDetection[]} flush - Varre agora só se há saída não lida.
 * @property {() => void} dispose - Desarma o timer; depois disso nada mais roda.
 * @property {number} lastChunkAt - Horário do último pedaço recebido (0 = nenhum).
 * @property {boolean} pending - Há saída ainda não varrida.
 * @property {{ scans: number, prefilterHits: number, detections: number }} stats
 */

/**
 * Cria a vigia de uma sessão, ou `null` quando o provedor não tem frase para
 * vigiar no terminal (shell, Openia): esses terminais não pagam nada.
 *
 * @param {object} options
 * @param {string | null | undefined} options.providerId - Provedor (ou tipo de CLI) da sessão.
 * @param {(count: number) => string} options.readTail - Últimos `count` caracteres da saída.
 * @param {(detection: OutputDetection) => void} options.onDetection - Recebe cada detecção nova.
 * @param {() => number} [options.now]
 * @param {(callback: () => void, delayMs: number) => unknown} [options.setTimer]
 * @param {(handle: unknown) => void} [options.clearTimer]
 * @param {{ warn?: (...args: unknown[]) => void }} [options.logger]
 * @returns {AccountOutputWatcher | null}
 */
function createAccountOutputWatcher({
  providerId: rawProviderId,
  readTail,
  onDetection,
  now = Date.now,
  setTimer = defaultSetTimer,
  clearTimer = defaultClearTimer,
  logger = console,
} = {}) {
  const providerId = resolveFailureProviderId(rawProviderId)
  if (!providerId || !hasTerminalPatterns(providerId)) return null
  if (typeof readTail !== 'function' || typeof onDetection !== 'function') return null

  const prefilterWords = PREFILTER_WORDS[providerId]
  /** Impressões digitais já emitidas; a ordem do Map é a recência. */
  const seen = new Map()
  const stats = { scans: 0, prefilterHits: 0, detections: 0 }
  let disposed = false
  let dirty = false
  let lastChunkAt = 0
  /** Horário do primeiro pedaço ainda não varrido; `null` = nada pendente. */
  let pendingSince = null
  let timer = null
  /** O aviso de "limite voltou" estava na cauda na última varredura. */
  let noticeVisible = false

  function warn(message, error) {
    try {
      // Só a mensagem do erro: a saída do terminal nunca vai para o log.
      logger?.warn?.(`[vigia de contas] ${message}`, error instanceof Error ? error.message : undefined)
    } catch {
      // O log não pode derrubar a vigia.
    }
  }

  function remember(key) {
    seen.delete(key)
    seen.set(key, true)
    if (seen.size > OUTPUT_WATCHER_SEEN_EVIDENCE_MAX) {
      seen.delete(seen.keys().next().value)
    }
  }

  function emit(detection, emitted) {
    stats.detections += 1
    emitted.push(detection)
    try {
      onDetection(detection)
    } catch (error) {
      warn('o consumidor da detecção falhou; a vigia continua.', error)
    }
  }

  /**
   * @param {FailureResult} result
   * @returns {OutputDetection[]}
   */
  function emitNew(result) {
    const emitted = []
    const detectedAt = now()

    if (result.failureClass !== 'unknown' && result.evidenceHash) {
      const known = seen.has(result.evidenceHash)
      // Visto de novo (a TUI redesenhou o aviso) também renova a recência:
      // o aviso que continua na tela é o último a ser esquecido.
      remember(result.evidenceHash)
      if (!known) emit({ kind: 'failure', failure: result, detectedAt }, emitted)
    }

    // O aviso de reset não tem evidência própria no resultado: vale a
    // transição "não estava na cauda → está". Enquanto continuar visível
    // (redesenho), não repete; depois de sair da cauda, uma nova aparição é
    // um novo reset.
    const noticeNow = result.notice === 'limit_reset'
    if (noticeNow && !noticeVisible) {
      emit({ kind: 'notice', notice: result.notice, providerId, detectedAt }, emitted)
    }
    noticeVisible = noticeNow
    return emitted
  }

  function classifyTail() {
    let tail = String(readTail(OUTPUT_WATCHER_TAIL_CHARS) ?? '')
    if (tail.length >= OUTPUT_WATCHER_TAIL_CHARS) {
      // Cauda cheia: a primeira linha pode ter sido cortada no meio, e o que
      // sobra dela ("Not logged in" de um "Auth: Not logged in") não é o que
      // a CLI imprimiu. Sem nenhuma quebra, a cauda inteira é esse pedaço.
      const firstBreak = FIRST_LINE_BREAK_PATTERN.exec(tail)
      tail = firstBreak ? tail.slice(firstBreak.index) : ''
    }

    const lower = tail.toLowerCase()
    if (!passesPrefilter(lower, prefilterWords)) {
      noticeVisible = false
      return []
    }
    stats.prefilterHits += 1

    // Linha a linha, de trás para frente: só as que têm palavra do provedor.
    // `toLowerCase` nunca cria nem apaga um LF, então as duas listas se
    // correspondem posição a posição.
    const rawLines = tail.split('\n')
    const lowerLines = lower.split('\n')
    const kept = []
    for (let index = rawLines.length - 1; index >= 0 && kept.length < OUTPUT_WATCHER_MAX_LINES; index -= 1) {
      if (passesPrefilter(lowerLines[index], prefilterWords)) kept.push(rawLines[index])
    }
    kept.reverse()

    return emitNew(classifyFailure({ text: kept.join('\n'), origin: 'pty', providerId }))
  }

  /** @returns {OutputDetection[]} */
  function scan() {
    if (disposed) return []
    if (timer !== null) {
      clearTimer(timer)
      timer = null
    }
    dirty = false
    pendingSince = null
    stats.scans += 1

    try {
      return classifyTail()
    } catch (error) {
      // Roda num timer do processo principal: uma exceção aqui virava erro
      // não tratado no Electron. A vigia falha fechada (sem detecção).
      warn('a varredura falhou; nada foi detectado.', error)
      return []
    }
  }

  function onTimer() {
    timer = null
    if (disposed || !dirty) return

    const at = now()
    const quietFor = at - lastChunkAt
    const waited = at - pendingSince
    if (quietFor >= OUTPUT_WATCHER_DEBOUNCE_MS || waited >= OUTPUT_WATCHER_MAX_WAIT_MS) {
      scan()
      return
    }

    const remaining = Math.min(OUTPUT_WATCHER_DEBOUNCE_MS - quietFor, OUTPUT_WATCHER_MAX_WAIT_MS - waited)
    timer = setTimer(onTimer, Math.max(1, remaining))
  }

  function push(at) {
    if (disposed) return
    const chunkAt = at === undefined ? now() : at
    dirty = true
    lastChunkAt = chunkAt
    if (pendingSince === null) pendingSince = chunkAt
    if (timer === null) timer = setTimer(onTimer, OUTPUT_WATCHER_DEBOUNCE_MS)
  }

  function flush() {
    return !disposed && dirty ? scan() : []
  }

  function dispose() {
    if (disposed) return
    disposed = true
    if (timer !== null) {
      clearTimer(timer)
      timer = null
    }
    seen.clear()
  }

  return {
    push,
    scan,
    flush,
    dispose,
    get lastChunkAt() {
      return lastChunkAt
    },
    get pending() {
      return dirty
    },
    get stats() {
      return { ...stats }
    },
  }
}

module.exports = {
  PREFILTER_WORDS,
  createAccountOutputWatcher,
  passesPrefilter,
}

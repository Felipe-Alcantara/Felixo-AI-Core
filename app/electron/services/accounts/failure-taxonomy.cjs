'use strict'

/**
 * @module failure-taxonomy
 * Classificador único de falhas das CLIs de agente: texto (e sinal) viram uma
 * classe fechada, com escopo, evidência redigida e impressão digital.
 *
 * Função pura, sem I/O: o orquestrador (via `model-availability.cjs`), o chat
 * (pelo evento de erro que o processo principal envia) e a vigia do terminal
 * consomem o mesmo resultado, em vez de cada um manter o próprio regex.
 *
 * Classes: `limit | billing | auth | network | provider | timeout | cancelled
 * | unknown`, mais `ambiguous` (pede escolha) e `scope` (`account` ou
 * `model`). Precedência quando mais de uma aparece:
 * `cancelled > auth > billing > limit > provider > network > timeout >
 * unknown` — login antes de limite, como o orquestrador já fazia. Uma
 * ocorrência ambígua perde para qualquer ocorrência certa.
 *
 * Duas origens:
 * - `pty` (terminal interativo): só as frases do provedor da sessão, sem os
 *   códigos de erro e sem as frases genéricas. Um agente pode imprimir "401
 *   Unauthorized" ou "rate limit" como parte do trabalho.
 * - `fluxo` (erro de execução one-shot): frases do provedor, códigos e frases
 *   genéricas.
 *
 * Em qualquer origem, uma exclusão do provedor na mesma linha anula a linha
 * ("Usage limit reached · wrapping up" é tolerância, não limite).
 *
 * No terminal a frase do provedor só vale no começo da linha (depois só de
 * espaços e glifos da TUI) ou depois de uma abertura de linha da própria CLI:
 * o agente que cita a mensagem num diff, num teste ou no código não põe a
 * conta em espera.
 */

const crypto = require('node:crypto')

const { redactSecrets } = require('../official-cli-account-status.cjs')
const {
  EVIDENCE_HASH_HEX_CHARS,
  EVIDENCE_LEAD_CHARS,
  EVIDENCE_MAX_CHARS,
} = require('./account-chain-constants.cjs')
const {
  APP_TIMEOUT_PATTERN,
  GENERIC_PATTERNS,
  PROVIDER_PATTERNS,
  STATUS_CODES,
  STATUS_CODE_CONTEXT,
} = require('./cli-failure-patterns.cjs')

const FAILURE_PRECEDENCE = Object.freeze([
  'cancelled',
  'auth',
  'billing',
  'limit',
  'provider',
  'network',
  'timeout',
  'unknown',
])

const FAILURE_CLASSES = Object.freeze([...FAILURE_PRECEDENCE])

/** Tipos de CLI do app que falam com o mesmo provedor. */
const PROVIDER_ALIASES = Object.freeze({
  claude: 'claude',
  codex: 'codex',
  'codex-app-server': 'codex',
  gemini: 'gemini',
  'gemini-acp': 'gemini',
  openia: 'openia',
})

/**
 * Sequências de escape de terminal. Movimento de cursor para outra linha vira
 * quebra de linha (a TUI redesenha o aviso em outra posição); o resto vira
 * espaço (cor, apagar, mover na mesma linha).
 */
const CSI_PATTERN = /\u001b\[[0-?]*[ -/]*([@-~])/g
const OSC_PATTERN = /\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)?/g
const OTHER_ESCAPE_PATTERN = /\u001b[@-Z\\-_]/g
const LINE_BREAKING_CSI = new Set(['A', 'B', 'E', 'F', 'H', 'f'])
const CONTROL_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u009b]/g

/**
 * A linha tem espaço repetido ou espaço que não é o simples (tab, NBSP)? Só
 * então colapsar muda alguma coisa. A vigia do terminal normaliza até 4 KiB
 * de saída por varredura, e o colapso por regex em toda linha era a maior
 * parte desse custo.
 */
const NEEDS_SPACE_COLLAPSE = /\s\s|[^\S ]/

/** `trim` e `\s` usam o mesmo conjunto de espaços: aparar antes dá o mesmo resultado. */
function collapseSpaces(line) {
  const trimmed = line.trim()
  return NEEDS_SPACE_COLLAPSE.test(trimmed) ? trimmed.replace(/\s+/g, ' ') : trimmed
}

/**
 * Normaliza a saída de terminal em linhas legíveis: tira escapes e controles,
 * trata CR como quebra (redesenho), colapsa espaços e descarta linhas vazias.
 *
 * @param {unknown} text
 * @returns {string[]}
 */
function normalizeTerminalText(text) {
  return String(text ?? '')
    .replace(OSC_PATTERN, ' ')
    .replace(CSI_PATTERN, (_sequence, final) => (LINE_BREAKING_CSI.has(final) ? '\n' : ' '))
    .replace(OTHER_ESCAPE_PATTERN, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_PATTERN, ' ')
    .split('\n')
    .map(collapseSpaces)
    .filter(Boolean)
}

/**
 * Forma de comparação de uma linha já normalizada. Preserva o comprimento
 * (troca caractere por caractere), para o índice de um casamento valer na
 * linha original ao recortar a evidência.
 *
 * @param {string} line
 * @returns {string}
 */
function toMatchForm(line) {
  return String(line)
    .toLowerCase()
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/_/g, ' ')
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
}

/**
 * Compila uma frase: espaço casa qualquer espaço, "·" aceita espaço ou não em
 * volta, e as pontas alfanuméricas exigem fronteira de palavra.
 *
 * @param {string} phrase
 * @param {{ anchor?: 'line' }} [options]
 * @returns {RegExp}
 */
/**
 * Espaços e glifos com que a TUI das CLIs abre uma linha de aviso: setas,
 * símbolos técnicos (⎿ ⏺), desenho de caixa (│), blocos e formas (■ ●),
 * símbolos e dingbats (⚠ ✕ ❯), marcadores (• ›). Aspas, sinais de diff e
 * pontuação de código ficam de fora de propósito.
 */
const TUI_LINE_LEAD = '[\\s\\u2022\\u203a\\u2190-\\u21ff\\u2300-\\u23ff\\u2500-\\u27bf\\u2b00-\\u2bff]*'

function compilePhraseBody(phrase) {
  const normalized = toMatchForm(String(phrase).replace(/\s+/g, ' ').trim())
  const body = [...normalized]
    .map((char) => (char === ' ' ? '\\s+' : escapeRegExp(char)))
    .join('')
    .replace(/(?:\\s\+)?·(?:\\s\+)?/g, '\\s*·\\s*')
  return {
    body,
    start: /^[a-z0-9]/.test(normalized) ? '(?<![a-z0-9])' : '',
    end: /[a-z0-9]$/.test(normalized) ? '(?![a-z0-9])' : '',
  }
}

function compilePhrase(phrase, options = {}) {
  const { body, start, end } = compilePhraseBody(phrase)

  if (options.anchor === 'line') {
    return new RegExp(`^[^a-z0-9]*${body}[^a-z0-9]*$`)
  }

  return new RegExp(`${start}${body}${end}`)
}

/**
 * A mesma frase para a origem `pty`: no começo da linha (depois só de glifos
 * da TUI) ou depois de uma abertura de linha da própria CLI.
 *
 * @param {string} phrase
 * @param {readonly string[]} linePrefixes
 * @returns {RegExp}
 */
function compileTerminalPhrase(phrase, linePrefixes = []) {
  const { body, start, end } = compilePhraseBody(phrase)
  const alternatives = [`${body}${end}`]
  for (const prefix of linePrefixes) {
    alternatives.push(`${compilePhraseBody(prefix).body}.*${start}${body}${end}`)
  }
  return new RegExp(`^${TUI_LINE_LEAD}(?:${alternatives.join('|')})`)
}

function compileRule(rule, linePrefixes) {
  const regex = compilePhrase(rule.phrase, { anchor: rule.anchor })
  return {
    ...rule,
    regex,
    terminalRegex: rule.anchor === 'line' || !linePrefixes ? regex : compileTerminalPhrase(rule.phrase, linePrefixes),
    alsoRequiresRegex: rule.alsoRequires ? compilePhrase(rule.alsoRequires) : null,
    terminal: rule.terminal !== false,
  }
}

const COMPILED_PROVIDERS = Object.freeze(Object.fromEntries(
  Object.entries(PROVIDER_PATTERNS).map(([providerId, patterns]) => {
    const linePrefixes = patterns.terminalLinePrefixes ?? []
    return [providerId, Object.freeze({
      include: patterns.include.map((rule) => compileRule(rule, linePrefixes)),
      exclude: patterns.exclude.map((phrase) => compilePhrase(phrase)),
      notices: patterns.notices.map((rule) => compileRule(rule, linePrefixes)),
    })]
  }),
))

const COMPILED_GENERIC = GENERIC_PATTERNS.map((rule) => compileRule({ scope: 'account', ...rule, terminal: false }))

const ALL_EXCLUSIONS = Object.values(COMPILED_PROVIDERS).flatMap((provider) => provider.exclude)

const CAPACITY_MARKERS = COMPILED_GENERIC.filter((rule) => rule.capacity).map((rule) => rule.regex)

const STATUS_CONTEXT_SOURCE = STATUS_CODE_CONTEXT
  .map((word) => (word === 'http' ? 'http(?:\\/\\d(?:\\.\\d)?)?' : escapeRegExp(word)))
  .join('|')

const COMPILED_STATUS_CODES = STATUS_CODES.map((status) => ({
  ...status,
  regex: new RegExp(`(?<![a-z0-9])(?:${STATUS_CONTEXT_SOURCE})[^a-z0-9]{0,4}${status.code}(?![0-9a-z])`),
}))

/**
 * Provedor de falha de um tipo de CLI ou de um id de provedor; `null` quando
 * o app não conhece o vocabulário dele.
 *
 * @param {unknown} value
 * @returns {'claude' | 'codex' | 'gemini' | 'openia' | null}
 */
function resolveFailureProviderId(value) {
  return typeof value === 'string' ? PROVIDER_ALIASES[value.trim()] ?? null : null
}

/**
 * Se o terminal deste provedor tem alguma frase para vigiar. Um provedor sem
 * frase (o Openia) não paga nada pela vigia.
 */
function hasTerminalPatterns(providerId) {
  const compiled = COMPILED_PROVIDERS[resolveFailureProviderId(providerId)]
  return Boolean(compiled?.include.some((rule) => rule.terminal))
}

/** Regex da regra na origem: no terminal, a ancorada no começo da linha. */
function ruleRegexFor(rule, origin) {
  return origin === 'pty' ? rule.terminalRegex ?? rule.regex : rule.regex
}

function collectCandidates(matchLine, rules, origin, lineIndex, line) {
  const candidates = []
  for (const rule of rules) {
    if (origin === 'pty' && !rule.terminal) continue
    const regex = ruleRegexFor(rule, origin)
    if (!regex.test(matchLine)) continue
    if (rule.alsoRequiresRegex && !rule.alsoRequiresRegex.test(matchLine)) continue
    candidates.push({
      failureClass: rule.failureClass,
      scope: rule.scope ?? 'account',
      ambiguous: rule.ambiguous === true,
      capacity: rule.capacity === true,
      lineIndex,
      line,
      regex,
    })
  }
  return candidates
}

function collectStatusCandidates(matchLine, lineIndex, line) {
  const hasCapacityMarker = CAPACITY_MARKERS.some((regex) => regex.test(matchLine))
  const candidates = []
  for (const status of COMPILED_STATUS_CODES) {
    if (!status.regex.test(matchLine)) continue
    if (status.yieldsToCapacity && hasCapacityMarker) continue
    candidates.push({
      failureClass: status.failureClass,
      scope: 'account',
      ambiguous: status.ambiguous === true,
      capacity: false,
      lineIndex,
      line,
      regex: status.regex,
    })
  }
  return candidates
}

/** Ordem de escolha: certo antes de ambíguo, depois a precedência, depois a linha mais recente. */
function compareCandidates(left, right) {
  return (
    Number(left.ambiguous) - Number(right.ambiguous) ||
    FAILURE_PRECEDENCE.indexOf(left.failureClass) - FAILURE_PRECEDENCE.indexOf(right.failureClass) ||
    right.lineIndex - left.lineIndex
  )
}

/**
 * A linha que provou a classe, redigida e com no máximo
 * `EVIDENCE_MAX_CHARS`. A redação vem ANTES do recorte: recortar primeiro
 * poderia cortar um segredo ao meio e deixar a metade sem máscara.
 */
function buildEvidence(line, regex) {
  const redacted = redactSecrets(line)
  if (redacted.length <= EVIDENCE_MAX_CHARS) return redacted

  const anchor = Math.max(0, regex.exec(toMatchForm(redacted))?.index ?? 0)
  const start = Math.max(0, Math.min(anchor - EVIDENCE_LEAD_CHARS, redacted.length - EVIDENCE_MAX_CHARS))
  let window = redacted.slice(start, start + EVIDENCE_MAX_CHARS)
  if (start > 0) window = `…${window.slice(1)}`
  if (start + EVIDENCE_MAX_CHARS < redacted.length) window = `${window.slice(0, -1)}…`
  return window
}

function hashEvidence(providerId, failureClass, evidence) {
  return crypto
    .createHash('sha256')
    .update(`${providerId ?? ''}|${failureClass}|${toMatchForm(evidence)}`)
    .digest('hex')
    .slice(0, EVIDENCE_HASH_HEX_CHARS)
}

/**
 * Classifica a saída de uma CLI.
 *
 * @param {{
 *   text?: unknown,
 *   origin?: 'pty' | 'fluxo',
 *   providerId?: string | null,
 *   signal?: { stopped?: boolean, timedOut?: boolean } | null,
 * }} [input]
 * @returns {{
 *   failureClass: 'limit' | 'billing' | 'auth' | 'network' | 'provider' | 'timeout' | 'cancelled' | 'unknown',
 *   scope: 'account' | 'model',
 *   ambiguous: boolean,
 *   capacity: boolean,
 *   evidence: string | null,
 *   evidenceHash: string | null,
 *   notice: 'limit_reset' | null,
 *   origin: 'pty' | 'fluxo',
 *   providerId: 'claude' | 'codex' | 'gemini' | 'openia' | null,
 * }}
 */
function classifyFailure(input = {}) {
  const origin = input?.origin === 'pty' ? 'pty' : 'fluxo'
  const providerId = resolveFailureProviderId(input?.providerId)
  const base = {
    failureClass: 'unknown',
    scope: 'account',
    ambiguous: false,
    capacity: false,
    evidence: null,
    evidenceHash: null,
    notice: null,
    origin,
    providerId,
  }

  // Cancelamento é sinal estruturado (`stopped` do cli:stop), nunca texto.
  if (input?.signal?.stopped === true) {
    return { ...base, failureClass: 'cancelled' }
  }

  const provider = providerId ? COMPILED_PROVIDERS[providerId] : null
  const exclusions = provider ? provider.exclude : ALL_EXCLUSIONS
  const lines = normalizeTerminalText(input?.text)
  const candidates = []
  let notice = null

  lines.forEach((line, lineIndex) => {
    const matchLine = toMatchForm(line)
    let lineNotice = null
    for (const rule of provider?.notices ?? []) {
      if (ruleRegexFor(rule, origin).test(matchLine)) lineNotice = rule.notice
    }

    const lineCandidates = provider ? collectCandidates(matchLine, provider.include, origin, lineIndex, line) : []
    if (origin === 'fluxo') {
      lineCandidates.push(...collectCandidates(matchLine, COMPILED_GENERIC, origin, lineIndex, line))
      lineCandidates.push(...collectStatusCandidates(matchLine, lineIndex, line))
      if (APP_TIMEOUT_PATTERN.test(matchLine)) {
        lineCandidates.push({
          failureClass: 'timeout',
          scope: 'account',
          ambiguous: false,
          capacity: false,
          lineIndex,
          line,
          regex: APP_TIMEOUT_PATTERN,
        })
      }
    }

    // A exclusão anula a linha inteira. Conferida só quando a linha trouxe
    // algo: o resultado é o mesmo de conferir antes, e a linha comum (quase
    // todas, no terminal) não paga as regex de exclusão.
    if (lineNotice === null && lineCandidates.length === 0) return
    if (exclusions.some((regex) => regex.test(matchLine))) return

    if (lineNotice !== null) notice = lineNotice
    candidates.push(...lineCandidates)
  })

  if (input?.signal?.timedOut === true) {
    candidates.push({ failureClass: 'timeout', scope: 'account', ambiguous: false, capacity: false, lineIndex: -1 })
  }

  const chosen = candidates.sort(compareCandidates)[0]
  if (!chosen) {
    return { ...base, notice }
  }

  const evidence = chosen.line === undefined ? null : buildEvidence(chosen.line, chosen.regex)
  return {
    ...base,
    failureClass: chosen.failureClass,
    scope: chosen.scope,
    ambiguous: chosen.ambiguous,
    capacity: chosen.capacity,
    evidence,
    evidenceHash: evidence === null ? null : hashEvidence(providerId, chosen.failureClass, evidence),
    notice,
  }
}

module.exports = {
  FAILURE_CLASSES,
  FAILURE_PRECEDENCE,
  classifyFailure,
  hasTerminalPatterns,
  normalizeTerminalText,
  resolveFailureProviderId,
}

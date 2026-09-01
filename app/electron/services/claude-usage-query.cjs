'use strict'

const os = require('node:os')
const platform = require('../core/platform/index.cjs')
const { createCliEnv } = require('./cli-process-manager.cjs')
const { redactSecrets } = require('./official-cli-account-status.cjs')
const {
  createPtyLaunchSpec,
  resolvePtyCommand,
  resolveWindowsCodexPath,
} = require('./pty-process-manager.cjs')
const { ensureNodePtySpawnHelperExecutable } = require('./pty-native-assets.cjs')

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_STARTUP_FALLBACK_MS = 8_000
const DEFAULT_NAVIGATION_DELAY_MS = 120
const DEFAULT_RESULT_SETTLE_MS = 1_200
const DEFAULT_COLS = 160
const DEFAULT_ROWS = 60
const MAX_OUTPUT_CHARS = 200_000
const RIGHT_ARROW = '\u001b[C'
const STATUS_TAB_HEADER_PATTERN = /^Settings\s+Status\s+Config\s+Usage\s+Stats$/i

const CLAUDE_STATUS_ARGS = Object.freeze([
  '--safe-mode',
  '--tools',
  '',
  '--setting-sources',
  'user',
])

/**
 * Consulta a aba Usage do `/status` em uma sessão interativa descartável.
 *
 * A CLI não oferece uma subcommand de quota nem uma saída JSON para esta tela:
 * ela só busca os valores atuais quando o slash command é executado dentro de
 * uma sessão com TTY. Esta consulta usa um PTY separado, em /tmp, envia apenas
 * `/status` e navega até Usage; nunca escreve no terminal aberto da pessoa.
 *
 * @param {object} [dependencies]
 * @param {(file: string, args: string[], options: object) => object} [dependencies.spawnPty]
 * @param {() => number} [dependencies.now]
 * @param {typeof platform} [dependencies.platform]
 * @param {(command: string, env: Record<string, string>) => string | null} [dependencies.resolveCodexPath]
 * @returns {(options?: object) => Promise<object>}
 */
function createClaudeUsageQuery({
  spawnPty,
  now = () => Date.now(),
  platform: platformAdapter = platform,
  resolveCodexPath = resolveWindowsCodexPath,
} = {}) {
  return function queryClaudeUsage({
    env: accountEnv = {},
    cwd = os.tmpdir(),
    timeoutMs = DEFAULT_TIMEOUT_MS,
    startupFallbackMs = DEFAULT_STARTUP_FALLBACK_MS,
    navigationDelayMs = DEFAULT_NAVIGATION_DELAY_MS,
    resultSettleMs = DEFAULT_RESULT_SETTLE_MS,
  } = {}) {
    return new Promise((resolve) => {
      const queryEnv = createCliEnv({ ...process.env, ...accountEnv })
      // A quota check must not create a resumable conversation just to read a
      // local status view. This flag is supported by Claude Code and also
      // makes the query safe to repeat from the refresh button.
      queryEnv.CLAUDE_CODE_SKIP_PROMPT_HISTORY = '1'
      const launchCommand = resolvePtyCommand(
        'claude',
        true,
        queryEnv,
        platformAdapter,
        resolveCodexPath,
      )
      const launch = createPtyLaunchSpec(
        launchCommand,
        CLAUDE_STATUS_ARGS,
        queryEnv,
        platformAdapter,
      )

      let ptyProcess
      let output = ''
      let statusSent = false
      let navigationScheduled = false
      let settled = false
      let exited = false
      let lastSignature = null
      let resultTimer = null
      let startupTimer = null
      const navigationTimers = []

      const clearTimers = () => {
        if (resultTimer) {
          clearTimeout(resultTimer)
          resultTimer = null
        }
        if (startupTimer) {
          clearTimeout(startupTimer)
          startupTimer = null
        }
        for (const timer of navigationTimers) {
          clearTimeout(timer)
        }
        navigationTimers.length = 0
      }

      const finish = (result, shouldKill = true) => {
        if (settled) {
          return
        }

        settled = true
        clearTimers()

        if (shouldKill && !exited) {
          try {
            ptyProcess?.kill?.()
          } catch {
            // O resultado da consulta não depende da forma de encerramento do
            // PTY; o timeout também impede qualquer processo órfão.
          }
        }

        resolve(result)
      }

      const fail = (message) =>
        finish({
          ok: false,
          collectedAt: null,
          measuredAt: null,
          metrics: [],
          details: null,
          message,
        })

      const write = (data) => {
        if (settled || exited) {
          return
        }

        try {
          ptyProcess.write(data)
        } catch {
          fail('A sessão descartável do Claude não aceitou a consulta.')
        }
      }

      const sendStatus = () => {
        if (statusSent || settled) {
          return
        }

        statusSent = true
        write('/status\r')
      }

      const scheduleNavigation = () => {
        if (navigationScheduled || settled) {
          return
        }

        navigationScheduled = true
        navigationTimers.push(
          setTimeout(() => write(RIGHT_ARROW), navigationDelayMs),
          setTimeout(() => write(RIGHT_ARROW), navigationDelayMs * 2),
        )
      }

      const settleParsedResult = (parsed, visible) => {
        if ((!parsed.metrics.length && !parsed.details?.usage) || settled) {
          return
        }

        // A tela pinta os percentuais primeiro e carrega a atribuição das
        // últimas 24 h depois. Esperar esse marcador evita devolver o painel
        // no meio do redesenho, sem as linhas que o usuário pediu.
        if (!hasCompleteClaudeUsage(visible)) {
          return
        }

        const signature = JSON.stringify({
          metrics: parsed.metrics,
          details: parsed.details,
        })
        if (signature === lastSignature) {
          return
        }

        lastSignature = signature
        if (resultTimer) {
          clearTimeout(resultTimer)
        }
        resultTimer = setTimeout(() => {
          const measuredAt = toIso(now())
          finish({
            ok: true,
            collectedAt: measuredAt,
            measuredAt,
            metrics: parsed.metrics,
            details: parsed.details,
            message: null,
          })
          resultTimer = null
        }, resultSettleMs)
      }

      try {
        const factory = spawnPty ?? loadNodePtySpawn(platformAdapter.name)
        ptyProcess = factory(launch.command, launch.args, {
          name: 'xterm-256color',
          cols: DEFAULT_COLS,
          rows: DEFAULT_ROWS,
          cwd,
          env: queryEnv,
        })
      } catch {
        fail('Não foi possível iniciar a consulta ao /status do Claude.')
        return
      }

      ptyProcess.onData((data) => {
        if (settled) {
          return
        }

        output = `${output}${String(data)}`.slice(-MAX_OUTPUT_CHARS)
        const visible = renderClaudeTerminalOutput(output)

        // The prompt marker is stable across Claude Code versions, but the
        // fallback below covers a slow start or a screen-reader variation.
        if (!statusSent && hasClaudePrompt(visible)) {
          sendStatus()
        }

        if (statusSent && hasStatusTabs(visible)) {
          scheduleNavigation()
        }

        if (statusSent && navigationScheduled) {
          settleParsedResult(parseClaudeUsageOutput(output, { now }), visible)
        }
      })

      ptyProcess.onExit(() => {
        exited = true
        if (settled) {
          return
        }

        const parsed = parseClaudeUsageOutput(
          output,
          { now },
        )
        if (parsed.metrics.length || parsed.details?.usage) {
          const measuredAt = toIso(now())
          finish({
            ok: true,
            collectedAt: measuredAt,
            measuredAt,
            metrics: parsed.metrics,
            details: parsed.details,
            message: null,
          }, false)
          return
        }

        fail('O /status do Claude não retornou os limites de uso.')
      })

      startupTimer = setTimeout(sendStatus, startupFallbackMs)
      const timeoutTimer = setTimeout(() => {
        fail('A consulta ao /status do Claude excedeu o tempo limite.')
      }, timeoutMs)
      // `finish` clears this timer through the same path as the other timers.
      navigationTimers.push(timeoutTimer)
    })
  }
}

const queryClaudeUsage = createClaudeUsageQuery()

function loadNodePtySpawn(platformName = process.platform) {
  // A consulta de Usage cria uma PTY própria, fora do PtyProcessManager. Ela
  // precisa preparar o mesmo helper que o terminal do Canvas prepara: o
  // tarball do node-pty pode trazer o spawn-helper do macOS sem bit executável,
  // e nesse caso `posix_spawnp` falha antes de a CLI emitir qualquer saída.
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

function parseClaudeUsageOutput(output, { now = () => Date.now() } = {}) {
  // Mesmo sendo uma sessão local e descartável, a saída atravessa a fronteira
  // do processo principal até o banco/renderer. Redigir antes de extrair os
  // campos impede que uma versão futura da CLI publique um token em uma linha
  // que ainda não conhecemos.
  const text = redactSecrets(renderClaudeTerminalOutput(output))
  const metrics = []

  const currentSession = lastUsageMatch(
    text,
    /Current\s*session[\s\S]{0,320}?(\d+(?:[.,]\d+)?)\s*%\s*used/gi,
  )
  if (currentSession) {
    metrics.push(
      createClaudeMetric({
        key: 'rate_limits.five_hour',
        label: 'Janela de 5 horas',
        percent: currentSession.percent,
        resetAt: readResetAfter(text, currentSession, now),
      }),
    )
  }

  const currentWeek = lastUsageMatch(
    text,
    /Current\s*week\s*\(\s*all\s*models\s*\)[\s\S]{0,420}?(\d+(?:[.,]\d+)?)\s*%\s*used/gi,
  )
  if (currentWeek) {
    metrics.push(
      createClaudeMetric({
        key: 'rate_limits.seven_day',
        label: 'Janela de 7 dias',
        percent: currentWeek.percent,
        resetAt: readResetAfter(text, currentWeek, now),
      }),
    )
  }

  return {
    metrics,
    details: parseClaudeStatusDetails(text, {
      currentSession,
      currentWeek,
      now,
    }),
  }
}

/**
 * Retém o Status inteiro e todos os textos da aba Usage que a CLI publicou.
 * Os campos estruturados alimentam o resumo; `lines` funciona como uma rede
 * de segurança para que uma linha nova de uma versão futura não desapareça
 * simplesmente porque o parser ainda não conhece o rótulo.
 */
function parseClaudeStatusDetails(text, { currentSession, currentWeek, now }) {
  const status = compactObject({
    version: readLastLabeledValue(text, 'Version'),
    sessionName: readLastLabeledValue(text, 'Session name'),
    sessionId: readLastLabeledValue(text, 'Session ID'),
    sessionKind: readLastLabeledValue(text, 'Session kind'),
    peerAddress: readLastLabeledValue(text, 'Peer address'),
    cwd: readLastLabeledValue(text, 'cwd'),
    loginMethod: readLastLabeledValue(text, 'Login method'),
    organization: readLastLabeledValue(text, 'Organization'),
    email: readLastLabeledValue(text, 'Email'),
    web: readLastLabeledValue(text, 'Web'),
    model: readLastLabeledValue(text, 'Model'),
    settingSources: readLastLabeledValue(text, 'Setting sources'),
    lines: extractTabFrameLines(text, 'first').filter(
      (line) => !/^Esc to cancel$/i.test(line),
    ),
  })

  const sessionStats = compactObject({
    totalCost: readLastLabeledValue(text, 'Total cost'),
    totalDurationApi: readLastLabeledValue(text, 'Total duration (API)'),
    totalDurationWall: readLastLabeledValue(text, 'Total duration (wall)'),
    totalCodeChanges: readLastLabeledValue(text, 'Total code changes'),
    usage: readLastLabeledValue(text, 'Usage'),
    usageByModel: readLastLabeledValue(text, 'Usage by model'),
  })

  const usage = compactObject({
    sessionStats: Object.keys(sessionStats).length ? sessionStats : undefined,
    currentSession: createUsageWindowDetails(text, currentSession, now),
    currentWeek: createUsageWindowDetails(text, currentWeek, now),
    promotion: findLastLine(text, /^\+.*(?:promo|promotion).*$/i),
    explanation: readFollowingLine(text, /What's contributing to your limits usage\?/i),
    attribution: collectAttributionLines(text),
    activity: collectActivityLines(text),
    usageCredits: collectSectionLines(
      text,
      /^Usage credits$/i,
      /^(?:Status|Config|Usage|Stats)$/i,
    ),
    lines: extractTabFrameLines(text, 'last'),
  })

  return compactObject({
    status: Object.keys(status).length ? status : undefined,
    usage: Object.keys(usage).length ? usage : undefined,
  })
}

function createUsageWindowDetails(text, match, now) {
  if (!match) {
    return undefined
  }

  return compactObject({
    used: match.percent,
    resetAt: readResetAfter(text, match, now),
    resetText: readResetTextAfter(text, match),
  })
}

function readLastLabeledValue(text, label) {
  const escaped = String(label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`^\\s*${escaped}\\s*:\\s*(.*?)\\s*$`, 'i')
  const lines = normalizedLines(text)

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const match = lines[index].match(pattern)
    if (match?.[1]) {
      return cleanStatusValue(match[1])
    }
  }

  return undefined
}

function readFollowingLine(text, headingPattern) {
  const lines = normalizedLines(text)

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (!headingPattern.test(lines[index])) {
      continue
    }

    const next = lines[index + 1]
    return next ? cleanStatusValue(next) : undefined
  }

  return undefined
}

function findLastLine(text, pattern) {
  const lines = normalizedLines(text)

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (pattern.test(lines[index])) {
      return cleanStatusValue(lines[index])
    }
  }

  return undefined
}

function collectAttributionLines(text) {
  return collectMatchingLines(
    text,
    /^(?:Approximate|does not include|doesn't include|No attribution data)/i,
  )
}

function collectActivityLines(text) {
  const lines = normalizedLines(text)
  const start = lastIndexOfLine(lines, /^Last 24h.*(?:usage|affecting|contributing)/i)
  const end = lastIndexOfLine(lines, /^Usage credits$/i)

  if (start < 0) {
    return []
  }

  const last = end > start ? end : lines.length
  return uniqueStatusLines(lines.slice(start + 1, last))
    .filter((line) => !/^Last 24h/i.test(line))
    .filter((line) => !/^d to day\s*·\s*w to week$/i.test(line))
    .slice(0, 32)
}

function collectSectionLines(text, headingPattern, endPattern = null) {
  const lines = normalizedLines(text)
  const start = lastIndexOfLine(lines, headingPattern)

  if (start < 0) {
    return []
  }

  const remaining = lines.slice(start + 1)
  const end = endPattern
    ? remaining.findIndex((line) => endPattern.test(line))
    : -1
  return uniqueStatusLines(end >= 0 ? remaining.slice(0, end) : remaining)
    .filter((line) => !/^Esc to cancel$/i.test(line))
    .slice(0, 32)
}

function extractSectionLines(text, headingPattern, endPattern) {
  const lines = normalizedLines(text)
  const start = lastIndexOfLine(lines, headingPattern)

  if (start < 0) {
    return []
  }

  const remaining = lines.slice(start + 1)
  const end = remaining.findIndex((line) => endPattern.test(line))
  return uniqueStatusLines(end >= 0 ? remaining.slice(0, end) : remaining)
    .slice(0, 64)
}

function extractTabFrameLines(text, occurrence) {
  const lines = normalizedLines(text)
  const headers = []

  for (let index = 0; index < lines.length; index += 1) {
    if (STATUS_TAB_HEADER_PATTERN.test(lines[index])) {
      headers.push(index)
    }
  }

  if (headers.length === 0) {
    return []
  }

  const headerIndex = occurrence === 'first' ? headers[0] : headers.at(-1)
  const nextHeader = headers.find((index) => index > headerIndex)
  const end = nextHeader ?? lines.length

  return uniqueStatusLines(lines.slice(headerIndex + 1, end)).slice(0, 64)
}

function collectMatchingLines(text, pattern) {
  return uniqueStatusLines(normalizedLines(text).filter((line) => pattern.test(line)))
    .slice(0, 32)
}

function lastIndexOfLine(lines, pattern) {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (pattern.test(lines[index])) {
      return index
    }
  }

  return -1
}

function normalizedLines(text) {
  return String(text)
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line && !/^❯$/.test(line))
}

function uniqueStatusLines(lines) {
  const seen = new Set()
  const unique = []

  for (const line of lines) {
    const value = cleanStatusValue(line)
    if (!value || seen.has(value)) {
      continue
    }
    seen.add(value)
    unique.push(value)
  }

  return unique
}

function cleanStatusValue(value) {
  const cleaned = redactSecrets(String(value ?? ''))
    .replace(/\s+/g, ' ')
    .trim()

  return cleaned && cleaned !== '[oculto]' ? cleaned.slice(0, 500) : undefined
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => {
      if (Array.isArray(item)) {
        return item.length > 0
      }
      return item !== undefined && item !== null && item !== ''
    }),
  )
}

function lastUsageMatch(text, pattern) {
  const matches = [...text.matchAll(pattern)]
  const match = matches.at(-1)

  if (!match) {
    return null
  }

  const percent = Number(String(match[1]).replace(',', '.'))
  return Number.isFinite(percent)
    ? { index: match.index ?? 0, end: (match.index ?? 0) + match[0].length, percent }
    : null
}

function createClaudeMetric({ key, label, percent, resetAt }) {
  return {
    key,
    label,
    used: percent,
    limit: 100,
    remaining: Math.max(0, 100 - percent),
    unit: '%',
    precision: 'percentage',
    resetAt,
  }
}

function readResetAfter(text, match, now) {
  const direct = findResetText(readWindowTail(text, match))
  const previous = direct ? null : findPreviousWindowReset(text, match)
  const found = direct ?? previous

  return found ? parseClaudeReset(found.value, now(), found.timeZone) : null
}

function readResetTextAfter(text, match) {
  const direct = findResetText(readWindowTail(text, match))
  const previous = direct ? null : findPreviousWindowReset(text, match)
  return (direct ?? previous)?.text
}

function readWindowTail(text, match) {
  const tail = String(text).slice(match.end, match.end + 260)
  const nextWindow = tail.search(/\n\s*Current\s*(?:session|week)\b/i)
  return nextWindow >= 0 ? tail.slice(0, nextWindow) : tail
}

function findResetText(text) {
  const reset = String(text).match(
    /Resets?\s*((?:[A-Za-z]{3,9}\s+\d{1,2}(?:,\s*\d{4})?(?:,\s*)?\d{1,2}(?::\d{2})?\s*[ap]m)|(?:\d{1,2}(?::\d{2})?\s*[ap]m))/i,
  )
  if (!reset) {
    return null
  }

  const timeZone = String(text)
    .slice(reset.index + reset[0].length)
    .match(/^\s*\(([^)]+)\)/)?.[1]

  return {
    value: reset[1],
    timeZone: timeZone ?? null,
    text: cleanStatusValue(reset[0] + (timeZone ? ` (${timeZone})` : '')),
  }
}

/**
 * Algumas versões deixam o reset da sessão atual fora da última repintura,
 * embora ele tenha sido mostrado no frame anterior. Reusa somente o reset da
 * mesma janela (nunca o da semana) nesses casos.
 */
function findPreviousWindowReset(text, match) {
  const isWeek = /^Current\s*week/i.test(String(text).slice(match.index, match.index + 80))
  const sectionPattern = isWeek
    ? /Current\s*week\s*\(\s*all\s*models\s*\)/gi
    : /Current\s*session/gi
  const sections = [...String(text).matchAll(sectionPattern)]
  const currentIndex = sections.findIndex(({ index }) => index === match.index)

  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    const section = sections[index]
    const sectionTail = String(text).slice(section.index, section.index + 700)
    const nextWindow = sectionTail
      .slice(section[0].length)
      .search(/\n\s*Current\s*(?:session|week)\b/i)
    const bounded = nextWindow >= 0
      ? sectionTail.slice(0, section[0].length + nextWindow)
      : sectionTail
    const found = findResetText(bounded)

    if (found) {
      return found
    }
  }

  return null
}

function parseClaudeReset(value, nowMs, timeZone = null) {
  const text = String(value).replace(/\s+/g, ' ').trim()
  const dateMatch = text.match(
    /^([A-Za-z]{3,9})\s+(\d{1,2})(?:,\s*(\d{4}))?(?:,\s*)?(\d{1,2})(?::(\d{2}))?\s*([ap]m)$/i,
  )
  const clockMatch = text.match(
    /^(\d{1,2})(?::(\d{2}))?\s*([ap]m)$/i,
  )

  if (!dateMatch && !clockMatch) {
    return null
  }

  const current = timeZone
    ? getDatePartsInTimeZone(Number(nowMs), timeZone)
    : getLocalDateParts(Number(nowMs))
  if (!current) {
    return null
  }

  const year = dateMatch ? Number(dateMatch[3] ?? current.year) : current.year
  const month = dateMatch ? monthNumber(dateMatch[1]) : current.month
  const day = dateMatch ? Number(dateMatch[2]) : current.day
  const hour = to24Hour(
    Number(dateMatch ? dateMatch[4] : clockMatch[1]),
    dateMatch ? dateMatch[6] : clockMatch[3],
  )
  const minute = Number(dateMatch ? dateMatch[5] ?? 0 : clockMatch[2] ?? 0)

  if (month === null || !Number.isFinite(day) || !Number.isFinite(hour)) {
    return null
  }

  let target = { year, month, day, hour, minute }
  if (
    !dateMatch &&
    (hour < current.hour || (hour === current.hour && minute <= current.minute))
  ) {
    target = shiftCalendarDay(target, 1)
  }

  const timestamp = timeZone
    ? zonedDateToTimestamp(target, timeZone)
    : new Date(
        target.year,
        target.month,
        target.day,
        target.hour,
        target.minute,
        0,
        0,
      ).getTime()

  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
}

function getLocalDateParts(timestamp) {
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime())
    ? null
    : {
        year: date.getFullYear(),
        month: date.getMonth(),
        day: date.getDate(),
        hour: date.getHours(),
        minute: date.getMinutes(),
      }
}

function getDatePartsInTimeZone(timestamp, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      calendar: 'gregory',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(new Date(timestamp))
    const values = Object.fromEntries(
      parts
        .filter(({ type }) => type !== 'literal')
        .map(({ type, value }) => [type, Number(value)]),
    )

    return {
      year: values.year,
      month: values.month - 1,
      day: values.day,
      hour: values.hour,
      minute: values.minute,
    }
  } catch {
    return null
  }
}

function shiftCalendarDay(value, days) {
  const date = new Date(Date.UTC(value.year, value.month, value.day + days))
  return {
    ...value,
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
    day: date.getUTCDate(),
  }
}

/** Converte componentes de uma data local do fuso informado para UTC. */
function zonedDateToTimestamp(value, timeZone) {
  let guess = Date.UTC(
    value.year,
    value.month,
    value.day,
    value.hour,
    value.minute,
  )

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = getDatePartsInTimeZone(guess, timeZone)
    if (!actual) {
      return NaN
    }

    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month,
      actual.day,
      actual.hour,
      actual.minute,
    )
    const desiredAsUtc = Date.UTC(
      value.year,
      value.month,
      value.day,
      value.hour,
      value.minute,
    )
    const difference = desiredAsUtc - actualAsUtc
    guess += difference

    if (difference === 0) {
      break
    }
  }

  return guess
}

function monthNumber(value) {
  const month = String(value).slice(0, 3).toLowerCase()
  const index = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(month)
  return index >= 0 ? index : null
}

function to24Hour(value, meridiem) {
  if (!Number.isFinite(value) || value < 1 || value > 12) {
    return NaN
  }

  const normalized = String(meridiem).toLowerCase()
  if (normalized === 'am') {
    return value === 12 ? 0 : value
  }

  return value === 12 ? 12 : value + 12
}

function hasClaudePrompt(text) {
  return /(?:^|\n)\s*❯(?:\s|$)/u.test(text)
}

function hasStatusTabs(text) {
  return text.replace(/\s+/g, '').includes('SettingsStatusConfigUsageStats')
}

function hasCompleteClaudeUsage(text) {
  const frame = extractTabFrameLines(text, 'last')
  const normalized = frame.length ? frame : normalizedLines(text)
  const hasAttribution = normalized.some((line) =>
    /Last 24h|No attribution data yet/i.test(line),
  )
  const stillLoading = normalized.some((line) =>
    /Scanning local sessions|Refreshing|Loading/i.test(line),
  )

  return hasAttribution && !stillLoading
}

function stripClaudeTerminalOutput(value) {
  return String(value ?? '')
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '')
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\u001b[()][0-2A-Z]/g, '')
    .replace(/\u001b./g, '')
    .replace(/\r/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
}

/**
 * Reconstitui o texto de uma tela ANSI. O Claude usa cursor absoluto para
 * desenhar o `/status`; simplesmente remover `\x1b[22G` cola "Session" e
 * "ID" ou perde os valores que estavam em colunas diferentes.
 *
 * Além da tela atual, guarda os frames anteriores separados por uma linha.
 * Assim o parser ainda consegue ler Status depois que a navegação já mudou
 * para Config/Usage.
 */
function renderClaudeTerminalOutput(value, { cols = DEFAULT_COLS, rows = DEFAULT_ROWS } = {}) {
  const input = String(value ?? '')
  const screen = Array.from({ length: rows }, () => Array(cols).fill(' '))
  const saved = { row: 0, col: 0 }
  const frames = []
  let row = 0
  let col = 0
  let index = 0

  const clampCursor = () => {
    row = Math.max(0, Math.min(rows - 1, row))
    col = Math.max(0, Math.min(cols - 1, col))
  }

  const snapshot = () => {
    const frame = screen.map((line) => line.join('').replace(/\s+$/g, '')).join('\n').trim()
    if (frame && frames.at(-1) !== frame) {
      frames.push(frame)
    }
  }

  const clearScreen = () => {
    for (const line of screen) {
      line.fill(' ')
    }
  }

  const clearLine = (mode = 0) => {
    if (mode === 2) {
      screen[row].fill(' ')
      return
    }

    if (mode === 1) {
      screen[row].fill(' ', 0, col + 1)
      return
    }

    screen[row].fill(' ', col)
  }

  const params = (raw) => {
    const normalized = String(raw ?? '').replace(/^\?/, '')
    return normalized
      ? normalized.split(';').map((item) => Number.parseInt(item, 10) || 0)
      : []
  }

  while (index < input.length) {
    const character = input[index]

    if (character === '\u001b') {
      if (input[index + 1] === ']') {
        const bell = input.indexOf('\u0007', index + 2)
        const stringTerminator = input.indexOf('\u001b\\', index + 2)
        if (bell >= 0 && (stringTerminator < 0 || bell < stringTerminator)) {
          index = bell + 1
        } else if (stringTerminator >= 0) {
          index = stringTerminator + 2
        } else {
          index = input.length
        }
        continue
      }

      if (input[index + 1] === '[') {
        const sequence = input.slice(index).match(/^\u001b\[([0-?]*)([ -/]*)([@-~])/)
        if (sequence) {
          const rawParameters = sequence[1]
          const command = sequence[3]
          const values = params(rawParameters)
          const amount = values[0] || 1

          if (command === 'H' || command === 'f') {
            if (!rawParameters && command === 'H' && screen.some((line) => line.some((cell) => cell !== ' '))) {
              snapshot()
            }
            row = (values[0] || 1) - 1
            col = (values[1] || 1) - 1
            clampCursor()
          } else if (command === 'A') {
            row -= amount
            clampCursor()
          } else if (command === 'B' || command === 'e') {
            row += amount
            clampCursor()
          } else if (command === 'C' || command === 'a') {
            col += amount
            clampCursor()
          } else if (command === 'D') {
            col -= amount
            clampCursor()
          } else if (command === 'G' || command === '`') {
            col = (values[0] || 1) - 1
            clampCursor()
          } else if (command === 'd') {
            row = (values[0] || 1) - 1
            clampCursor()
          } else if (command === 'J') {
            if ((values[0] || 0) === 2 || (values[0] || 0) === 3) {
              snapshot()
              clearScreen()
              row = 0
              col = 0
            }
          } else if (command === 'K') {
            clearLine(values[0] || 0)
          } else if (command === 's') {
            saved.row = row
            saved.col = col
          } else if (command === 'u') {
            row = saved.row
            col = saved.col
            clampCursor()
          }

          index += sequence[0].length
          continue
        }
      }

      if (input[index + 1] === '7') {
        saved.row = row
        saved.col = col
        index += 2
        continue
      }

      if (input[index + 1] === '8') {
        row = saved.row
        col = saved.col
        clampCursor()
        index += 2
        continue
      }

      index += 2
      continue
    }

    if (character === '\r') {
      col = 0
    } else if (character === '\n') {
      row += 1
      col = 0
      clampCursor()
    } else if (character === '\b') {
      col = Math.max(0, col - 1)
    } else if (character >= ' ' && character !== '\u007f') {
      if (row >= 0 && row < rows && col >= 0 && col < cols) {
        screen[row][col] = character
      }
      col += 1
      clampCursor()
    }

    index += 1
  }

  snapshot()
  return frames.join('\n\n')
}

function toIso(value) {
  const timestamp = Number(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date().toISOString()
}

module.exports = {
  CLAUDE_STATUS_ARGS,
  createClaudeUsageQuery,
  hasStatusTabs,
  hasCompleteClaudeUsage,
  parseClaudeReset,
  parseClaudeStatusDetails,
  parseClaudeUsageOutput,
  queryClaudeUsage,
  renderClaudeTerminalOutput,
  stripClaudeTerminalOutput,
}

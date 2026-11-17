'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  createClaudeStatuslineScript,
} = require('./claude-statusline-script.cjs')

/**
 * Coleta de rate limit do Claude Code pela status line.
 *
 * O Claude Code não publica quota em comando nenhum: `claude auth status` traz
 * conta e plano, e só. Os percentuais existem no JSON que ele envia para a
 * status line depois de cada chamada de API — verificado numa sessão real:
 * `rate_limits.five_hour.used_percentage` e `seven_day`, com `resets_at`.
 *
 * Ligar isso mexe em `~/.claude/settings.json`, que é configuração da pessoa e
 * não do app. Por isso a instalação é explícita, nunca automática; preserva uma
 * status line já configurada em vez de sobrescrever; e a desinstalação devolve
 * exatamente o que havia antes.
 */

const SCRIPT_NAME = 'felixo-statusline.cjs'
const CAPTURE_NAME = 'rate-limits.json'
const SESSION_SCRIPT_NAME = 'felixo-session-statusline.cjs'
const SESSION_SETTINGS_NAME = 'session-settings.json'
const SESSIONS_DIR_NAME = 'sessions'
const BACKUP_KEY = 'felixoPreviousStatusLine'
const OWNER_KEY = 'felixoManaged'

function createClaudeStatuslineService({
  homeDir = os.homedir(),
  baseDir,
  fileSystem = fs,
} = {}) {
  const settingsPath = path.join(homeDir, '.claude', 'settings.json')
  const scriptPath = path.join(baseDir, SCRIPT_NAME)
  const capturePath = path.join(baseDir, CAPTURE_NAME)
  const sessionsDir = path.join(baseDir, SESSIONS_DIR_NAME)
  const sessionScriptPath = path.join(baseDir, SESSION_SCRIPT_NAME)
  const sessionSettingsPath = path.join(baseDir, SESSION_SETTINGS_NAME)

  function readSettings() {
    try {
      const parsed = JSON.parse(fileSystem.readFileSync(settingsPath, 'utf8'))
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return null
    }
  }

  function writeSettings(settings) {
    fileSystem.mkdirSync(path.dirname(settingsPath), { recursive: true })
    fileSystem.writeFileSync(
      settingsPath,
      `${JSON.stringify(settings, null, 2)}\n`,
      'utf8',
    )
  }

  /**
   * É do app a status line que ele marcou ou cujo comando chama o script desta pasta: a marca
   * some quando outra ferramenta regrava o settings.json (aconteceu em 14/10/2026), e o painel
   * passava a chamar de "alheio" o próprio script, sem jeito de desligar.
   */
  function isManagedByApp(statusLine) {
    if (!statusLine || typeof statusLine !== 'object') {
      return false
    }
    if (statusLine[OWNER_KEY] === true) {
      return true
    }
    const commandScript = scriptPathInCommand(statusLine.command)
    return Boolean(commandScript) && samePath(commandScript, scriptPath)
  }

  function status() {
    const settings = readSettings()

    if (settings === null) {
      return {
        installed: false,
        settingsReadable: false,
        conflictingStatusLine: false,
      }
    }

    const statusLine = settings.statusLine

    return {
      installed: isManagedByApp(statusLine),
      settingsReadable: true,
      // Status line de terceiro: instalar por cima apagaria o que a pessoa
      // configurou, então a instalação para aqui e explica.
      conflictingStatusLine: Boolean(statusLine) && !isManagedByApp(statusLine),
    }
  }

  function install() {
    const settings = readSettings()

    if (settings === null) {
      return {
        ok: false,
        message:
          'Não foi possível ler ~/.claude/settings.json; nada foi alterado.',
      }
    }

    const current = status()

    if (current.conflictingStatusLine) {
      return {
        ok: false,
        message:
          'Já existe uma status line configurada no Claude Code. Remova-a antes, para o app não sobrescrever a sua.',
      }
    }

    try {
      fileSystem.mkdirSync(baseDir, { recursive: true })
      fileSystem.writeFileSync(
        scriptPath,
        createClaudeStatuslineScript(capturePath),
        'utf8',
      )
    } catch {
      return {
        ok: false,
        message: 'Não foi possível gravar o script da status line.',
      }
    }

    try {
      writeSettings({
        ...settings,
        statusLine: {
          type: 'command',
          command: `node ${JSON.stringify(scriptPath)}`,
          [OWNER_KEY]: true,
          // Guardado para a desinstalação devolver o estado anterior, mesmo
          // que ele fosse "não existia". Religar por cima da própria status line
          // mantém o anterior dela: guardá-la como anterior faria o desligar religar.
          [BACKUP_KEY]: isManagedByApp(settings.statusLine)
            ? settings.statusLine[BACKUP_KEY] ?? null
            : settings.statusLine ?? null,
        },
      })
    } catch {
      return {
        ok: false,
        message: 'Não foi possível escrever em ~/.claude/settings.json.',
      }
    }

    return {
      ok: true,
      message:
        'Coleta ligada. Os percentuais aparecem depois da próxima resposta de uma sessão do Claude Code.',
    }
  }

  function uninstall() {
    const settings = readSettings()

    if (settings === null) {
      return {
        ok: false,
        message: 'Não foi possível ler ~/.claude/settings.json.',
      }
    }

    if (!isManagedByApp(settings.statusLine)) {
      return { ok: true, message: 'A coleta já estava desligada.' }
    }

    const previous = settings.statusLine[BACKUP_KEY] ?? null
    const next = { ...settings }

    if (previous) {
      next.statusLine = previous
    } else {
      delete next.statusLine
    }

    try {
      writeSettings(next)
    } catch {
      return {
        ok: false,
        message: 'Não foi possível escrever em ~/.claude/settings.json.',
      }
    }

    try {
      fileSystem.rmSync(scriptPath, { force: true })
    } catch {
      // O script órfão não faz nada sem a configuração que o chamava.
    }

    return { ok: true, message: 'Coleta desligada e status line restaurada.' }
  }

  /**
   * Último rate limit capturado. Devolve o horário da medição junto, porque a
   * status line só roda quando há sessão do Claude respondendo — entre sessões
   * o valor continua sendo o último conhecido.
   */
  function readCapture() {
    try {
      const parsed = JSON.parse(fileSystem.readFileSync(capturePath, 'utf8'))

      if (!parsed?.rateLimits || typeof parsed.rateLimits !== 'object') {
        return null
      }

      return {
        measuredAt:
          typeof parsed.measuredAt === 'string' ? parsed.measuredAt : null,
        rateLimits: parsed.rateLimits,
      }
    } catch {
      return null
    }
  }

  /**
   * Prepara a captura por terminal: o app lança o Claude com `--settings <este arquivo>`, que
   * liga a status line só naquele processo (vale também para perfil com CLAUDE_CONFIG_DIR) e
   * não toca o `settings.json` da pessoa. Script próprio, para o "desligar" da coleta global
   * não apagar o script de terminais vivos. Devolve `null` se não deu para gravar.
   */
  function sessionLaunch() {
    try {
      fileSystem.mkdirSync(baseDir, { recursive: true })
      fileSystem.writeFileSync(
        sessionScriptPath,
        createClaudeStatuslineScript(capturePath, { sessionsDir }),
        'utf8',
      )
      fileSystem.writeFileSync(
        sessionSettingsPath,
        JSON.stringify({
          statusLine: { type: 'command', command: `node ${JSON.stringify(sessionScriptPath)}` },
        }),
        'utf8',
      )
      return { settingsPath: sessionSettingsPath, sessionsDir }
    } catch {
      return null
    }
  }

  return {
    capturePath,
    sessionsDir,
    sessionLaunch,
    install,
    readCapture,
    scriptPath,
    status,
    uninstall,
  }
}

/** O caminho no `command` que o próprio app grava: `node "<caminho em JSON>"`. */
function scriptPathInCommand(command) {
  const match = /^node\s+("(?:[^"\\]|\\.)*")\s*$/.exec(String(command ?? '').trim())
  if (!match) {
    return null
  }
  try {
    return JSON.parse(match[1])
  } catch {
    return null
  }
}

function samePath(left, right) {
  const a = path.resolve(left)
  const b = path.resolve(right)
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}

module.exports = {
  createClaudeStatuslineService,
}

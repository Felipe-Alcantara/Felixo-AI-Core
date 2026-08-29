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

  /** O app só reconhece como sua a status line que ele mesmo marcou. */
  function isManagedByApp(statusLine) {
    return Boolean(statusLine && statusLine[OWNER_KEY] === true)
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
          // que ele fosse "não existia".
          [BACKUP_KEY]: settings.statusLine ?? null,
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

  return {
    capturePath,
    install,
    readCapture,
    scriptPath,
    status,
    uninstall,
  }
}

module.exports = {
  createClaudeStatuslineService,
}

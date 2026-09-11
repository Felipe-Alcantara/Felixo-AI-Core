'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

/**
 * @module autostart
 * Liga/desliga "iniciar com o sistema" nos três SOs.
 *
 * Em macOS e Windows usa `app.setLoginItemSettings()`/`getLoginItemSettings()`
 * do próprio Electron — o mesmo mecanismo que Discord/Slack/etc. usam
 * (`@platform darwin,win32`, conferido em `node_modules/electron/electron.d.ts`
 * na v41 usada por este projeto; Electron nunca implementou suporte nativo a
 * autostart no Linux).
 *
 * Em Linux, escreve um arquivo `.desktop` em `~/.config/autostart/`, seguindo
 * a especificação XDG Desktop Entry que GNOME/KDE/XFCE já leem sozinhos, sem
 * precisar de nenhuma dependência nova. Ligar cria o arquivo; desligar apaga
 * — sem arquivo, sem autostart, é o estado mais simples de auditar.
 */

const LINUX_DESKTOP_FILE_APP_ID = 'felixo-ai-core'

// O destino é sempre Linux, não importa em qual SO o processo Node/Electron
// que está CHAMANDO esta função roda (ex.: o CI roda a suíte inteira de
// testes também no runner windows-latest) — path.join() usaria `\` lá e
// produziria um caminho que o Linux nunca aceitaria. path.posix.join()
// garante `/` sempre, como o XDG Base Directory espera.
function getLinuxAutostartDesktopPath({ homeDir = os.homedir(), environment = process.env } = {}) {
  const configHome =
    typeof environment.XDG_CONFIG_HOME === 'string' && environment.XDG_CONFIG_HOME.trim()
      ? environment.XDG_CONFIG_HOME.trim()
      : path.posix.join(homeDir, '.config')
  return path.posix.join(configHome, 'autostart', `${LINUX_DESKTOP_FILE_APP_ID}.desktop`)
}

/**
 * O caminho do executável entra entre aspas duplas no `Exec=` — instaladores
 * Linux (AppImage, .deb) costumam gerar caminhos com espaço (`Felixo AI Core`).
 * Escapa só a aspa dupla em si; não há shell de verdade interpretando isto,
 * quem lê é o próprio ambiente de desktop via `g_shell_parse_argv`.
 */
function buildDesktopFileContent(execPath) {
  const escaped = String(execPath).replace(/"/g, '\\"')
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=Felixo AI Core',
    `Exec="${escaped}"`,
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
    '',
  ].join('\n')
}

function getLinuxAutostartStatus({ homeDir, environment, fileSystem = fs } = {}) {
  const filePath = getLinuxAutostartDesktopPath({ homeDir, environment })
  try {
    fileSystem.accessSync(filePath)
    return { supported: true, enabled: true }
  } catch {
    return { supported: true, enabled: false }
  }
}

function setLinuxAutostartEnabled({ enabled, execPath, homeDir, environment, fileSystem = fs }) {
  const filePath = getLinuxAutostartDesktopPath({ homeDir, environment })
  try {
    if (enabled) {
      if (typeof execPath !== 'string' || !execPath.trim()) {
        return {
          ok: false,
          supported: true,
          enabled: false,
          message: 'Caminho do executável indisponível — não dá pra gravar o autostart.',
        }
      }
      fileSystem.mkdirSync(path.posix.dirname(filePath), { recursive: true })
      fileSystem.writeFileSync(filePath, buildDesktopFileContent(execPath), { encoding: 'utf8', mode: 0o644 })
    } else {
      fileSystem.rmSync(filePath, { force: true })
    }
    return { ok: true, supported: true, enabled: Boolean(enabled) }
  } catch (error) {
    return {
      ok: false,
      supported: true,
      enabled: false,
      message: error instanceof Error ? error.message : 'Não foi possível salvar o arquivo .desktop.',
    }
  }
}

/**
 * @param {object} options
 * @param {string} [options.platformName]
 * @param {() => { openAtLogin: boolean }} [options.getLoginItemSettings] -
 *   Tipicamente `() => app.getLoginItemSettings()`; injetável pra teste. Só
 *   usado em macOS/Windows.
 * @param {string} [options.homeDir] - Injetável pra teste. Só usado em Linux.
 * @param {Record<string, string>} [options.environment] - Injetável pra teste. Só usado em Linux.
 * @param {typeof fs} [options.fileSystem] - Injetável pra teste. Só usado em Linux.
 * @returns {{ supported: boolean, enabled: boolean }}
 */
function getAutoStartStatus({
  platformName = process.platform,
  getLoginItemSettings,
  homeDir,
  environment,
  fileSystem,
} = {}) {
  if (platformName === 'linux') {
    return getLinuxAutostartStatus({ homeDir, environment, fileSystem })
  }
  if (platformName !== 'darwin' && platformName !== 'win32') {
    return { supported: false, enabled: false }
  }
  if (typeof getLoginItemSettings !== 'function') {
    return { supported: true, enabled: false }
  }
  const settings = getLoginItemSettings()
  return { supported: true, enabled: Boolean(settings?.openAtLogin) }
}

/**
 * @param {object} options
 * @param {boolean} options.enabled
 * @param {string} [options.platformName]
 * @param {(settings: { openAtLogin: boolean }) => void} [options.setLoginItemSettings] -
 *   Tipicamente `(settings) => app.setLoginItemSettings(settings)`; injetável pra teste. Só usado em macOS/Windows.
 * @param {string} [options.execPath] - Caminho do executável atual (tipicamente
 *   `app.getPath('exe')`); obrigatório pra ligar no Linux.
 * @param {string} [options.homeDir] - Injetável pra teste. Só usado em Linux.
 * @param {Record<string, string>} [options.environment] - Injetável pra teste. Só usado em Linux.
 * @param {typeof fs} [options.fileSystem] - Injetável pra teste. Só usado em Linux.
 * @returns {{ ok: boolean, supported: boolean, enabled: boolean, message?: string }}
 */
function setAutoStartEnabled({
  enabled,
  platformName = process.platform,
  setLoginItemSettings,
  execPath,
  homeDir,
  environment,
  fileSystem,
}) {
  if (platformName === 'linux') {
    return setLinuxAutostartEnabled({ enabled, execPath, homeDir, environment, fileSystem })
  }
  if (platformName !== 'darwin' && platformName !== 'win32') {
    return {
      ok: false,
      supported: false,
      enabled: false,
      message: 'Esta plataforma não tem suporte a "iniciar com o sistema".',
    }
  }
  if (typeof setLoginItemSettings !== 'function') {
    return { ok: false, supported: true, enabled: false, message: 'API de autostart indisponível nesta build.' }
  }

  try {
    setLoginItemSettings({ openAtLogin: Boolean(enabled) })
    return { ok: true, supported: true, enabled: Boolean(enabled) }
  } catch (error) {
    return {
      ok: false,
      supported: true,
      enabled: false,
      message: error instanceof Error ? error.message : 'Não foi possível salvar a preferência de autostart.',
    }
  }
}

module.exports = {
  LINUX_DESKTOP_FILE_APP_ID,
  buildDesktopFileContent,
  getAutoStartStatus,
  getLinuxAutostartDesktopPath,
  setAutoStartEnabled,
}

'use strict'

/**
 * @module app-relaunch
 * Reabre o app num processo novo antes de `app.whenReady()`, inclusive no
 * AppImage.
 *
 * `app.relaunch()` entrega o trabalho a um processo "relauncher" que espera o
 * app sair e só então executa o mesmo binário (`shell/browser/relauncher.cc`
 * e `relauncher_linux.cc` do Electron 41.10.7). No AppImage esse binário mora
 * na montagem `/tmp/.mount_*`, que o runtime do AppImage desmonta quando o app
 * sai: o relauncher não acha mais o que executar e nada abre. Medido em
 * 26/09/2026 com Electron 41.10.7 empacotado pelo electron-builder 26.15.3 (o
 * alvo AppImage do `package.json`): `app.relaunch()` e
 * `app.relaunch({ execPath: APPIMAGE })` devolvem `true` e nenhum processo
 * novo nasce; no mesmo pacote desempacotado (como no `.deb`) o relançado
 * nasce em menos de 1 s.
 *
 * No AppImage o app abre de novo o próprio arquivo `.AppImage`, que fica
 * fora da montagem, como processo destacado. `APPIMAGE` (caminho absoluto do
 * arquivo) e `APPDIR` (ponto de montagem) são exportados pelo runtime do
 * AppImage (docs.appimage.org, "Environment variables", runtime tipo 2).
 */

const { spawn } = require('node:child_process')
const path = require('node:path')

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== ''
}

function describeError(error) {
  return error instanceof Error && error.message ? error.message : String(error)
}

/**
 * O `.AppImage` que está rodando ESTE processo, ou `null`.
 *
 * Só conta quando o executável do app está dentro do `APPDIR`: um `APPIMAGE`
 * herdado de outro programa (um editor em AppImage que abriu o terminal de
 * onde o app foi lançado, por exemplo) não é o nosso.
 *
 * @param {object} options
 * @param {Record<string, string | undefined>} options.environment
 * @param {string} options.execPath
 * @param {string} options.platformName
 * @param {boolean} options.isPackaged
 * @returns {string | null}
 */
function resolveRunningAppImage({ environment, execPath, platformName, isPackaged }) {
  if (platformName !== 'linux' || !isPackaged) return null
  const appImage = environment.APPIMAGE
  const appDir = environment.APPDIR
  if (!nonEmptyString(appImage) || !path.isAbsolute(appImage) || !nonEmptyString(appDir)) return null
  if (!nonEmptyString(execPath)) return null
  const relative = path.relative(appDir, execPath)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null
  return appImage
}

/**
 * Pede um processo novo do app com os mesmos argumentos e o ambiente atual
 * (quem chama já ajustou `environment`). Não encerra este processo: quem
 * chama decide, pelo resultado, entre `app.exit(0)` e seguir sem relançar.
 *
 * @param {object} options
 * @param {{ isPackaged: boolean, relaunch: () => unknown }} options.app
 * @param {Record<string, string | undefined>} [options.environment]
 * @param {string[]} [options.argv]
 * @param {string} [options.execPath]
 * @param {string} [options.platformName]
 * @param {typeof spawn} [options.spawnProcess]
 * @returns {{ ok: boolean, method: 'appimage' | 'app-relaunch', detail: string | null, pid: number | null }}
 *   `pid` é o do `.AppImage` reaberto, que vira o processo do app relançado
 *   (o runtime do AppImage executa o `AppRun`, e ele o Electron, no mesmo
 *   processo); o relauncher do `app.relaunch()` não expõe o pid.
 */
function relaunchApp({
  app,
  environment = process.env,
  argv = process.argv,
  execPath = process.execPath,
  platformName = process.platform,
  spawnProcess = spawn,
}) {
  const appImage = resolveRunningAppImage({
    environment,
    execPath,
    platformName,
    isPackaged: Boolean(app.isPackaged),
  })

  if (appImage) {
    try {
      const child = spawnProcess(appImage, argv.slice(1), {
        detached: true,
        stdio: 'ignore',
        env: environment,
      })
      // Erro de execução (arquivo apagado, sem permissão) chega depois, como
      // evento: sem ouvinte ele derrubaria este processo, que segue aberto
      // quando o relançamento falha.
      child.on('error', () => {})
      // Sem pid o processo não nasceu (o Node emite o erro no próximo tick).
      if (!Number.isInteger(child.pid) || child.pid <= 0) {
        return { ok: false, method: 'appimage', detail: `o ${path.basename(appImage)} não abriu`, pid: null }
      }
      child.unref()
      return { ok: true, method: 'appimage', detail: null, pid: child.pid }
    } catch (error) {
      return { ok: false, method: 'appimage', detail: describeError(error), pid: null }
    }
  }

  try {
    // A tipagem diz `void`, mas a implementação (`App::Relaunch` em
    // `shell/browser/api/electron_api_app.cc`) devolve `false` quando o
    // relauncher não sobe.
    const result = app.relaunch()
    return result === false
      ? { ok: false, method: 'app-relaunch', detail: 'app.relaunch() não conseguiu iniciar o relauncher', pid: null }
      : { ok: true, method: 'app-relaunch', detail: null, pid: null }
  } catch (error) {
    return { ok: false, method: 'app-relaunch', detail: describeError(error), pid: null }
  }
}

module.exports = {
  relaunchApp,
  resolveRunningAppImage,
}

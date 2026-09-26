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
 *
 * O ambiente do relançado sai sem os caminhos da montagem antiga: o `AppRun`
 * do electron-builder prefixa `PATH`, `LD_LIBRARY_PATH`, `XDG_DATA_DIRS` e
 * `GSETTINGS_SCHEMA_DIR` com o `APPDIR`, e o `AppRun` do relançado prefixaria
 * de novo. Sem a limpeza, o relançado procurava programas e bibliotecas numa
 * montagem que só continua de pé por acaso (um descritor herdado).
 */

const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

/** Prefixo do diretório que o runtime do AppImage usa com `--appimage-extract-and-run` (conferido no runtime empacotado). */
const EXTRACTED_APPDIR_PREFIX = 'appimage_extracted_'
/** Listas de caminhos que o `AppRun` do electron-builder prefixa com o `APPDIR`. */
const APPDIR_PATH_LIST_VARIABLES = Object.freeze(['PATH', 'LD_LIBRARY_PATH', 'XDG_DATA_DIRS', 'GSETTINGS_SCHEMA_DIR'])

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== ''
}

function isInsideDirectory(target, directory) {
  const relative = path.relative(directory, target)
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

function describeError(error) {
  return error instanceof Error && error.message ? error.message : String(error)
}

/**
 * O AppImage que está rodando ESTE processo, ou `null`.
 *
 * Só conta quando o executável do app está dentro do `APPDIR`: um `APPIMAGE`
 * herdado de outro programa (um editor em AppImage que abriu o terminal de
 * onde o app foi lançado, por exemplo) não é o nosso. A comparação é pelos
 * caminhos reais: com o TMPDIR atrás de um link simbólico (ex.: `/home` →
 * `/var/home` no Silverblue), o runtime exporta o `APPDIR` pelo link e o
 * `execPath` vem resolvido. `APPDIR` precisa ser absoluto e não pode ser a
 * raiz, e `APPIMAGE` precisa ser um arquivo que existe: só assim o que se
 * executa é um `.AppImage`, e não um binário qualquer do ambiente.
 *
 * @returns {{ appImage: string, appDirs: string[], extracted: boolean } | null}
 *   `appDirs`: o `APPDIR` como veio e o caminho real dele; `extracted`: o app
 *   roda de uma extração (`--appimage-extract-and-run`), não de uma montagem.
 */
function describeRunningAppImage({ environment, execPath, platformName, isPackaged, fileSystem = fs }) {
  if (platformName !== 'linux' || !isPackaged) return null
  const appImage = environment.APPIMAGE
  const appDir = environment.APPDIR
  if (!nonEmptyString(appImage) || !path.isAbsolute(appImage)) return null
  if (!nonEmptyString(appDir) || !path.isAbsolute(appDir)) return null
  if (!nonEmptyString(execPath)) return null

  let realAppDir
  let realExecPath
  try {
    realAppDir = fileSystem.realpathSync(appDir)
    realExecPath = fileSystem.realpathSync(execPath)
    if (!fileSystem.statSync(appImage).isFile()) return null
  } catch {
    return null
  }
  // A raiz (ou um link para ela) conteria qualquer executável.
  if (path.dirname(realAppDir) === realAppDir) return null
  if (!isInsideDirectory(realExecPath, realAppDir)) return null
  return {
    appImage,
    appDirs: [...new Set([path.resolve(appDir), realAppDir])],
    extracted: path.basename(realAppDir).startsWith(EXTRACTED_APPDIR_PREFIX),
  }
}

/**
 * O `.AppImage` que está rodando ESTE processo, ou `null` (ver
 * `describeRunningAppImage`).
 *
 * @param {object} options
 * @param {Record<string, string | undefined>} options.environment
 * @param {string} options.execPath
 * @param {string} options.platformName
 * @param {boolean} options.isPackaged
 * @param {typeof fs} [options.fileSystem]
 * @returns {string | null}
 */
function resolveRunningAppImage(options) {
  return describeRunningAppImage(options)?.appImage ?? null
}

/**
 * O ambiente do `.AppImage` reaberto: o deste processo sem as entradas da
 * montagem (ou extração) atual nas listas de caminhos que o `AppRun`
 * prefixa; uma lista que fica vazia sai do ambiente. Com o app extraído, o
 * runtime consumiu o `--appimage-extract-and-run` da linha de comando, então
 * o relançado recebe `APPIMAGE_EXTRACT_AND_RUN=1` para também não depender de
 * FUSE. Não altera `environment`.
 */
function buildAppImageRelaunchEnv(environment, { appDirs, extracted }) {
  const childEnvironment = { ...environment }
  const isFromAppDir = (entry) => appDirs.some((appDir) => entry === appDir || entry.startsWith(`${appDir}${path.sep}`))
  for (const key of APPDIR_PATH_LIST_VARIABLES) {
    if (typeof childEnvironment[key] !== 'string') continue
    const kept = childEnvironment[key].split(path.delimiter).filter((entry) => !isFromAppDir(entry))
    if (kept.length === 0) delete childEnvironment[key]
    else childEnvironment[key] = kept.join(path.delimiter)
  }
  if (extracted) childEnvironment.APPIMAGE_EXTRACT_AND_RUN = '1'
  return childEnvironment
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
 * @param {typeof fs} [options.fileSystem]
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
  fileSystem = fs,
}) {
  const running = describeRunningAppImage({
    environment,
    execPath,
    platformName,
    isPackaged: Boolean(app.isPackaged),
    fileSystem,
  })

  if (running) {
    const { appImage } = running
    try {
      const child = spawnProcess(appImage, argv.slice(1), {
        detached: true,
        stdio: 'ignore',
        env: buildAppImageRelaunchEnv(environment, running),
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
  APPDIR_PATH_LIST_VARIABLES,
  buildAppImageRelaunchEnv,
  describeRunningAppImage,
  relaunchApp,
  resolveRunningAppImage,
}

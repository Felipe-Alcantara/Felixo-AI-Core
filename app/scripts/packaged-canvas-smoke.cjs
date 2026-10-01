'use strict'

/**
 * O smoke do canvas (`canvas-smoke.cjs`, sessões A–F) no app EMPACOTADO, do
 * jeito que a pessoa o recebe: o instalador desta release é preparado como no
 * smoke do artefato (`release-smoke.cjs` — AppImage extraído, DMG copiado,
 * NSIS instalado em pasta temporária) e o smoke dirige o executável dele pelo
 * `felixo devtools launch --packaged`.
 *
 * Roda no workflow de release, antes de enviar os instaladores (decisão do
 * Felipe, 01/10/2026: o smoke da interface no pacote roda só antes da
 * release). Falhou, o instalador daquele sistema não sobe e a release não sai
 * do estado de pré-release.
 *
 * Uso: node scripts/packaged-canvas-smoke.cjs --release-dir release [--artifact caminho]
 *      (no Linux, dentro de `xvfb-run`)
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const { prepareArtifact, resolveReleaseArtifact, sanitizeDiagnostic } = require('./release-smoke.cjs')

const APP_DIR = path.resolve(__dirname, '..')

/**
 * O que só o app empacotado faz sozinho ao abrir e o de desenvolvimento não:
 * instalar as CLIs que faltam (no runner sem CLI, isso baixa pacotes pela rede
 * e abre o aviso "Preparando as CLIs de IA", que na tela de 320 px cobria a
 * barra de atividades — release 36912514190, 01/10/2026) e procurar
 * atualização. Desligados, o pacote roda o smoke nas mesmas condições da fonte.
 */
const PACKAGED_SMOKE_ENV = Object.freeze({
  FELIXO_AUTO_INSTALL_CLIS: '0',
  FELIXO_DISABLE_AUTO_UPDATE: '1',
})

function parseArgs(argv) {
  const options = { releaseDir: 'release', artifact: '' }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--release-dir') options.releaseDir = argv[++index]
    else if (arg === '--artifact') options.artifact = argv[++index]
    else throw new Error(`Argumento desconhecido: ${arg}. Uso: --release-dir <pasta> [--artifact <arquivo>]`)
  }
  return options
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  const releaseDir = path.resolve(APP_DIR, options.releaseDir)
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-canvas-smoke-pacote-'))
  try {
    const artifactPath = resolveReleaseArtifact({ releaseDir, explicitArtifact: options.artifact })
    const prepared = prepareArtifact({ artifactPath, temporaryRoot })
    console.log(`[canvas-smoke:pacote] artefato ${path.basename(artifactPath)} (${prepared.installMode}); executável ${path.basename(prepared.executable)}`)

    const result = spawnSync(process.execPath, [path.join(__dirname, 'canvas-smoke.cjs')], {
      cwd: APP_DIR,
      stdio: 'inherit',
      env: { ...process.env, ...PACKAGED_SMOKE_ENV, FELIXO_SMOKE_PACKAGED: prepared.executable },
    })
    if (result.error) throw result.error
    return result.status ?? 1
  } catch (error) {
    console.error(`[canvas-smoke:pacote] ${sanitizeDiagnostic(error, temporaryRoot)}`)
    return 1
  } finally {
    // Melhor esforço: no Windows um processo do app que demora a sair segura
    // arquivos, e a pasta temporária do runner some com ele de qualquer jeito.
    try {
      fs.rmSync(temporaryRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 })
    } catch (error) {
      console.warn(`[canvas-smoke:pacote] pasta temporária não removida: ${error.code ?? error.message}`)
    }
  }
}

if (require.main === module) {
  process.exitCode = main()
}

module.exports = { PACKAGED_SMOKE_ENV, main, parseArgs }

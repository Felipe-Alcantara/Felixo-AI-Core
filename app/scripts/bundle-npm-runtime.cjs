/**
 * Copia o npm para dentro do pacote, antes de o electron-builder empacotar.
 *
 * O app instala as CLIs de IA sozinho na primeira abertura, e quem chega pelo
 * instalador de release costuma não ter Node nem npm na máquina. O Node vem
 * junto (é o do próprio Electron, via `ELECTRON_RUN_AS_NODE`); o npm precisa
 * ser carregado como recurso.
 *
 * A cópia intermediária existe por uma limitação do empacotador: ele descarta
 * o `node_modules` que estiver na **raiz** do que for copiado. Apontar direto
 * para `node_modules/npm` embarcaria um npm sem as próprias dependências —
 * quebrado. Por isso o npm é copiado para dentro de uma pasta a mais
 * (`build/npm-runtime/npm`): assim o seu `node_modules` deixa de estar na
 * raiz da cópia e vai junto.
 *
 * Ligado como `beforePack` no electron-builder: vale para `pack`, `dist` e
 * `publish` sem depender de alguém lembrar de rodar um passo extra.
 */

const fs = require('node:fs')
const path = require('node:path')

const APP_ROOT = path.join(__dirname, '..')
const SOURCE = path.join(APP_ROOT, 'node_modules', 'npm')
const STAGING = path.join(APP_ROOT, 'build', 'npm-runtime')
const TARGET = path.join(STAGING, 'npm')

// Documentação e páginas de manual são alguns megabytes que ninguém lê dentro
// de um app de desktop.
const SKIPPED_DIRECTORIES = new Set(['docs', 'man'])

function bundleNpmRuntime() {
  if (!fs.existsSync(path.join(SOURCE, 'bin', 'npm-cli.js'))) {
    throw new Error(
      'O npm nao foi encontrado em node_modules. Rode `npm install` antes de empacotar: sem ele o app instalado nao consegue instalar as CLIs de IA.',
    )
  }

  fs.rmSync(STAGING, { recursive: true, force: true })
  fs.mkdirSync(STAGING, { recursive: true })
  fs.cpSync(SOURCE, TARGET, { recursive: true, filter: shouldCopy })

  return TARGET
}

function shouldCopy(source) {
  const name = path.basename(source)

  if (SKIPPED_DIRECTORIES.has(name)) {
    return false
  }

  return !name.endsWith('.md')
}

module.exports = bundleNpmRuntime
module.exports.default = bundleNpmRuntime
module.exports.bundleNpmRuntime = bundleNpmRuntime

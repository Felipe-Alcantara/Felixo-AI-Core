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
// de um app de desktop. Os outros diretórios são artefatos publicados pelos
// pacotes para desenvolvimento/testes; não entram no caminho de execução do
// npm e podem aparecer aninhados em qualquer dependência.
const DOCUMENTATION_DIRECTORIES = new Set(['docs', 'man'])
const NON_RUNTIME_DIRECTORIES = new Set([
  '.github',
  '.nyc_output',
  '__tests__',
  'benchmark',
  'benchmarks',
  'coverage',
  'example',
  'examples',
  'fixtures',
  'tap-snapshots',
  'test',
  'test-fixtures',
  'tests',
])
const BASELINE_SKIPPED_EXTENSIONS = new Set(['.md'])
const CURRENT_SKIPPED_EXTENSIONS = new Set(['.map', '.markdown', '.md'])
const NPM_RUNTIME_POLICIES = Object.freeze({
  baseline: 'baseline',
  current: 'current',
})

function bundleNpmRuntime(options = {}) {
  const overrides = options && typeof options === 'object' ? options : {}
  return copyNpmRuntime({
    source: overrides.source ?? SOURCE,
    target: overrides.target ?? TARGET,
    policy: overrides.policy ?? NPM_RUNTIME_POLICIES.current,
  })
}

function copyNpmRuntime({
  source = SOURCE,
  target = TARGET,
  policy = NPM_RUNTIME_POLICIES.current,
} = {}) {
  if (!Object.values(NPM_RUNTIME_POLICIES).includes(policy)) {
    throw new Error(`Politica de npm-runtime desconhecida: ${policy}`)
  }

  if (!fs.existsSync(path.join(source, 'bin', 'npm-cli.js'))) {
    throw new Error(
      'O npm nao foi encontrado em node_modules. Rode `npm install` antes de empacotar: sem ele o app instalado nao consegue instalar as CLIs de IA.',
    )
  }

  fs.rmSync(target, { recursive: true, force: true })
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.cpSync(source, target, {
    recursive: true,
    filter: (entry) => shouldCopy(entry, policy),
  })

  return target
}

function shouldCopy(source, policy = NPM_RUNTIME_POLICIES.current) {
  const name = path.basename(source)
  const normalizedName = name.toLowerCase()
  const skippedExtensions = policy === NPM_RUNTIME_POLICIES.baseline
    ? BASELINE_SKIPPED_EXTENSIONS
    : CURRENT_SKIPPED_EXTENSIONS

  if (isDirectory(source) && DOCUMENTATION_DIRECTORIES.has(normalizedName)) {
    return false
  }

  if (
    policy === NPM_RUNTIME_POLICIES.current
    && isDirectory(source)
    && NON_RUNTIME_DIRECTORIES.has(normalizedName)
  ) {
    return false
  }

  return !skippedExtensions.has(path.extname(normalizedName))
}

function isDirectory(candidate) {
  try {
    return fs.lstatSync(candidate).isDirectory()
  } catch {
    return false
  }
}

module.exports = bundleNpmRuntime
module.exports.default = bundleNpmRuntime
module.exports.bundleNpmRuntime = bundleNpmRuntime
module.exports.copyNpmRuntime = copyNpmRuntime
module.exports.NPM_RUNTIME_POLICIES = NPM_RUNTIME_POLICIES
module.exports.shouldCopy = shouldCopy

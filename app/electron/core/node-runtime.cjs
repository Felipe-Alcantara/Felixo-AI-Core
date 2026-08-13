/**
 * @module node-runtime
 * Resolve o Node e o npm que o app usa para instalar as CLIs oficiais.
 *
 * Quem instala o Felixo AI Core pelo instalador de release normalmente não
 * usa terminal — e, por isso mesmo, muitas vezes não tem Node nem npm na
 * máquina. Depender do Node do sistema quebraria a instalação automática
 * justo para esse público. O app já carrega um Node completo dentro do
 * binário do Electron: com `ELECTRON_RUN_AS_NODE=1` ele deixa de abrir uma
 * janela e passa a se comportar como o executável `node`. Somado ao npm
 * empacotado em `resources/npm`, isso fecha um runtime autossuficiente.
 */

const fs = require('node:fs')
const path = require('node:path')

/** Caminho do executável que roda como Node (o próprio binário do Electron). */
function getNodeExecutable() {
  return process.execPath
}

/**
 * Localiza o `npm-cli.js` empacotado.
 *
 * No app empacotado ele vem em `resources/npm-runtime/npm` (ver
 * `scripts/bundle-npm-runtime.cjs`); rodando do código-fonte, vem do
 * `node_modules` do projeto. Retorna `null` quando não
 * há npm disponível — o chamador precisa tratar isso como "não dá para
 * instalar", e não seguir com um caminho inexistente.
 *
 * @param {object} [options]
 * @param {string} [options.resourcesPath] - `process.resourcesPath`.
 * @param {string} [options.appRoot] - Raiz do app (pasta que contém `electron/`).
 * @param {(candidate: string) => boolean} [options.exists]
 * @returns {string | null}
 */
function resolveNpmCliPath({
  resourcesPath = process.resourcesPath,
  appRoot = path.join(__dirname, '..', '..'),
  exists = fs.existsSync,
} = {}) {
  const candidates = [
    resourcesPath
      ? path.join(resourcesPath, 'npm-runtime', 'npm', 'bin', 'npm-cli.js')
      : null,
    path.join(appRoot, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ].filter(Boolean)

  return candidates.find((candidate) => safeExists(candidate, exists)) ?? null
}

/**
 * Ambiente para rodar o binário do Electron como Node puro.
 *
 * `ELECTRON_RUN_AS_NODE` liga o modo Node. As variáveis de janela são
 * removidas porque, herdadas do processo principal, fazem um processo sem
 * interface tentar falar com o display e falhar em máquinas sem sessão
 * gráfica ativa.
 *
 * @param {Record<string, string>} [baseEnv]
 * @returns {Record<string, string>}
 */
function createNodeEnv(baseEnv = process.env) {
  const env = { ...baseEnv, ELECTRON_RUN_AS_NODE: '1' }

  delete env.ELECTRON_NO_ATTACH_CONSOLE
  delete env.ELECTRON_FORCE_WINDOW_MENU_BAR

  return env
}

function safeExists(candidate, exists) {
  try {
    return exists(candidate)
  } catch {
    return false
  }
}

module.exports = {
  createNodeEnv,
  getNodeExecutable,
  resolveNpmCliPath,
}

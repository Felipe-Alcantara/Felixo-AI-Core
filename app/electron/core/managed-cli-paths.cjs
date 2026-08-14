/**
 * @module managed-cli-paths
 * Onde ficam as CLIs que o próprio app instala.
 *
 * As CLIs oficiais instaladas automaticamente não vão para o `-g` global do
 * sistema: elas ficam numa pasta do próprio app, dentro do `userData`. Assim
 * a instalação automática não sobrescreve o que a pessoa já tinha, não pede
 * permissão de administrador e some junto com o app quando ele é desinstalado.
 */

const path = require('node:path')

const MANAGED_ROOT_ENV_KEY = 'FELIXO_MANAGED_CLI_ROOT'

/**
 * @typedef {object} ManagedCliLayout
 * @property {string} root - Prefixo passado ao npm.
 * @property {string} packagesBin - Pasta dos executáveis instalados pelo npm.
 * @property {string} runtimeBin - Pasta dos atalhos `node`/`npm` do app.
 */

/**
 * @param {object} options
 * @param {string} options.userData - Pasta de dados do usuário.
 * @param {string} [options.platformName]
 * @param {Record<string, string>} [options.env]
 * @returns {ManagedCliLayout}
 */
function getManagedCliLayout({
  userData,
  platformName = process.platform,
  env = process.env,
}) {
  if (!userData) {
    throw new Error('getManagedCliLayout requer userData.')
  }

  // Usa o `path` do platformName pedido, não o do SO onde o código roda: os
  // testes fixam `platformName` para checar o layout de cada plataforma, e
  // isso só funciona se o separador de caminho também respeitar essa escolha.
  const platformPath = platformName === 'win32' ? path.win32 : path.posix

  const root = env[MANAGED_ROOT_ENV_KEY] || platformPath.join(userData, 'clis')

  return {
    root,
    // O npm instala os executáveis em `<prefix>/bin` no POSIX, mas direto em
    // `<prefix>` no Windows.
    packagesBin: platformName === 'win32' ? root : platformPath.join(root, 'bin'),
    runtimeBin: platformPath.join(root, 'runtime-bin'),
  }
}

/**
 * Pastas que devem entrar no PATH das CLIs, na ordem de prioridade.
 *
 * Elas entram **depois** das do sistema: se a pessoa já instalou a CLI por
 * conta própria, é a instalação dela que deve valer. A do app é rede de
 * segurança, não substituição.
 *
 * @param {ManagedCliLayout} layout
 * @returns {string[]}
 */
function getManagedCliPathCandidates(layout) {
  if (!layout) {
    return []
  }

  return [layout.packagesBin, layout.runtimeBin].filter(Boolean)
}

module.exports = {
  MANAGED_ROOT_ENV_KEY,
  getManagedCliLayout,
  getManagedCliPathCandidates,
}

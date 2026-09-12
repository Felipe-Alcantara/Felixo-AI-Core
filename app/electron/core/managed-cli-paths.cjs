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
 * @typedef {object} OfflineCacheLayout
 * @property {string} root - Pasta do cache offline para esta combinação exata.
 */

/**
 * Segmento seguro pra virar pedaço de caminho: só o que o app já conhece
 * (id de provider, plataforma, arquitetura, versão semver) passa — nenhum
 * dado vindo de fora (nome de pacote arbitrário, resposta de registry)
 * deveria chegar aqui sem validação.
 */
function isSafeCacheSegment(value) {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9.-]{0,63}$/i.test(value)
}

/**
 * Onde fica o cache offline de uma CLI gerida pelo app — decisão registrada
 * em `docs/projeto/ARQUITETURA.md` ("Cache offline do gerenciador de
 * CLIs"): o cache é **compartilhado entre perfis** da mesma CLI (só
 * login/credencial é isolado por perfil, em `cli-account-profiles.cjs`) —
 * o binário não carrega segredo, então isolar por perfil só multiplicaria
 * disco e tempo de instalação sem ganho de segurança real. Por isso esta
 * função não recebe `profileId`: separa só por provider, plataforma,
 * arquitetura e versão — o suficiente pra nunca servir um binário
 * incompatível ou de outra CLI, e pouco o bastante pra caber uma vez só no
 * disco por versão instalada.
 *
 * @param {object} options
 * @param {string} options.userData - Pasta de dados do usuário.
 * @param {string} options.providerId - Ex.: "codex", "claude", "gemini".
 * @param {string} options.version - Versão exata do pacote (ex.: "2.1.263").
 * @param {string} [options.platformName]
 * @param {string} [options.arch]
 * @returns {OfflineCacheLayout}
 */
function getOfflineCacheLayout({
  userData,
  providerId,
  version,
  platformName = process.platform,
  arch = process.arch,
}) {
  if (!userData) {
    throw new Error('getOfflineCacheLayout requer userData.')
  }
  if (!isSafeCacheSegment(providerId)) {
    throw new Error('getOfflineCacheLayout requer um providerId válido.')
  }
  if (!isSafeCacheSegment(version)) {
    throw new Error('getOfflineCacheLayout requer uma version válida.')
  }

  const platformPath = platformName === 'win32' ? path.win32 : path.posix
  const platformArch = `${platformName}-${arch}`

  return {
    root: platformPath.join(userData, 'cli-cache', providerId, platformArch, version),
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
  getOfflineCacheLayout,
}

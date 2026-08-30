'use strict'

const path = require('node:path')

/**
 * Contas simultâneas por CLI, cada uma com o próprio login.
 *
 * A troca de conta sem perfil obriga a `logout` seguido de `login`: derruba a
 * autenticação de todos os terminais vivos e faz a pessoa reconstruir o
 * trabalho. Com uma pasta por conta não existe logout — as duas ficam
 * autenticadas ao mesmo tempo e o terminal escolhe com qual nasce.
 *
 * O que cada CLI aceita foi medido nesta máquina, não presumido:
 *
 * | CLI    | Isolamento           | Como foi verificado                        |
 * |--------|----------------------|--------------------------------------------|
 * | codex  | `CODEX_HOME`         | `codex login status` responde "Not logged   |
 * |        |                      | in" com a pasta isolada                     |
 * | claude | `CLAUDE_CONFIG_DIR`  | `claude auth status --json` devolve         |
 * |        |                      | `loggedIn: false` e cria estrutura própria  |
 * | gemini | `HOME`               | o bundle resolve a pasta por `os.homedir()`;|
 * |        |                      | `GEMINI_CLI_HOME` só afeta settings.json    |
 * | openia | `OPENROUTER_API_KEY` | `load_api_key()` lê a env antes do store    |
 *
 * O segredo nunca é lido pelo app nos três primeiros: quem escreve na pasta do
 * perfil é a própria CLI, pelo fluxo de login dela. Só o Openia é exceção, e
 * por decisão explícita registrada em README e no cartão da tarefa.
 */

/** Onde ficam as pastas de perfil, dentro do perfil do próprio app. */
const PROFILES_DIRNAME = 'cli-profiles'

const ISOLATION = Object.freeze({
  codex: { kind: 'env-dir', variable: 'CODEX_HOME' },
  claude: { kind: 'env-dir', variable: 'CLAUDE_CONFIG_DIR' },
  // O Gemini não tem variável própria: só a troca de HOME isola o login, e
  // isso arrasta git, ssh e npm junto — por isso o espelho abaixo.
  gemini: { kind: 'env-home', mirror: ['.gitconfig', '.ssh', '.npmrc'] },
  openia: { kind: 'env-secret', variable: 'OPENROUTER_API_KEY' },
})

function getIsolation(providerId) {
  return ISOLATION[providerId] ?? null
}

/** `true` quando a CLI aceita mais de uma conta ao mesmo tempo. */
function supportsProfiles(providerId) {
  return Boolean(ISOLATION[providerId])
}

/**
 * Pasta do perfil. O id entra no caminho, então precisa ser inerte: só o que
 * o app gera (uuid) passa, para nenhum nome de conta virar travessia de
 * diretório.
 */
function getProfileDir(userData, providerId, profileId) {
  if (!isSafeSegment(providerId) || !isSafeSegment(profileId)) {
    throw new Error('Identificador de perfil de conta inválido.')
  }

  return path.join(userData, PROFILES_DIRNAME, providerId, profileId)
}

function isSafeSegment(value) {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/i.test(value)
}

/**
 * Variáveis que fazem o processo nascer na conta escolhida.
 *
 * Devolve `{}` para o perfil padrão do sistema — nesse caso o terminal usa o
 * login que a pessoa já tem fora do app, que é o comportamento de antes.
 *
 * @param {object} options
 * @param {string} options.providerId
 * @param {string} [options.profileDir] - Pasta do perfil, já criada.
 * @param {string} [options.secret] - Só para `env-secret`; nunca é registrado.
 * @param {string} [options.homeDir] - Home real, para o espelho do Gemini.
 */
function buildProfileEnv({ providerId, profileDir, secret, homeDir }) {
  const isolation = getIsolation(providerId)

  if (!isolation) {
    return {}
  }

  if (isolation.kind === 'env-secret') {
    return secret ? { [isolation.variable]: secret } : {}
  }

  if (!profileDir) {
    return {}
  }

  if (isolation.kind === 'env-dir') {
    return { [isolation.variable]: profileDir }
  }

  // `env-home`: além do HOME, o resto do ambiente que aponta para a home real
  // precisa acompanhar, senão ferramentas que leem XDG continuam na home
  // antiga e o isolamento fica pela metade.
  return {
    HOME: profileDir,
    USERPROFILE: profileDir,
    XDG_CONFIG_HOME: path.join(profileDir, '.config'),
    XDG_CACHE_HOME: path.join(profileDir, '.cache'),
    XDG_DATA_HOME: path.join(profileDir, '.local', 'share'),
    // Guardado para a interface poder avisar que aquele terminal está com
    // outra home; sem isso a pessoa descobre pelo git falhando.
    FELIXO_PROFILE_HOME: profileDir,
    ...(homeDir ? { FELIXO_REAL_HOME: homeDir } : {}),
  }
}

/**
 * Arquivos da home real que devem existir dentro de um perfil `env-home`.
 *
 * Trocar HOME faz o git perder `user.name`, o ssh perder as chaves e o npm
 * perder o registro configurado. Espelhar esses três é o que mantém o terminal
 * utilizável para o trabalho que o agente vai fazer ali.
 */
function getMirrorEntries(providerId) {
  const isolation = getIsolation(providerId)
  return isolation?.kind === 'env-home' ? [...isolation.mirror] : []
}

module.exports = {
  ISOLATION,
  PROFILES_DIRNAME,
  buildProfileEnv,
  getIsolation,
  getMirrorEntries,
  getProfileDir,
  supportsProfiles,
}

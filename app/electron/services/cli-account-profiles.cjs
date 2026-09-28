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

/**
 * Credenciais do ambiente do app que a CLI leria ANTES da pasta do perfil.
 *
 * Um perfil isola a pasta de login, mas não o que vem herdado do processo
 * principal: com `OPENAI_API_KEY` no ambiente, o Codex de uma conta ChatGPT
 * passa a cobrar pela chave, e com `ANTHROPIC_API_KEY` o Claude de uma conta
 * Max passa a cobrar por uso. Por isso um terminal com conta própria nasce
 * sem estas variáveis. O login do sistema (sem conta) não muda: continua com
 * o ambiente da pessoa, como antes.
 *
 * Os nomes foram conferidos nos pacotes instalados (Claude Code 2.1.283,
 * Codex 0.156.1, Gemini CLI 0.57.0). O Openia não entra: o perfil dele já
 * sobrescreve a própria chave (`OPENROUTER_API_KEY`).
 */
const CREDENCIAIS_HERDADAS = Object.freeze({
  claude: Object.freeze([
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_AUTH_TOKEN',
    'CLAUDE_CODE_OAUTH_TOKEN',
    'CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR',
  ]),
  codex: Object.freeze(['OPENAI_API_KEY', 'CODEX_API_KEY', 'CODEX_ACCESS_TOKEN']),
  gemini: Object.freeze([
    'GEMINI_API_KEY',
    'GOOGLE_API_KEY',
    'GOOGLE_APPLICATION_CREDENTIALS',
    'GOOGLE_GENAI_USE_VERTEXAI',
  ]),
  openia: Object.freeze([]),
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

/** Nomes das credenciais herdadas que um perfil do provedor remove. */
function getInheritedCredentialNames(providerId) {
  return [...(CREDENCIAIS_HERDADAS[providerId] ?? [])]
}

/**
 * Ambiente de um processo que nasce numa conta com perfil: o ambiente base
 * sem as credenciais herdadas daquele provedor, mais as variáveis do perfil.
 *
 * Remover precisa acontecer aqui, na junção, e não devolvendo `undefined` no
 * objeto do perfil: o node-pty serializa o valor como o texto "undefined".
 * No Windows o nome de variável não diferencia maiúscula (`openai_api_key` é
 * a mesma variável para a CLI), então a comparação também não diferencia.
 *
 * @param {Record<string, string | undefined>} baseEnv - Ambiente já montado (PATH do app etc.).
 * @param {{ providerId: string, profileEnv?: Record<string, string> }} profile
 * @param {string} [platformName] - `process.platform` por padrão.
 * @returns {Record<string, string | undefined>} Objeto novo; `baseEnv` não é alterado.
 */
function applyProfileEnv(baseEnv, { providerId, profileEnv = {} }, platformName = process.platform) {
  const caseInsensitive = platformName === 'win32'
  const removed = new Set(
    getInheritedCredentialNames(providerId).map((name) => (caseInsensitive ? name.toUpperCase() : name)),
  )
  const env = {}

  for (const [key, value] of Object.entries(baseEnv ?? {})) {
    if (!removed.has(caseInsensitive ? key.toUpperCase() : key)) {
      env[key] = value
    }
  }

  return { ...env, ...profileEnv }
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
  CREDENCIAIS_HERDADAS,
  ISOLATION,
  PROFILES_DIRNAME,
  applyProfileEnv,
  buildProfileEnv,
  getInheritedCredentialNames,
  getIsolation,
  getMirrorEntries,
  getProfileDir,
  supportsProfiles,
}

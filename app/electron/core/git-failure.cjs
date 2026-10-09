'use strict'

/**
 * @module git-failure
 * Como o app chama o Git para baixar um guia do System Design, e como explica
 * uma falha (09/10/2026).
 *
 * Um guia privado — ou um endereço digitado errado, porque o GitHub também pede
 * login para repositório que não existe — faz o Git pedir credencial. Sem
 * cuidado, isso abria a janela do Git Credential Manager no Windows numa
 * sincronização automática, ao abrir o app, ou deixava o Git esperando um
 * usuário num terminal que ninguém vê. A regra decidida pelo Felipe:
 *
 * - **Sem clique** (sincronização automática): o Git nunca pede nada. Se
 *   precisar de login, falha na hora e a tela avisa.
 * - **Com clique** (Sincronizar, adicionar um guia…): a janela de login do
 *   sistema pode abrir, e o prazo é maior para dar tempo de entrar.
 *
 * Credencial já salva (keychain, Git Credential Manager) continua sendo usada
 * nos dois casos: o que muda é só se o Git pode PERGUNTAR.
 */

const GIT_TIMEOUT_MS = 60_000
const GIT_INTERACTIVE_TIMEOUT_MS = 180_000

const GIT_FAILURE = Object.freeze({
  LOGIN: 'login',
  NOT_FOUND: 'not-found',
  BRANCH: 'branch',
  NETWORK: 'network',
  TIMEOUT: 'timeout',
  OTHER: 'other',
})

/**
 * Ambiente do processo Git. O terminal fica sempre fechado (`GIT_TERMINAL_PROMPT`):
 * o app não tem um, e num `npm run dev` a pergunta iria para o terminal de quem
 * rodou, invisível na tela. Sem clique, também não abre a janela do Git
 * Credential Manager (`GCM_INTERACTIVE=never`: "fail if interaction is
 * required") nem o askpass do SSH (`SSH_ASKPASS_REQUIRE=never`).
 *
 * @param {{ interactive?: boolean, baseEnv?: NodeJS.ProcessEnv }} options
 * @returns {NodeJS.ProcessEnv}
 */
function gitEnvironment({ interactive = false, baseEnv = process.env } = {}) {
  const env = { ...baseEnv, GIT_TERMINAL_PROMPT: '0' }
  if (!interactive) {
    env.GCM_INTERACTIVE = 'never'
    env.SSH_ASKPASS_REQUIRE = 'never'
  }
  return env
}

/** @param {boolean} interactive */
function gitTimeoutMs(interactive) {
  return interactive ? GIT_INTERACTIVE_TIMEOUT_MS : GIT_TIMEOUT_MS
}

// A ordem importa: "not found" de repositório vem antes de login, porque com
// login feito o GitHub responde "Repository not found" para quem não tem acesso.
const FAILURE_PATTERNS = [
  [GIT_FAILURE.BRANCH, /remote branch \S+ not found|could not find remote branch/i],
  [GIT_FAILURE.NOT_FOUND, /repository not found|repository '[^']*' not found/i],
  [
    GIT_FAILURE.LOGIN,
    /could not read (?:username|password)|terminal prompts disabled|cannot prompt because|authentication failed|invalid username or password|permission denied \(publickey|host key verification failed/i,
  ],
  [
    GIT_FAILURE.NETWORK,
    /could not resolve host|failed to connect to|connection (?:timed out|refused)|network is unreachable|temporary failure in name resolution/i,
  ],
]

/**
 * Motivo da falha, lido do erro CRU do execFile — antes da redação, que apaga
 * o texto do Git. Devolve só um nome da lista: nada do stderr sai daqui.
 *
 * @param {unknown} error
 * @returns {string} um valor de GIT_FAILURE
 */
function classifyGitFailure(error) {
  if (!error || typeof error !== 'object') return GIT_FAILURE.OTHER
  if ((error.killed && error.signal) || error.code === 'ETIMEDOUT') return GIT_FAILURE.TIMEOUT
  const text = [error.stderr, error.message].filter((part) => typeof part === 'string').join('\n')
  for (const [reason, pattern] of FAILURE_PATTERNS) {
    if (pattern.test(text)) return reason
  }
  return GIT_FAILURE.OTHER
}

/**
 * A frase para a pessoa, antes do diagnóstico técnico. `null` quando o motivo
 * não diz nada além do que o diagnóstico já diz.
 *
 * Fora do Windows, a janela de login só existe com o Git Credential Manager
 * instalado: o terminal fica fechado (`GIT_TERMINAL_PROMPT=0`) e o keychain do
 * macOS só lê credencial já salva. Sem o GCM, o clique falha sem abrir nada —
 * então a frase não fala em "cancelado" e diz como salvar a credencial.
 *
 * @param {string} reason
 * @param {{ interactive?: boolean, platform?: NodeJS.Platform }} options
 * @returns {string | null}
 */
function describeGitFailure(reason, { interactive = false, platform = process.platform } = {}) {
  switch (reason) {
    case GIT_FAILURE.LOGIN:
      if (!interactive) {
        return 'O repositório pede login: ele é privado ou o endereço está errado. Confira o endereço; se ele for privado, clique em Sincronizar para entrar com a sua conta do Git.'
      }
      return platform === 'win32'
        ? 'O login não foi concluído: ele foi cancelado, ou a conta não tem acesso a esse repositório. Confira o endereço e tente de novo.'
        : 'O login não foi concluído. Neste sistema o Git só abre uma janela de login com o Git Credential Manager instalado; sem ele, salve a credencial do Git pelo terminal (por exemplo, com `gh auth login`) e sincronize de novo. Se a credencial já está salva, confira o endereço e se a conta tem acesso a esse repositório.'
    case GIT_FAILURE.NOT_FOUND:
      return 'O repositório não foi encontrado: confira o endereço, ou se a sua conta do Git tem acesso a ele.'
    case GIT_FAILURE.BRANCH:
      return 'A branch não existe nesse repositório: confira o nome da branch.'
    case GIT_FAILURE.NETWORK:
      return 'Sem conexão com o servidor do repositório: confira a internet e tente de novo.'
    case GIT_FAILURE.TIMEOUT:
      return `O Git passou de ${gitTimeoutMs(interactive) / 1000} s e foi interrompido. Confira a conexão e tente de novo.`
    default:
      return null
  }
}

module.exports = {
  GIT_FAILURE,
  GIT_INTERACTIVE_TIMEOUT_MS,
  GIT_TIMEOUT_MS,
  classifyGitFailure,
  describeGitFailure,
  gitEnvironment,
  gitTimeoutMs,
}

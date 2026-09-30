'use strict'

/**
 * @module agent-cli-versions
 * Versão instalada de cada CLI de agente, para a retomada de conversa.
 *
 * O renderer decide se volta a uma conversa pelo ID olhando a versão da CLI
 * (`src/features/canvas/services/agent-resume-capability.ts`), e o
 * {@link module:pty-process-manager} grava essa versão junto de cada conversa
 * descoberta. Os dois leem daqui.
 *
 * A leitura é `<cli> --version` pelo `detectCli` de sempre, com o tempo-limite
 * dele — nunca uma sondagem interativa. A detecção da abertura do app já roda
 * esse comando para todas as CLIs; `seed` reaproveita o resultado, e uma
 * pergunta feita enquanto ela corre espera por ela em vez de repetir. Depois
 * disso a leitura vale `ttlMs`: passado o prazo, a próxima pergunta lê de
 * novo, e uma CLI atualizada com o app aberto aparece na próxima montagem do
 * canvas sem que a conversa gravada seja apagada. Se a versão ainda estiver
 * velha nesse meio-tempo, o detector de recusa do renderer segura o caso.
 *
 * Leitura sem versão vale pouco: na abertura, o `--version` das oito CLIs
 * disputa a CPU com o boot do app, e o do Gemini (uns 7 s ocioso, medido na
 * 0.62) pode estourar o tempo-limite. Guardar esse `null` por `ttlMs`
 * desligaria a retomada pelo ID do Gemini por dez minutos. Por isso o `null`
 * da abertura não vale nada (a primeira pergunta lê de novo, já sem a
 * disputa) e o de uma leitura própria vale só `missingTtlMs`.
 */

const { SUPPORTED_CLIS, detectCli } = require('../core/cli-detector.cjs')

/** As CLIs cuja retomada o canvas decide pela versão. */
const AGENT_CLI_PROVIDERS = Object.freeze(['claude', 'codex', 'gemini'])

/** Quanto tempo uma leitura de versão vale antes de ser refeita. */
const VERSION_TTL_MS = 10 * 60 * 1000

/** Quanto tempo vale uma leitura sem versão (CLI ausente ou lenta demais). */
const MISSING_VERSION_TTL_MS = 60 * 1000

/**
 * Mesma regra de `CLI_VERSION_PATTERN` em agent-resume-capability.ts: o
 * renderer recusa a referência inteira com uma versão fora dela, então aqui
 * só passa o que ele aceita. `parseVersionFromOutput` devolve a primeira linha
 * crua quando não acha número, e isso nunca é versão.
 */
const CLI_VERSION_PATTERN = /^\d{1,6}\.\d{1,6}(?:\.\d{1,6})?(?:-[0-9A-Za-z._]{1,40})?$/

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function normalizeCliVersion(value) {
  return typeof value === 'string' && CLI_VERSION_PATTERN.test(value) ? value : null
}

/**
 * Lê a versão de uma CLI com `detectCli`.
 *
 * @param {string} provider
 * @param {Record<string, string | undefined>} [env]
 * @returns {Promise<string | null>}
 */
async function detectAgentCliVersion(provider, env) {
  const cli = SUPPORTED_CLIS.find((candidate) => candidate.command === provider)
  if (!cli) return null
  try {
    const result = await detectCli(cli, env)
    return result.detected ? normalizeCliVersion(result.version) : null
  } catch {
    return null
  }
}

/**
 * @param {object} [options]
 * @param {(provider: string) => Promise<string | null>} [options.detect] - Lê a versão; `null` quando não há. A instância roteirizada passa uma que não roda nada.
 * @param {() => number} [options.now]
 * @param {number} [options.ttlMs]
 * @param {number} [options.missingTtlMs]
 * @param {readonly string[]} [options.providers]
 */
function createAgentCliVersions({
  detect = (provider) => detectAgentCliVersion(provider),
  now = Date.now,
  ttlMs = VERSION_TTL_MS,
  missingTtlMs = MISSING_VERSION_TTL_MS,
  providers = AGENT_CLI_PROVIDERS,
} = {}) {
  /** @type {Map<string, { version: string | null, readAt: number }>} */
  const readings = new Map()
  /** @type {Map<string, Promise<string | null>>} */
  const inFlight = new Map()
  /** @type {Promise<void> | null} */
  let startup = null

  /**
   * @param {string} provider
   * @param {unknown} version
   * @param {{ fromStartup?: boolean }} [options]
   */
  function remember(provider, version, { fromStartup = false } = {}) {
    const normalized = normalizeCliVersion(version)
    // Sem versão na abertura: já vencida, para a primeira pergunta ler de novo.
    const readAt = normalized === null && fromStartup ? Number.NEGATIVE_INFINITY : now()
    readings.set(provider, { version: normalized, readAt })
  }

  function isFresh(reading) {
    return now() - reading.readAt < (reading.version === null ? missingTtlMs : ttlMs)
  }

  function read(provider) {
    const running = inFlight.get(provider)
    if (running) return running
    const reading = Promise.resolve()
      .then(() => detect(provider))
      .catch(() => null)
      .then((version) => {
        remember(provider, version)
        return normalizeCliVersion(version)
      })
      .finally(() => inFlight.delete(provider))
    inFlight.set(provider, reading)
    return reading
  }

  /**
   * @param {string} provider
   * @returns {Promise<string | null>}
   */
  async function get(provider) {
    if (!providers.includes(provider)) return null
    if (startup) await startup
    const reading = readings.get(provider)
    if (reading && isFresh(reading)) return reading.version
    return read(provider)
  }

  return {
    /**
     * Reaproveita a detecção da abertura do app (`detectAllClis`). Enquanto
     * ela corre, `get` e `snapshot` esperam por ela.
     *
     * @param {Promise<Array<{ command: string, detected: boolean, version: string | null }>>} results
     */
    seed(results) {
      startup = Promise.resolve(results)
        .then((list) => {
          for (const result of Array.isArray(list) ? list : []) {
            if (providers.includes(result?.command)) {
              remember(result.command, result.detected ? result.version : null, { fromStartup: true })
            }
          }
        })
        .catch(() => {})
        .finally(() => {
          startup = null
        })
    },

    /**
     * A última versão lida, sem esperar nada: é o que vai carimbado numa
     * conversa descoberta. `null` = ainda não lida, ou não respondeu.
     *
     * @param {string} provider
     * @returns {string | null}
     */
    peek(provider) {
      return readings.get(provider)?.version ?? null
    },

    get,

    /** @returns {Promise<Record<string, string | null>>} */
    async snapshot() {
      const versions = await Promise.all(providers.map((provider) => get(provider)))
      return Object.fromEntries(providers.map((provider, index) => [provider, versions[index]]))
    },
  }
}

module.exports = {
  AGENT_CLI_PROVIDERS,
  CLI_VERSION_PATTERN,
  MISSING_VERSION_TTL_MS,
  VERSION_TTL_MS,
  createAgentCliVersions,
  detectAgentCliVersion,
  normalizeCliVersion,
}

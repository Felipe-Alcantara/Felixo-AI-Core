/**
 * @module agent-models/agent-model-discovery
 * Consulta cada CLI para saber quais modelos ela oferece agora.
 *
 * Executa o mínimo possível: o Codex não é sequer invocado, porque a própria
 * CLI mantém `~/.codex/models_cache.json` com os modelos e os níveis de
 * esforço aceitos por cada um — ler o arquivo é instantâneo e não gasta uma
 * chamada. O Claude precisa responder ao `/model`; o Gemini não é consultado
 * (ver `GEMINI_SEM_LISTAGEM`).
 *
 * Três garantias, todas cobertas por teste, porque isto roda na inicialização
 * do app e não pode atrapalhar:
 * - as fontes são consultadas em paralelo (em série os timeouts se somariam);
 * - cada uma tem timeout próprio, para que uma CLI pendurada não prenda a
 *   atualização em background;
 * - a falha de uma não afeta as outras — no ambiente do dono do projeto o
 *   Gemini falha por elegibilidade da conta enquanto as demais respondem.
 *
 * O I/O concreto (spawn e leitura de arquivo) chega por injeção, o que mantém
 * este módulo testável sem tocar nas CLIs reais.
 */

const { parseClaudeModelOutput, parseCodexModelsCache } = require('./agent-model-parsers.cjs')

/**
 * A Gemini CLI não lista modelos fora do modo interativo: `gemini -p "/model"`
 * abre um diálogo, encerra sem lista e ainda consulta a cota da conta.
 */
const GEMINI_SEM_LISTAGEM = 'a CLI do Gemini não lista modelos fora do modo interativo'

/** Uma CLI saudável responde ao `/model` em poucos segundos. */
const DEFAULT_TIMEOUT_MS = 15_000

/**
 * @param {object} params
 * @param {Record<string, string | null>} [params.motivos] Saída opcional: para
 *   cada agente, `null` quando a descoberta deu certo ou o motivo curto da
 *   falha. É o que a tela mostra no lugar de um silêncio.
 */
async function discoverAgentModels({
  runCli,
  readCodexCache,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  motivos = {},
} = {}) {
  const [claude, codex] = await Promise.all([
    discoverFromCli({ agentId: 'claude', command: 'claude', runCli, timeoutMs, parse: parseClaudeModelOutput }),
    discoverCodex({ readCodexCache, timeoutMs }),
  ])

  const resultado = {}
  for (const entrada of [claude, codex]) {
    motivos[entrada.agentId] = entrada.motivo
    if (entrada.data) {
      resultado[entrada.agentId] = entrada.data
    }
  }
  motivos.gemini = GEMINI_SEM_LISTAGEM

  return resultado
}

function falha(agentId, error, padrao) {
  return { agentId, data: null, motivo: error instanceof Error && error.message ? error.message : padrao }
}

async function discoverFromCli({ agentId, command, runCli, timeoutMs, parse }) {
  try {
    const saida = await withTimeout(
      runCli(command, ['-p', '/model']),
      timeoutMs,
      `${command} não respondeu a tempo`,
    )
    const models = parse(saida)

    // Lista vazia não vira entrada: significa "não descobri" (erro de auth,
    // formato novo), e quem resolve o catálogo precisa distinguir isso de uma
    // lista legitimamente curta.
    return models.length > 0
      ? { agentId, data: { models }, motivo: null }
      : { agentId, data: null, motivo: `${command} respondeu sem lista de modelos` }
  } catch (error) {
    return falha(agentId, error, `${command} não respondeu`)
  }
}

async function discoverCodex({ readCodexCache, timeoutMs }) {
  try {
    const bruto = await withTimeout(
      readCodexCache(),
      timeoutMs,
      'cache do codex não respondeu a tempo',
    )
    const { models } = parseCodexModelsCache(JSON.parse(bruto))

    if (models.length === 0) {
      return { agentId: 'codex', data: null, motivo: 'o cache do codex não lista modelos' }
    }

    const effortLevels = {}
    for (const modelo of models) {
      if (modelo.effortLevels.length > 0) {
        effortLevels[modelo.id] = modelo.effortLevels
      }
    }

    return {
      agentId: 'codex',
      motivo: null,
      data: {
        models: models.map((modelo) => modelo.id),
        labels: Object.fromEntries(
          models.filter((modelo) => modelo.label).map((modelo) => [modelo.id, modelo.label]),
        ),
        ...(Object.keys(effortLevels).length > 0 ? { effortLevels } : {}),
      },
    }
  } catch (error) {
    return falha('codex', error, 'não foi possível ler o cache do codex')
  }
}

function withTimeout(promise, timeoutMs, mensagem) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(mensagem)), timeoutMs)
    // unref para o timer não segurar o encerramento do processo se a promise
    // pendurar até o app fechar.
    timer.unref?.()

    promise.then(
      (valor) => {
        clearTimeout(timer)
        resolve(valor)
      },
      (erro) => {
        clearTimeout(timer)
        reject(erro)
      },
    )
  })
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  discoverAgentModels,
}

/**
 * @module agent-models/agent-model-discovery
 * Consulta cada CLI para saber quais modelos ela oferece agora.
 *
 * Executa o mínimo possível: o Codex não é sequer invocado, porque a própria
 * CLI mantém `~/.codex/models_cache.json` com os modelos e os níveis de
 * esforço aceitos por cada um — ler o arquivo é instantâneo e não gasta uma
 * chamada. Claude e Gemini precisam responder ao `/model`.
 *
 * Três garantias, todas cobertas por teste, porque isto roda na inicialização
 * do app e não pode atrapalhar:
 * - as CLIs são consultadas em paralelo (em série seriam três timeouts somados);
 * - cada uma tem timeout próprio, para que uma CLI pendurada não prenda a
 *   atualização em background;
 * - a falha de uma não afeta as outras — no ambiente do dono do projeto o
 *   Gemini falha por elegibilidade da conta enquanto as demais respondem.
 *
 * O I/O concreto (spawn e leitura de arquivo) chega por injeção, o que mantém
 * este módulo testável sem tocar nas CLIs reais.
 */

const {
  parseClaudeModelOutput,
  parseCodexModelsCache,
  parseGeminiModelOutput,
} = require('./agent-model-parsers.cjs')

/** Uma CLI saudável responde ao `/model` em poucos segundos. */
const DEFAULT_TIMEOUT_MS = 15_000

async function discoverAgentModels({
  runCli,
  readCodexCache,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const [claude, codex, gemini] = await Promise.all([
    discoverFromCli({ agentId: 'claude', command: 'claude', runCli, timeoutMs, parse: parseClaudeModelOutput }),
    discoverCodex({ readCodexCache, timeoutMs }),
    discoverFromCli({ agentId: 'gemini', command: 'gemini', runCli, timeoutMs, parse: parseGeminiModelOutput }),
  ])

  const resultado = {}
  for (const entrada of [claude, codex, gemini]) {
    if (entrada) {
      resultado[entrada.agentId] = entrada.data
    }
  }

  return resultado
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
    return models.length > 0 ? { agentId, data: { models } } : null
  } catch {
    return null
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
      return null
    }

    const effortLevels = {}
    for (const modelo of models) {
      if (modelo.effortLevels.length > 0) {
        effortLevels[modelo.id] = modelo.effortLevels
      }
    }

    return {
      agentId: 'codex',
      data: {
        models: models.map((modelo) => modelo.id),
        labels: Object.fromEntries(
          models.filter((modelo) => modelo.label).map((modelo) => [modelo.id, modelo.label]),
        ),
        ...(Object.keys(effortLevels).length > 0 ? { effortLevels } : {}),
      },
    }
  } catch {
    return null
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

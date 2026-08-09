/**
 * @module agent-models/agent-model-parsers
 * Leitura dos modelos que cada CLI de agente oferece HOJE.
 *
 * A lista de modelos vivia fixa no código e envelhecia a cada release das
 * empresas — modelo novo não aparecia, modelo removido continuava sendo
 * oferecido. Cada CLI publica essa informação de um jeito diferente:
 *
 * - Codex mantém `~/.codex/models_cache.json`, atualizado pela própria CLI,
 *   com os níveis de esforço aceitos por modelo.
 * - Claude responde a `claude -p "/model"` com uma linha `Available: ...`.
 * - Gemini não tem cache nem flag de listagem; sobra ler a saída do `/model`,
 *   que pode nem vir (a CLI falha quando a conta perde elegibilidade).
 *
 * Só o parsing mora aqui: sem I/O, sem spawn, sem cache. Assim os formatos —
 * que são exatamente o que muda quando uma CLI é atualizada — ficam cobertos
 * por teste com as saídas reais capturadas das CLIs instaladas.
 */

/** Níveis de esforço que o app sabe transformar em flag de linha de comando. */
const KNOWN_EFFORT_LEVELS = new Set(['low', 'medium', 'high', 'xhigh', 'max', 'ultra'])

/** Encerra a lista do Claude: vem depois dos modelos, não é um deles. */
const CLAUDE_LIST_TERMINATOR = /^or a full model id\.?$/i

/**
 * Modelos anunciados por `claude -p "/model"`.
 *
 * @param {string} output - stdout cru da CLI.
 * @returns {string[]} ids na ordem anunciada, sem repetição.
 */
function parseClaudeModelOutput(output) {
  const texto = String(output ?? '')
  const match = /Available:\s*([^\n]+)/i.exec(texto)

  if (!match) {
    return []
  }

  const modelos = match[1]
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item && !CLAUDE_LIST_TERMINATOR.test(item))

  return [...new Set(modelos)]
}

/**
 * Modelos e níveis de esforço do cache que a CLI do Codex mantém.
 *
 * @param {unknown} cache - conteúdo já parseado de `models_cache.json`.
 * @returns {{ models: Array<{ id: string, label?: string, effortLevels: string[], defaultEffort?: string }> }}
 */
function parseCodexModelsCache(cache) {
  const lista = Array.isArray(cache?.models) ? cache.models : []

  const models = lista
    // `hide` marca modelos internos da CLI (variantes -wm, auto-review); o
    // menu de agentes não deve oferecê-los.
    .filter((modelo) => modelo?.slug && modelo.visibility !== 'hide')
    .map((modelo) => ({
      id: String(modelo.slug),
      label: typeof modelo.display_name === 'string' ? modelo.display_name : undefined,
      effortLevels: parseCodexEffortLevels(modelo.supported_reasoning_levels),
      defaultEffort:
        typeof modelo.default_reasoning_level === 'string'
          ? modelo.default_reasoning_level
          : undefined,
    }))

  return { models }
}

function parseCodexEffortLevels(levels) {
  if (!Array.isArray(levels)) {
    return []
  }

  // Um nível desconhecido viraria uma flag inválida na linha de comando, então
  // fica de fora mesmo que a CLI o anuncie.
  return levels
    .map((nivel) => (typeof nivel === 'string' ? nivel : nivel?.effort))
    .filter((efeito) => typeof efeito === 'string' && KNOWN_EFFORT_LEVELS.has(efeito))
}

/** Identificador com cara de modelo Gemini, para não capturar log solto. */
const GEMINI_MODEL_PATTERN = /^gemini-[a-z0-9][a-z0-9.\-]*$/i

/**
 * Modelos encontrados na saída do Gemini.
 *
 * A CLI não tem listagem própria, então isto é reconhecimento por formato: só
 * linhas que são exatamente um identificador `gemini-*` contam. É deliberado
 * que uma saída de erro produza lista vazia — a CLI falha inteira quando a
 * conta perde elegibilidade, e um traceback não pode virar opção de menu.
 *
 * @param {string} output
 * @returns {string[]}
 */
function parseGeminiModelOutput(output) {
  const modelos = String(output ?? '')
    .split('\n')
    .map((linha) => linha.trim().replace(/^[-*•]\s*/, ''))
    .filter((linha) => GEMINI_MODEL_PATTERN.test(linha))

  return [...new Set(modelos)]
}

module.exports = {
  KNOWN_EFFORT_LEVELS,
  parseClaudeModelOutput,
  parseCodexModelsCache,
  parseGeminiModelOutput,
}

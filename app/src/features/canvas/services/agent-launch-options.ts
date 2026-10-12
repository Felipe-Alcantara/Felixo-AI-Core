/**
 * Catalog of the native agent CLIs and how to turn the user's choices
 * (model / effort / yolo) into the real command-line arguments each one expects.
 *
 * Flags verified against the installed CLIs (`<cli> --help`):
 * - Claude Code: --model <m> · --effort <low|medium|high|xhigh|max> · --dangerously-skip-permissions
 *   (níveis conferidos no `claude --help` da 2.1.285)
 * - Codex:       --model <m> · -c model_reasoning_effort=<...> · -c service_tier=priority (fast) · --dangerously-bypass-approvals-and-sandbox
 * - Gemini:      --model <m> · (no effort) · --yolo
 *
 * Codex model slugs and their supported effort levels come straight from
 * `~/.codex/models_cache.json` (fetched by the installed CLI itself) — each
 * model advertises a different effort set, e.g. Terra supports "ultra" but
 * Luna doesn't, so effort options must be looked up per model, not per agent.
 */

export type AgentId = 'claude' | 'codex' | 'gemini' | 'openia'

export type EffortLevel = 'low' | 'medium' | 'high' | 'max' | 'xhigh' | 'ultra'

export type AgentDefinition = {
  id: AgentId
  /** Binary to launch. */
  command: string
  label: string
  /** Model options shown in the menu (extendable — adding new ones is safe). */
  models: string[]
  /** Launcher whose interface/key/model contract is configured by its host UI. */
  isLauncher?: boolean
  /**
   * Effort levels supported, or null when the CLI has no effort flag.
   * Either a flat list shared by every model, or a per-model lookup (Codex).
   */
  effortLevels: EffortLevel[] | Record<string, EffortLevel[]> | null
  /**
   * Modelos que aceitam o modo fast (`service_tier = "priority"`, rotulado
   * "Fast" pelo próprio Codex: mais rápido, mais uso do limite). Vem do
   * catálogo de modelos do Codex (`serviceTiers` de cada modelo). Ausente =
   * a CLI não tem o modo.
   */
  fastModels?: string[]
}

export const AGENTS: AgentDefinition[] = [
  {
    id: 'claude',
    command: 'claude',
    label: 'Claude',
    models: ['opus', 'sonnet', 'haiku'],
    // Na ordem do `claude --help` (2.1.285): o xhigh fica entre high e max.
    effortLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
  },
  {
    id: 'codex',
    command: 'codex',
    label: 'Codex',
    models: ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'],
    effortLevels: {
      'gpt-5.6-sol': ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
      'gpt-5.6-terra': ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
      'gpt-5.6-luna': ['low', 'medium', 'high', 'xhigh', 'max'],
    },
    fastModels: ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'],
  },
  {
    id: 'gemini',
    command: 'gemini',
    label: 'Gemini',
    models: ['gemini-3-pro-preview', 'gemini-3-flash', 'gemini-2.5-pro'],
    effortLevels: null,
  },
  {
    id: 'openia',
    command: 'openia',
    label: 'Openia (launcher OpenRouter)',
    models: [],
    effortLevels: null,
    isLauncher: true,
  },
]

export function getAgent(id: AgentId): AgentDefinition | undefined {
  return AGENTS.find((agent) => agent.id === id)
}

/** Default Codex effort set — used when `model` isn't a recognized slug. */
const DEFAULT_CODEX_EFFORT_LEVELS = (AGENTS.find((a) => a.id === 'codex')
  ?.effortLevels as Record<string, EffortLevel[]>)['gpt-5.6-sol']

/** Effort levels available for `agent`, resolved against `model` when the agent's list is per-model. */
export function getEffortLevels(
  agent: AgentDefinition,
  model: string,
): EffortLevel[] | null {
  const { effortLevels } = agent
  if (!effortLevels) {
    return null
  }
  if (Array.isArray(effortLevels)) {
    return effortLevels
  }
  if (agent.id === 'codex') {
    return effortLevels[model] ?? DEFAULT_CODEX_EFFORT_LEVELS
  }
  return effortLevels[model] ?? null
}

/**
 * True quando o modo fast pode ser oferecido/aplicado para `agent` + `model`.
 * Modelo vazio ("padrão") conta como compatível: todo modelo do Codex que o
 * Felixo lista aceita o tier, então o padrão também.
 */
export function supportsFastMode(agent: AgentDefinition | undefined, model: string): boolean {
  if (!agent?.fastModels?.length) {
    return false
  }
  return !model || agent.fastModels.includes(model)
}

/** True when `effort` is a valid choice for `agent` + `model` (empty effort is always valid — it means "default"). */
export function isEffortValidForModel(
  agent: AgentDefinition,
  model: string,
  effort: string,
): boolean {
  if (!effort) {
    return true
  }
  return getEffortLevels(agent, model)?.includes(effort as EffortLevel) ?? false
}

/**
 * True when `command` is a native agent CLI (claude/codex/gemini) — the only
 * terminals meant to receive a standing instruction typed after they spawn
 * (quality standard, `/resume`). A terminal running an arbitrary command
 * (e.g. `python file.py` from the Projects panel) has a command too, but
 * typing text into it afterwards would go to that process' stdin instead,
 * which is not what either feature is for.
 */
export function isKnownAgentCommand(command?: string): boolean {
  return AGENTS.some((agent) => agent.command === command && !agent.isLauncher)
}

/**
 * True for the Openia invocation assembled by the Felixo spawn form. Old
 * persisted launcher nodes have no `run` argument and must keep their opaque,
 * manual-menu behavior.
 */
export function isDirectOpeniaLaunch(
  command?: string,
  args?: readonly string[],
): boolean {
  return command === 'openia' && args?.[0] === 'run'
}

export type AgentLaunchChoices = {
  agentId: AgentId
  /** Empty string means "default model" — no model flag is added. */
  model?: string
  effort?: EffortLevel
  yolo?: boolean
  /** Modo fast do Codex; ignorado quando o agente/modelo não o suporta. */
  fast?: boolean
}

/**
 * Builds the real CLI args for a launch choice, per the flag tables above.
 * Returns `null` when the agent is unknown.
 */
export function buildAgentArgs(choices: AgentLaunchChoices): string[] | null {
  const agent = getAgent(choices.agentId)
  if (!agent) {
    return null
  }

  // Openia has a dedicated host-UI contract. The generic native-agent helper
  // must not invent flags; use the launcher-specific builder instead.
  if (agent.isLauncher) {
    return []
  }

  const args: string[] = []

  if (choices.model) {
    args.push('--model', choices.model)
  }

  const availableEffortLevels = getEffortLevels(agent, choices.model ?? '')
  if (choices.effort && availableEffortLevels?.includes(choices.effort)) {
    if (agent.id === 'claude') {
      args.push('--effort', choices.effort)
    } else if (agent.id === 'codex') {
      args.push('-c', `model_reasoning_effort=${choices.effort}`)
    }
  }

  if (choices.fast && agent.id === 'codex' && supportsFastMode(agent, choices.model ?? '')) {
    args.push('-c', 'service_tier=priority')
  }

  if (choices.yolo) {
    if (agent.id === 'claude') {
      args.push('--dangerously-skip-permissions')
    } else if (agent.id === 'codex') {
      args.push('--dangerously-bypass-approvals-and-sandbox')
    } else if (agent.id === 'gemini') {
      args.push('--yolo')
    }
  }

  return args
}

/**
 * As duas grafias da mesma opção do Codex. Para o `clap` (o parser da CLI) são
 * um argumento só: a flag longa mais o apelido `--yolo` também é "usada várias
 * vezes". Medido com o `codex` 0.162.1.
 */
const CODEX_YOLO_FLAGS: ReadonlySet<string> = new Set([
  '--dangerously-bypass-approvals-and-sandbox',
  '--yolo',
])

/**
 * Rede de segurança do lançamento: o Codex recusa subir com duas flags de yolo
 * antes do subcomando ("the argument '…' cannot be used multiple times"), antes
 * mesmo de olhar conta ou modelo — e o bloco nasce "encerrado". Mantém a
 * PRIMEIRA ocorrência e devolve o que descartou, para o chamador registrar.
 *
 * Só o Codex: o Claude e o Gemini aceitam a repetição. Só descarta opção
 * repetida de yolo (nunca `-c` ou `--model`, que podem repetir de propósito), e
 * deixa em paz tudo depois de `--`, que já é texto e não opção.
 */
export function dropRepeatedYoloFlags(
  command: string | undefined,
  args: readonly string[],
): { args: string[]; removed: string[] } {
  if (command !== 'codex') {
    return { args: [...args], removed: [] }
  }

  const kept: string[] = []
  const removed: string[] = []
  let sawYolo = false
  let afterDoubleDash = false

  for (const arg of args) {
    if (afterDoubleDash) {
      kept.push(arg)
      continue
    }
    if (arg === '--') {
      afterDoubleDash = true
      kept.push(arg)
      continue
    }
    if (CODEX_YOLO_FLAGS.has(arg)) {
      if (sawYolo) {
        removed.push(arg)
        continue
      }
      sawYolo = true
    }
    kept.push(arg)
  }

  return { args: kept, removed }
}

/**
 * Tira todas as grafias de yolo do Codex, preservando o resto (e o que vem
 * depois de `--`). É o que o fallback de "o Codex recusou a repetição" manda
 * de volta: a flag que a CLI já recebeu de fora fica valendo, a do app sai.
 */
export function withoutCodexYoloFlags(command: string | undefined, args: readonly string[]): string[] {
  if (command !== 'codex') {
    return [...args]
  }

  const kept: string[] = []
  let afterDoubleDash = false
  for (const arg of args) {
    if (afterDoubleDash) {
      kept.push(arg)
      continue
    }
    if (arg === '--') {
      afterDoubleDash = true
      kept.push(arg)
      continue
    }
    if (!CODEX_YOLO_FLAGS.has(arg)) {
      kept.push(arg)
    }
  }
  return kept
}

/** Quantas flags de yolo do Codex há na lista (as duas grafias contam como uma opção). */
export function countCodexYoloFlags(args: readonly string[]): number {
  return args.filter((arg) => CODEX_YOLO_FLAGS.has(arg)).length
}

const CODEX_REPEATED_YOLO_ERROR = new RegExp(
  `theargument'(?:${[...CODEX_YOLO_FLAGS].join('|')})'cannotbeusedmultipletimes`,
  'i',
)

/**
 * A saída do Codex quando ele recusa a flag de yolo repetida:
 * "error: the argument '--dangerously-bypass-approvals-and-sandbox' cannot be
 * used multiple times". O terminal quebra a linha nas colunas (no meio da frase
 * ou até da flag), então a comparação ignora todo espaço em branco.
 */
export function codexRejectedRepeatedYolo(output: string): boolean {
  return CODEX_REPEATED_YOLO_ERROR.test(output.replace(/\s+/g, ''))
}

/** Short human label for the block, e.g. "Claude opus" or "Codex sol ⚡". */
export function describeLaunch(choices: AgentLaunchChoices): string {
  const agent = getAgent(choices.agentId)
  const parts = [agent?.label ?? choices.agentId]
  if (choices.model) {
    parts.push(choices.model)
  }
  // Aparece no cabeçalho do terminal: fast gasta mais limite, a pessoa precisa ver.
  if (choices.fast && supportsFastMode(agent, choices.model ?? '')) {
    parts.push('⚡ fast')
  }
  if (choices.yolo) {
    parts.push('yolo')
  }
  return parts.join(' ')
}

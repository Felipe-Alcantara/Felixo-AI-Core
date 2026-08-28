/**
 * Catalog of the native agent CLIs and how to turn the user's choices
 * (model / effort / yolo) into the real command-line arguments each one expects.
 *
 * Flags verified against the installed CLIs (`<cli> --help`):
 * - Claude Code: --model <m> · --effort <low|medium|high|max> · --dangerously-skip-permissions
 * - Codex:       --model <m> · -c model_reasoning_effort=<...> · --dangerously-bypass-approvals-and-sandbox
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
}

export const AGENTS: AgentDefinition[] = [
  {
    id: 'claude',
    command: 'claude',
    label: 'Claude',
    models: ['opus', 'sonnet', 'haiku'],
    effortLevels: ['low', 'medium', 'high', 'max'],
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

/** Short human label for the block, e.g. "Claude opus" or "Codex sol ⚡". */
export function describeLaunch(choices: AgentLaunchChoices): string {
  const agent = getAgent(choices.agentId)
  const parts = [agent?.label ?? choices.agentId]
  if (choices.model) {
    parts.push(choices.model)
  }
  if (choices.yolo) {
    parts.push('yolo')
  }
  return parts.join(' ')
}

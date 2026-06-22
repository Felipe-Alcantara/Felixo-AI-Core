/**
 * Catalog of the native agent CLIs and how to turn the user's choices
 * (model / effort / yolo) into the real command-line arguments each one expects.
 *
 * Flags verified against the installed CLIs (`<cli> --help`):
 * - Claude Code: --model <m> · --effort <low|medium|high|max> · --dangerously-skip-permissions
 * - Codex:       --model <m> · -c model_reasoning_effort=<low|medium|high|xhigh> · --dangerously-bypass-approvals-and-sandbox
 * - Gemini:      --model <m> · (no effort) · --yolo
 */

export type AgentId = 'claude' | 'codex' | 'gemini'

export type EffortLevel = 'low' | 'medium' | 'high' | 'max' | 'xhigh'

export type AgentDefinition = {
  id: AgentId
  /** Binary to launch. */
  command: string
  label: string
  /** Model options shown in the menu (extendable — adding new ones is safe). */
  models: string[]
  /** Effort levels supported, or null when the CLI has no effort flag. */
  effortLevels: EffortLevel[] | null
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
    models: ['gpt-5.5', 'gpt-5.5-codex', 'gpt-5.4'],
    effortLevels: ['low', 'medium', 'high', 'xhigh'],
  },
  {
    id: 'gemini',
    command: 'gemini',
    label: 'Gemini',
    models: ['gemini-3-pro-preview', 'gemini-3-flash', 'gemini-2.5-pro'],
    effortLevels: null,
  },
]

export function getAgent(id: AgentId): AgentDefinition | undefined {
  return AGENTS.find((agent) => agent.id === id)
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

  const args: string[] = []

  if (choices.model) {
    args.push('--model', choices.model)
  }

  if (choices.effort && agent.effortLevels?.includes(choices.effort)) {
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

/** Short human label for the block, e.g. "Claude opus" or "Codex gpt-5.5 ⚡". */
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

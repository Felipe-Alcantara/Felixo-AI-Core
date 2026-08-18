import type { AutomationDefinition } from '../../shared/types/automations'

/**
 * Combines prompt bodies in the order selected by the catalog, keeping each
 * original body intact and adding only a visible boundary around it. The
 * boundary gives the agent enough provenance to distinguish instructions from
 * separate presets without silently rewriting what the user saved.
 */
export function composeSelectedPrompts(
  prompts: AutomationDefinition[],
): string {
  return prompts
    .filter((prompt) => prompt.prompt.trim())
    .map((prompt) => `## ${prompt.name}\n\n${prompt.prompt}`)
    .join('\n\n---\n\n')
}

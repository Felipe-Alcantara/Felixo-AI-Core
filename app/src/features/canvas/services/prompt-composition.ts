import type { AutomationDefinition } from '../../shared/types/automations'
import {
  createPromptInsertion,
  type PromptInsertion,
  type PromptInsertionInput,
} from '../../shared/types/prompt-insertion'

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

/**
 * Builds the provenance record for a multi-select insertion without changing
 * the established prompt payload. Empty prompt bodies are treated exactly as
 * `composeSelectedPrompts`: their names do not enter the combined list.
 */
export function composeSelectedPromptInsertion(
  prompts: AutomationDefinition[],
  options: Pick<PromptInsertionInput, 'autoSubmit' | 'timestamp'> = {},
): PromptInsertion {
  const selected = prompts.filter((prompt) => prompt.prompt.trim())
  const content = composeSelectedPrompts(selected)
  return createPromptInsertion({
    id: `catalog-combined:${selected.map((prompt) => prompt.id).join('+') || 'empty'}`,
    source: 'catalog',
    content,
    combinedNames: selected.map((prompt) => prompt.name),
    ...options,
    // Inserir do catálogo só digita: o texto espera a pessoa revisar e
    // apertar Enter (decisão de 30/09/2026; antes a combinação era enviada).
    autoSubmit: options.autoSubmit ?? false,
  })
}

/** Explicit name for callers that do not use the catalog wording. */
export const createCombinedPromptInsertion = composeSelectedPromptInsertion

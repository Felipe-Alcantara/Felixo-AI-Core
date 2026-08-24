import type { AutomationDefinition } from '../../shared/types/automations'

export const CUSTOM_AUTOMATION_TEXT_REQUIRED =
  'Preencha o texto do prompt para criá-lo.'

export const CUSTOM_AUTOMATION_CREATION_FAILED =
  'Não foi possível criar este prompt. Tente novamente.'

type AutomationSaveResult = {
  ok: boolean
  automation?: AutomationDefinition
} | undefined

type SaveAutomation = (
  automation: AutomationDefinition,
) => Promise<AutomationSaveResult>

export type CustomAutomationCreationResult =
  | { status: 'saved'; automation: AutomationDefinition }
  | { status: 'missing-prompt'; message: string }
  | { status: 'failed'; message: string }

/**
 * The creation form is a local draft until the backend accepts it. Keeping it
 * out of `custom` prevents an invalid blank prompt from looking persisted and
 * then disappearing on the next load.
 */
export async function createCustomAutomation(
  draft: AutomationDefinition,
  save: SaveAutomation,
  now: () => string = () => new Date().toISOString(),
): Promise<CustomAutomationCreationResult> {
  const prompt = draft.prompt.trim()
  if (!prompt) {
    return { status: 'missing-prompt', message: CUSTOM_AUTOMATION_TEXT_REQUIRED }
  }

  const automation: AutomationDefinition = {
    ...draft,
    name: draft.name.trim() || 'Novo prompt',
    description: draft.description.trim(),
    prompt,
    updatedAt: now(),
  }

  try {
    const result = await save(automation)
    if (result?.ok) {
      return { status: 'saved', automation: result.automation ?? automation }
    }
  } catch {
    // The caller uses the same actionable feedback for rejected IPC calls.
  }

  return { status: 'failed', message: CUSTOM_AUTOMATION_CREATION_FAILED }
}

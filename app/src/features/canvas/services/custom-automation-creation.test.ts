import { describe, expect, it, vi } from 'vitest'
import type { AutomationDefinition } from '../../shared/types/automations'
import {
  createCustomAutomation,
  CUSTOM_AUTOMATION_CREATION_FAILED,
  CUSTOM_AUTOMATION_TEXT_REQUIRED,
} from './custom-automation-creation'

const draft: AutomationDefinition = {
  id: 'automation-qa',
  name: '  Novo prompt  ',
  description: '  Descrição de QA  ',
  prompt: '',
  scope: 'chat',
  createdAt: '2026-08-24T00:00:00.000Z',
  updatedAt: '2026-08-24T00:00:00.000Z',
}

describe('createCustomAutomation', () => {
  it('does not call the backend for an empty draft and explains what is missing', async () => {
    const save = vi.fn()

    await expect(createCustomAutomation(draft, save)).resolves.toEqual({
      status: 'missing-prompt',
      message: CUSTOM_AUTOMATION_TEXT_REQUIRED,
    })

    expect(save).not.toHaveBeenCalled()
  })

  it('adds only the backend-confirmed automation after the first valid text', async () => {
    const save = vi.fn().mockResolvedValue({ ok: true })
    const saved = await createCustomAutomation(
      { ...draft, prompt: '  Prompt válido de QA.  ' },
      save,
      () => '2026-08-24T00:01:00.000Z',
    )

    expect(save).toHaveBeenCalledWith({
      ...draft,
      name: 'Novo prompt',
      description: 'Descrição de QA',
      prompt: 'Prompt válido de QA.',
      updatedAt: '2026-08-24T00:01:00.000Z',
    })
    expect(saved).toEqual({
      status: 'saved',
      automation: {
        ...draft,
        name: 'Novo prompt',
        description: 'Descrição de QA',
        prompt: 'Prompt válido de QA.',
        updatedAt: '2026-08-24T00:01:00.000Z',
      },
    })
  })

  it('keeps the draft out of the collection when the backend rejects it', async () => {
    const save = vi.fn().mockResolvedValue({ ok: false })

    await expect(
      createCustomAutomation({ ...draft, prompt: 'Prompt válido.' }, save),
    ).resolves.toEqual({
      status: 'failed',
      message: CUSTOM_AUTOMATION_CREATION_FAILED,
    })
  })
})

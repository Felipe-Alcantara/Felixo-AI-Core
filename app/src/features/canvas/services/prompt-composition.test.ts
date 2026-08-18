import { describe, expect, it } from 'vitest'
import type { AutomationDefinition } from '../../shared/types/automations'
import { composeSelectedPrompts } from './prompt-composition'

function prompt(id: string, name: string, body: string): AutomationDefinition {
  return { id, name, description: '', prompt: body, scope: 'code' }
}

describe('prompt composition', () => {
  it('preserves bodies and selected order with explicit boundaries', () => {
    const firstBody = 'linha 1\nlinha 2'
    const secondBody = 'segunda instrução com espaços  '

    expect(composeSelectedPrompts([
      prompt('first', 'Primeiro', firstBody),
      prompt('second', 'Segundo', secondBody),
    ])).toBe(
      `## Primeiro\n\n${firstBody}\n\n---\n\n## Segundo\n\n${secondBody}`,
    )
  })

  it('ignores empty prompts instead of sending an empty task section', () => {
    expect(composeSelectedPrompts([
      prompt('empty', 'Vazio', '  '),
      prompt('real', 'Real', 'fazer a tarefa'),
    ])).toBe('## Real\n\nfazer a tarefa')
  })

  it('returns an empty string for no usable selection', () => {
    expect(composeSelectedPrompts([])).toBe('')
  })
})

import { describe, expect, it } from 'vitest'
import { buildCanvasTerminalInitialText } from './quality-standard-prompt'
import { splitInitialContext } from './context-file-delivery'
import { WORKFLOW_PROMPT, WORKFLOW_PROMPT_MARKER } from './workflow-prompt'

describe('Workflow no contexto inicial', () => {
  it('não entra por padrão (nasce desligado)', () => {
    expect(buildCanvasTerminalInitialText('Siga o padrão.')).not.toContain(WORKFLOW_PROMPT_MARKER)
  })

  it('entra quando ligado, uma vez só, e vira arquivo próprio na entrega', () => {
    const text = buildCanvasTerminalInitialText('Siga o padrão.', undefined, [], undefined, [], true)
    expect(text.split(WORKFLOW_PROMPT_MARKER)).toHaveLength(2)
    const parts = splitInitialContext(text)
    expect(parts.filter((part) => part.kind === 'workflow')).toHaveLength(1)
    expect(parts.find((part) => part.kind === 'workflow')?.content).toBe(WORKFLOW_PROMPT)
  })

  it('não repete se o texto de base já traz o Workflow', () => {
    const text = buildCanvasTerminalInitialText(
      'Siga o padrão.',
      WORKFLOW_PROMPT,
      [],
      undefined,
      [],
      true,
    )
    expect(text.split(WORKFLOW_PROMPT_MARKER)).toHaveLength(2)
  })

  it('é genérico: sem IDs, perfis nem ferramentas pessoais', () => {
    expect(WORKFLOW_PROMPT).not.toMatch(/notion|home-pessoal|relatorios|[0-9a-f]{8}-[0-9a-f]{4}-/i)
    expect(WORKFLOW_PROMPT).not.toMatch(/commite direto/i)
  })
})

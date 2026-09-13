import { describe, expect, it } from 'vitest'
import { configuredAgentModel, providerIdentity } from './provider-identity'

describe('provider identity', () => {
  it('derives a provider from the configured executable', () => {
    expect(providerIdentity('C:\\Tools\\claude.cmd')).toMatchObject({
      id: 'claude',
      asset: 'claude-color',
    })
    expect(providerIdentity('codex')).toMatchObject({ id: 'codex', asset: 'openai-color' })
    expect(providerIdentity('gemini.exe')).toMatchObject({ id: 'gemini', asset: 'gemini-color' })
    expect(providerIdentity('openia')).toMatchObject({ id: 'openia', asset: 'openrouter-color' })
  })

  it('shows only an explicitly configured model', () => {
    expect(configuredAgentModel('claude', ['--model', 'opus'])).toBe('opus')
    expect(configuredAgentModel('codex', ['--model=gpt-5.6-terra'])).toBe('gpt-5.6-terra')
    expect(configuredAgentModel('gemini', [])).toBeNull()
    expect(configuredAgentModel('python', ['--model', 'fake'])).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import type { CliPluginEntry } from '../../shared/types/cli-plugins'
import { canChangeEntry, describeConfirmation, filterPlugins } from './cli-plugins-view'

const entry = (over: Partial<CliPluginEntry>): CliPluginEntry => ({
  id: 'a@mk',
  name: 'a',
  description: '',
  version: '',
  marketplace: 'mk',
  origin: '',
  installed: false,
  enabled: null,
  scope: null,
  ...over,
})

describe('plugins das CLIs na tela', () => {
  it('a busca olha nome, descrição e marketplace e limita as linhas, dizendo o total', () => {
    const list = Array.from({ length: 250 }, (_, i) => entry({ id: `p${i}@mk`, name: `p${i}`, description: i % 2 ? 'Stripe' : '' }))
    expect(filterPlugins(list, '')).toMatchObject({ total: 250, rows: expect.any(Array) })
    expect(filterPlugins(list, '').rows).toHaveLength(100)
    expect(filterPlugins(list, 'stripe', 10)).toMatchObject({ total: 125 })
    expect(filterPlugins(list, ' MK ').total).toBe(250)
  })

  it('só altera o que está no escopo user (ou sem escopo)', () => {
    expect(canChangeEntry(entry({ scope: 'user' }))).toBe(true)
    expect(canChangeEntry(entry({ scope: null }))).toBe(true)
    expect(canChangeEntry(entry({ scope: 'project' }))).toBe(false)
  })

  it('a confirmação de instalar mostra origem, conta e o aviso de código de terceiros', () => {
    const text = describeConfirmation({
      action: 'install',
      providerId: 'claude',
      accountLabel: 'Pessoal',
      target: 'demo',
      origin: 'https://github.com/o/r',
    })
    expect(text.body).toContain('https://github.com/o/r')
    expect(text.body).toContain('Claude Code, Pessoal')
    expect(text.body).toContain('código de terceiros')
    expect(describeConfirmation({ action: 'install', providerId: 'codex', accountLabel: 'x', target: 't', origin: '' }).body).toContain(
      'não informou a origem',
    )
  })
})

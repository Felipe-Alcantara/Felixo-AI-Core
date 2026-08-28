import { describe, expect, it } from 'vitest'
import {
  buildOpeniaRunArgs,
  normalizeOpeniaInterfaces,
  normalizeOpeniaModels,
} from './openia-launch-config'

describe('configuração de spawn do Openia', () => {
  it('monta uma execução não interativa com projeto, interface e modelo', () => {
    expect(buildOpeniaRunArgs('orchat', 'anthropic/claude-sonnet-4', '/projetos/meu app'))
      .toEqual([
        'run',
        'orchat',
        '--provider',
        '--model',
        'anthropic/claude-sonnet-4',
        '--dir',
        '/projetos/meu app',
      ])
  })

  it('usa o padrão da interface sem deixar modelo ou chave no comando', () => {
    const args = buildOpeniaRunArgs('openclaw', '  ', '/tmp/projeto')

    expect(args).toEqual(['run', 'openclaw', '--provider', '--no-model', '--dir', '/tmp/projeto'])
    expect(args?.some((value) => value.includes('sk-'))).toBe(false)
  })

  it('limita e deduplica interfaces e modelos vindos do processo', () => {
    const interfaces = normalizeOpeniaInterfaces([
      { key: 'orchat', name: 'OrChat', description: '  chat  ' },
      { key: 'orchat', name: 'duplicada' },
      { key: '', name: 'invalida' },
      ...Array.from({ length: 105 }, (_, index) => ({ key: `iface-${index}`, name: `I${index}` })),
    ])
    const models = normalizeOpeniaModels([
      { id: 'anthropic/claude-sonnet-4', vendor: 'anthropic', name: 'Sonnet', completionPrice: 1 },
      { id: 'anthropic/claude-sonnet-4', name: 'duplicado' },
      { id: 'x/invalid-price', name: 'X', completionPrice: Number.NaN },
      ...Array.from({ length: 2005 }, (_, index) => ({ id: `vendor/model-${index}`, name: `M${index}` })),
    ])

    expect(interfaces).toHaveLength(100)
    expect(interfaces[0]).toMatchObject({ key: 'orchat', description: 'chat' })
    expect(new Set(interfaces.map((item) => item.key)).size).toBe(100)
    expect(models).toHaveLength(2000)
    expect(models[0]).toMatchObject({ id: 'anthropic/claude-sonnet-4', completionPrice: 1 })
    expect(models[1]).toMatchObject({ id: 'x/invalid-price', completionPrice: 0 })
  })
})

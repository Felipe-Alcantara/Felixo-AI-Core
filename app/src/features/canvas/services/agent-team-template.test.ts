import { describe, expect, it } from 'vitest'
import { buildTeamEdges, buildTeamLaunch } from './agent-team-template'

describe('agent-team-template', () => {
  it('cria coordenador, dois produtores e checador com a configuração escolhida', () => {
    const { options } = buildTeamLaunch({
      command: 'claude',
      cwd: 'proj',
      label: 'x',
      chainTicket: 't',
      accountMode: 'chain',
      preset: { name: 'p', contextPrompt: 'Extra.', skillIds: ['s'] },
    })
    expect(options.map((item) => item.label)).toEqual([
      'Coordenador',
      'Produtor 1',
      'Produtor 2',
      'Checador',
    ])
    expect(options.every((item) => item.command === 'claude' && item.cwd === 'proj')).toBe(true)
    expect(options.some((item) => item.chainTicket)).toBe(false)
    expect(options[3].preset?.contextPrompt).toContain('CHECADOR')
    expect(options[3].preset?.contextPrompt).toContain('Extra.')
    expect(options[1].preset?.skillIds).toEqual(['s'])
    expect(options[1].preset?.contextPrompt).toContain('felixo revisao enviar')
    expect(options[3].preset?.contextPrompt).toContain('felixo revisao recusar')
  })

  it('liga coordenador aos produtores e os produtores ao checador', () => {
    const { links } = buildTeamLaunch({ label: 'x' })
    expect(links).toEqual([
      [0, 1],
      [0, 2],
      [1, 3],
      [2, 3],
    ])
    let n = 0
    const edges = buildTeamEdges(['a', 'b', 'c', 'd'], links, () => `e${n++}`)
    expect(edges.map((edge) => `${edge.source}>${edge.target}`)).toEqual(['a>b', 'a>c', 'b>d', 'c>d'])
  })
})

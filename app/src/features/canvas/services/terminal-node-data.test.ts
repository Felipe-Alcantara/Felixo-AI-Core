import { describe, expect, it } from 'vitest'
import { buildTerminalNodeData } from './terminal-node-data'

const LEMBRETE = 'Siga o padrão de qualidade do projeto.'
const ligado = { quality: { prompt: LEMBRETE, enabled: true }, qualityPrompt: LEMBRETE, availableSkills: [] }
const desligado = { ...ligado, quality: { prompt: LEMBRETE, enabled: false } }

describe('buildTerminalNodeData', () => {
  it('shell simples não recebe texto inicial nem campos vazios', () => {
    expect(buildTerminalNodeData({ label: 'Shell', args: [] }, ligado)).toEqual({ label: 'Shell' })
  })

  it('agente recebe o lembrete com a identidade dele, digitado e não submetido', () => {
    const data = buildTerminalNodeData({ label: 'Revisor', command: 'claude', cwd: '/repo' }, ligado)

    expect(data).toMatchObject({ label: 'Revisor', command: 'claude', cwd: '/repo' })
    expect(data.initialText).toContain(LEMBRETE)
    expect(data.initialText).toContain('Revisor')
    expect(data.initialText?.endsWith('\r')).toBe(false)
    expect(data).not.toHaveProperty('handoffText')
  })

  it('com o lembrete desligado e sem preset nem arquivo de planejamento, o agente sobe sem texto', () => {
    const data = buildTerminalNodeData({ label: 'Revisor', command: 'claude' }, desligado)

    expect(data).not.toHaveProperty('initialText')
  })

  it('passagem de responsabilidade leva o pedido submetido, no lugar do texto inicial', () => {
    const data = buildTerminalNodeData(
      { label: 'Destino', command: 'codex', handoffText: 'Continue a tarefa X.' },
      ligado,
    )

    expect(data).not.toHaveProperty('initialText')
    expect(data.handoffText).toContain('Continue a tarefa X.')
    expect(data.handoffText).toContain(LEMBRETE)
    expect(data.handoffText?.endsWith('\r')).toBe(true)
  })

  it('continuação com "pedir para continuar" desmarcado vai sem submissão', () => {
    const data = buildTerminalNodeData(
      { label: 'Destino', command: 'codex', handoffText: 'Continue a tarefa X.', handoffAutoSubmit: false },
      ligado,
    )

    expect(data.handoffText).toContain('Continue a tarefa X.')
    expect(data.handoffText?.endsWith('\r')).toBe(false)
  })

  it('lançador opaco não recebe contexto do canvas', () => {
    const data = buildTerminalNodeData({ label: 'Menu', command: 'meu-launcher', launchMode: 'launcher' }, ligado)

    expect(data).toEqual({ label: 'Menu', command: 'meu-launcher', launchMode: 'launcher' })
  })

  it('só a cadeia marca accountMode, e a cor do preset vira a moldura', () => {
    const base = { label: 'Agente', command: 'claude', accountId: 'conta-1', providerId: 'claude' }

    expect(buildTerminalNodeData({ ...base, accountMode: 'pinned' }, desligado)).toEqual(base)
    expect(buildTerminalNodeData({ ...base, accountMode: 'chain' }, desligado)).toEqual({ ...base, accountMode: 'chain' })
    expect(
      buildTerminalNodeData(
        { ...base, preset: { name: 'Revisor', contextPrompt: '', skillIds: [], color: 'sky' } },
        desligado,
      ),
    ).toMatchObject({ frameColor: 'sky' })
  })
})

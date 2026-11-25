import { describe, expect, it } from 'vitest'
import { splitInitialContext } from './context-file-delivery'
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

  it.each([['ligado', ligado], ['desligado', desligado]])(
    'preset com o padrão de qualidade %s vira artefato agent-preset próprio',
    (_nome, contexto) => {
      const data = buildTerminalNodeData(
        {
          label: 'Revisor',
          command: 'claude',
          planningFile: 'plano.md',
          preset: { name: 'Revisor de PR', contextPrompt: 'Revise o diff.', skillIds: [] },
        },
        contexto,
      )
      const parts = splitInitialContext(data.initialText ?? '')
      const preset = parts.filter((part) => part.kind === 'agent-preset')

      expect(preset).toHaveLength(1)
      expect(preset[0].content).toBe('Preset deste agente: Revisor de PR' + String.fromCharCode(10, 10) + 'Revise o diff.')
      expect(parts.filter((part) => part.kind !== 'agent-preset').every((part) => !part.content.includes('Preset deste agente'))).toBe(true)
      expect(parts.at(-1)?.content).toContain('ARQUIVO DE PLANEJAMENTO OBRIGATÓRIO')
    },
  )
})

describe('skills restritas por licença', () => {
  const skills = [
    { id: 'community-anthropic-docx', name: 'DOCX (Anthropic)', description: 'Word', path: 'https://x/docx', agents: ['claude'] },
    { id: 'livre', name: 'Livre', description: 'Qualquer um', path: 'https://x/livre' },
  ]
  const com = { ...ligado, availableSkills: skills }

  it('Codex e Gemini não recebem a skill de documentos; Claude recebe', () => {
    for (const command of ['codex', 'gemini']) {
      const texto = buildTerminalNodeData({ label: 'A', command }, com).initialText ?? ''
      expect(texto).toContain('Livre')
      expect(texto).not.toContain('DOCX (Anthropic)')
    }
    expect(buildTerminalNodeData({ label: 'A', command: 'claude' }, com).initialText).toContain('DOCX (Anthropic)')
  })
})

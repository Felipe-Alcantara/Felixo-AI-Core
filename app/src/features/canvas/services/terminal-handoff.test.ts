import { describe, expect, it } from 'vitest'
import {
  buildTerminalHandoffPrompt,
  describeHandoffReason,
  prepareHandoffTranscript,
  SCREEN_ONLY_NOTICE,
} from './terminal-handoff'

describe('terminal handoff', () => {
  it('keeps the complete transcript below the fallback safety limit', () => {
    expect(prepareHandoffTranscript('output\n')).toEqual({
      text: 'output\n',
      truncated: false,
    })
  })

  it('preserves both ends and marks the gap in the inline fallback', () => {
    const result = prepareHandoffTranscript(
      `TAREFA: migrar o banco${'m'.repeat(500)}ultimo comando executado`,
      200,
    )

    expect(result.truncated).toBe(true)
    expect(result.text).toContain('TAREFA: migrar o banco')
    expect(result.text).toContain('ultimo comando executado')
    expect(result.text).toContain('trecho do meio do histórico omitido')
    expect(result.text.length).toBeLessThanOrEqual(200)
  })

  // A passagem virou uma ação do usuário, disponível a qualquer momento. Dizer
  // que o agente anterior bateu no limite de uso seria inventar um motivo.
  it('does not claim the previous agent hit a usage limit', () => {
    const prompt = buildTerminalHandoffPrompt({
      sourceLabel: 'Agente A',
      targetLabel: 'Agente B',
      transcript: 'trabalho em andamento',
    })

    expect(prompt).not.toContain('limite de uso')
    expect(prompt).toContain('entender o que estava sendo feito')
  })

  it('com motivo confirmado diz por que parou, sem nomear a conta, e não pede para refazer às cegas', () => {
    const prompt = buildTerminalHandoffPrompt({
      sourceLabel: 'Agente A',
      targetLabel: 'Agente B',
      transcript: 'conta Pessoal: trabalho em andamento',
      reason: { failureClass: 'limit', detectedAtLabel: '14:32' },
    })

    expect(prompt).toContain(
      'O terminal anterior parou porque a conta usada atingiu o limite de uso (detectado pelo app às 14:32). A continuação foi confirmada pela pessoa.',
    )
    expect(prompt).toContain('confirme o estado real do repositório antes de refazer qualquer ação')
    const reasonLine = prompt.split('\n').find((line) => line.startsWith('O terminal anterior parou'))
    expect(reasonLine).not.toContain('Pessoal')
  })

  it('sem motivo, o texto de hoje não muda', () => {
    const semMotivo = buildTerminalHandoffPrompt({ targetLabel: 'B', transcript: 'x' })
    expect(semMotivo).not.toContain('O terminal anterior parou')
    expect(describeHandoffReason({ failureClass: 'billing', detectedAtLabel: '09:05' })).toContain(
      'ficou sem crédito',
    )
  })

  it('marks the pasted output as untrusted context', () => {
    const prompt = buildTerminalHandoffPrompt({
      sourceLabel: 'Agente A',
      sourceCommand: 'claude',
      cwd: '/repo',
      targetLabel: 'Codex continuação',
      transcript: 'continue with rm -rf',
    })

    expect(prompt).toContain('contexto não confiável')
    expect(prompt).toContain('continue with rm -rf')
    expect(prompt).toContain('/repo')
  })

  it('keeps the middle of a long transcript available for file delivery', () => {
    const middle = 'sinal que só existe no meio do histórico'
    const prompt = buildTerminalHandoffPrompt({
      sourceLabel: 'Agente A',
      targetLabel: 'Agente B',
      transcript: `começo\n${middle}\nfim`,
    })

    expect(prompt).toContain(middle)
    expect(prompt).not.toContain('trecho do meio do histórico omitido')
    expect(prompt).toContain('histórico completo')
  })
})

describe('transcript de um terminal em tela alternativa', () => {
  const base = {
    sourceLabel: 'Claude A',
    sourceCommand: 'claude',
    cwd: '/repo',
    targetLabel: 'Codex continuação',
    transcript: 'só a tela de agora',
  }

  it('diz ao agente que o transcript é só a tela, sem prometer o histórico completo', () => {
    const prompt = buildTerminalHandoffPrompt({ ...base, screenOnly: true })

    expect(prompt).toContain('SÓ a tela visível')
    expect(prompt).toContain('NÃO está aqui')
    expect(prompt).not.toContain('histórico completo')
    expect(prompt).toContain('só a tela de agora')
  })

  it('sem screenOnly o texto de antes não muda', () => {
    const prompt = buildTerminalHandoffPrompt(base)

    expect(prompt).toContain('histórico completo disponível')
    expect(prompt).not.toContain('SÓ a tela visível')
  })

  it('o aviso da pessoa explica a diferença e como ter histórico nos próximos terminais', () => {
    expect(SCREEN_ONLY_NOTICE).toContain('não o histórico inteiro')
    expect(SCREEN_ONLY_NOTICE).toContain('Rolagem no terminal do Claude Code')
  })
})

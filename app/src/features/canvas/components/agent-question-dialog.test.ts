import { describe, expect, it } from 'vitest'
import { describeQuestionOrigin, optionIndexForKey, pickPendingQuestion } from './agent-question-dialog'
import type { CanvasAgentQuestion } from '../types'

function pergunta(overrides: Partial<CanvasAgentQuestion> = {}): CanvasAgentQuestion {
  return {
    id: 'q1', acao: 'perguntar', pergunta: 'Qual banco?', opcoes: [{ label: 'SQLite' }, { label: 'Postgres' }],
    estado: 'pendente', pedidoEm: '2026-09-19T12:00:00.000Z', origem: '/projeto', ...overrides,
  }
}

describe('pickPendingQuestion', () => {
  it('ignora as já respondidas e atende a primeira pendente', () => {
    expect(pickPendingQuestion([pergunta({ id: 'a', estado: 'aceito' }), pergunta({ id: 'b' })])?.id).toBe('b')
  })
  it('lista vazia ou ausente não inventa pergunta', () => {
    expect(pickPendingQuestion([])).toBeNull()
    expect(pickPendingQuestion(undefined)).toBeNull()
  })
})

describe('optionIndexForKey', () => {
  it('mapeia 1–N para o índice e ignora o resto', () => {
    expect(optionIndexForKey('1', 3)).toBe(0)
    expect(optionIndexForKey('3', 3)).toBe(2)
    expect(optionIndexForKey('4', 3)).toBeNull()
    expect(optionIndexForKey('0', 3)).toBeNull()
    expect(optionIndexForKey('a', 3)).toBeNull()
    expect(optionIndexForKey('Enter', 3)).toBeNull()
  })
})

describe('describeQuestionOrigin', () => {
  it('mostra a origem quando existe', () => {
    expect(describeQuestionOrigin(pergunta())).toContain('/projeto')
    expect(describeQuestionOrigin(pergunta({ origem: '' }))).toBe('Pergunta de um agente')
  })
})

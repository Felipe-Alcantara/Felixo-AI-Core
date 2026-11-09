import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  describeQuestionOrigin,
  optionIndexForKey,
  pickPendingQuestion,
  questionFocusReturnTarget,
  questionKeyAction,
} from './agent-question-dialog'
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

describe('questionKeyAction', () => {
  it('Esc dispensa, Tab prende o foco e 1–N escolhe a opção', () => {
    expect(questionKeyAction({ key: 'Escape', optionCount: 2 })).toEqual({ tipo: 'dispensar' })
    expect(questionKeyAction({ key: 'Tab', optionCount: 2 })).toEqual({ tipo: 'tab' })
    expect(questionKeyAction({ key: '2', optionCount: 2 })).toEqual({ tipo: 'opcao', indice: 1 })
  })

  it('o resto não faz nada na pergunta (o diálogo engole a tecla do mesmo jeito)', () => {
    for (const key of ['Delete', 'Backspace', 'q', 'Enter', ' ', '3', '0']) {
      expect(questionKeyAction({ key, optionCount: 2 })).toEqual({ tipo: 'nenhuma' })
    }
  })

  it('atalho com Ctrl, Meta ou Alt nunca escolhe uma opção, mas Esc e Tab valem', () => {
    expect(questionKeyAction({ key: '1', optionCount: 2, ctrlKey: true })).toEqual({ tipo: 'nenhuma' })
    expect(questionKeyAction({ key: '1', optionCount: 2, metaKey: true })).toEqual({ tipo: 'nenhuma' })
    expect(questionKeyAction({ key: '1', optionCount: 2, altKey: true })).toEqual({ tipo: 'nenhuma' })
    expect(questionKeyAction({ key: 'Escape', optionCount: 2, ctrlKey: true })).toEqual({ tipo: 'dispensar' })
  })
})

describe('questionFocusReturnTarget', () => {
  const elemento = (extra: { isConnected?: boolean; inert?: boolean } = {}) => ({
    isConnected: extra.isConnected ?? true,
    closest: (selector: string) => (selector === '[inert]' && extra.inert ? {} : null),
  })
  const canvas = elemento()

  it('devolve o foco a quem o tinha quando ele caiu no body com o diálogo', () => {
    const gatilho = elemento()
    expect(questionFocusReturnTarget({ saved: gatilho, focusLost: true, fallback: () => canvas })).toBe(gatilho)
  })

  it('o foco que a pessoa (ou outro diálogo) levou para outro lugar fica onde está', () => {
    const gatilho = elemento()
    expect(questionFocusReturnTarget({ saved: gatilho, focusLost: false, fallback: () => canvas })).toBeNull()
  })

  it('quem tinha o foco saiu da página → a região do canvas, nunca o body', () => {
    const saiu = elemento({ isConnected: false })
    expect(questionFocusReturnTarget({ saved: saiu, focusLost: true, fallback: () => canvas })).toBe(canvas)
    expect(questionFocusReturnTarget({ saved: null, focusLost: true, fallback: () => canvas })).toBe(canvas)
    expect(questionFocusReturnTarget({ saved: null, focusLost: true, fallback: () => null })).toBeNull()
    expect(questionFocusReturnTarget({ saved: null, focusLost: true, fallback: () => elemento({ isConnected: false }) })).toBeNull()
  })

  it('elemento inerte (o card do tutorial cedendo) não recebe o foco nem cai no fallback', () => {
    // O tutorial devolve o foco ao Próximo quando retoma; cair no canvas aqui tiraria dele esse foco.
    const proximo = elemento({ inert: true })
    expect(questionFocusReturnTarget({ saved: proximo, focusLost: true, fallback: () => canvas })).toBeNull()
  })
})

describe('AgentQuestionDialog (sonda do código)', () => {
  const source = readFileSync(new URL('./AgentQuestionDialog.tsx', import.meta.url), 'utf8')

  it('as teclas são do contêiner, não de um ouvinte da janela', () => {
    expect(source).toMatch(/onKeyDown=\{/)
    expect(source).not.toMatch(/window\.addEventListener\('keydown'/)
  })

  it('o overlay é .nokey e camada flutuante (Delete e o clique não agem por baixo)', () => {
    expect(source).toMatch(/data-felixo-floating-layer/)
    expect(source).toMatch(/className="nokey fixed inset-0 z-60/)
  })

  it('pega o foco no painel (tabIndex -1), nunca numa opção', () => {
    expect(source).toMatch(/role="dialog"[^>]*\s+aria-modal="true"[\s\S]*?tabIndex=\{-1\}/)
    expect(source).toMatch(/panelRef\.current\?\.focus\(/)
    expect(source).not.toMatch(/autoFocus/)
  })

  it('as opções ficam focáveis enquanto responde: aria-disabled, não disabled', () => {
    expect(source).not.toMatch(/\sdisabled=/)
    expect(source.match(/aria-disabled=\{busy\}/g)).toHaveLength(2)
  })
})

import { describe, expect, it } from 'vitest'
import {
  CLAUDE_SCROLL_KEYS,
  claudeScrollRailPlacement,
  isClaudeScrolledUp,
  shouldShowClaudeScrollRail,
} from './terminal-claude-scroll'

describe('teclas de rolagem do Claude Code', () => {
  it('são as sequências que o xterm manda para PageUp, PageDown e Ctrl+End', () => {
    expect(CLAUDE_SCROLL_KEYS).toEqual({
      pageUp: '\u001b[5~',
      pageDown: '\u001b[6~',
      bottom: '\u001b[1;5F',
    })
  })
})

describe('conversa rolada para cima', () => {
  // As linhas abaixo são o que o Claude 2.1.309 desenhou num PTY real: o aviso divide a linha com o conteúdo.
  const naFrente = ['… conversa …', '289                                  Jump to bottom (ctrl+End) ↓', '❯']

  it('reconhece o aviso "Jump to bottom" em todas as formas que o Claude desenha', () => {
    for (const aviso of [
      'Jump to bottom (ctrl+End) ↓',
      'Jump to bottom (click) ↓',
      'Jump to bottom ↓',
      'Jump to bottom: fn+↓ to scroll',
      'Jump to bottom: PgDn to scroll',
    ]) {
      expect(isClaudeScrolledUp(`289    ${aviso}    0 tokens`), aviso).toBe(true)
    }
  })

  it('reconhece o aviso de mensagens novas, no singular e no plural', () => {
    expect(isClaudeScrolledUp('1 new message (ctrl+End) ↓')).toBe(true)
    expect(isClaudeScrolledUp('12 new messages (ctrl+End) ↓')).toBe(true)
    expect(isClaudeScrolledUp('3 new messages: fn+↓ to scroll')).toBe(true)
  })

  it('acha o aviso em qualquer linha da tela', () => {
    expect(isClaudeScrolledUp(naFrente.join('\n'))).toBe(true)
  })

  it('não se confunde com a conversa no fim, sem o aviso', () => {
    const noFim = ['… conversa …', '300', '────────', '❯', 'Sonnet 5.5 · manual mode on'].join('\n')

    expect(isClaudeScrolledUp(noFim)).toBe(false)
    expect(isClaudeScrolledUp('')).toBe(false)
  })

  it('não toma por aviso o texto que só cita a expressão, sem a seta nem o jeito de rolar', () => {
    expect(isClaudeScrolledUp('o botão Jump to bottom aparece quando você rola')).toBe(false)
    expect(isClaudeScrolledUp('você tem 3 new messages na caixa de entrada')).toBe(false)
    expect(isClaudeScrolledUp('go to the bottom (ctrl+End) ↓')).toBe(false)
  })
})

describe('quando o trilho aparece', () => {
  const claudeEmTelaCheia = { isClaude: true, alternateScreen: true, alive: true }

  it('com o Claude vivo na tela alternativa', () => {
    expect(shouldShowClaudeScrollRail(claudeEmTelaCheia)).toBe(true)
  })

  it('não aparece no modo clássico: lá o xterm já tem a barra de rolagem', () => {
    expect(shouldShowClaudeScrollRail({ ...claudeEmTelaCheia, alternateScreen: false })).toBe(false)
  })

  it('não aparece em outra CLI nem num shell, mesmo na tela alternativa', () => {
    expect(shouldShowClaudeScrollRail({ ...claudeEmTelaCheia, isClaude: false })).toBe(false)
  })

  it('não aparece com o processo encerrado', () => {
    expect(shouldShowClaudeScrollRail({ ...claudeEmTelaCheia, alive: false })).toBe(false)
  })
})

describe('lugar do trilho na gaveta', () => {
  // Medido no smoke da Leitura (F1): esconder o trilho com a Leitura à frente mudou o xterm de 106 para 109
  // colunas, e trocar de aba não pode mudar a largura do terminal (a CLI redesenharia).
  it('a aba não decide se o trilho existe: com a Leitura à frente ele fica no lugar, inerte', () => {
    expect(claudeScrollRailPlacement({ visible: true, readingActive: false })).toEqual({ render: true, inert: false })
    expect(claudeScrollRailPlacement({ visible: true, readingActive: true })).toEqual({ render: true, inert: true })
  })

  it('sem trilho para mostrar, nenhuma aba o cria', () => {
    expect(claudeScrollRailPlacement({ visible: false, readingActive: false }).render).toBe(false)
    expect(claudeScrollRailPlacement({ visible: false, readingActive: true }).render).toBe(false)
  })
})

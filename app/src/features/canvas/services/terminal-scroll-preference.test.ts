import { describe, expect, it } from 'vitest'
import { isClaudeCommand, parseClaudeTerminalScroll, shouldUseClassicScreen } from './terminal-scroll-preference'

describe('rolagem do terminal no Claude Code', () => {
  it('só o Claude Code recebe o interruptor', () => {
    for (const c of ['claude', 'claude.exe', 'C:\\Users\\a\\npm\\claude.cmd', '/usr/bin/claude', 'CLAUDE']) {
      expect(isClaudeCommand(c), c).toBe(true)
    }
    for (const c of ['codex', 'gemini', 'bash', 'claude-code-helper', 'myclaude', '', undefined]) {
      expect(isClaudeCommand(c), String(c)).toBe(false)
    }
  })
  // Hotfix de 23/10/2026: com a tela clássica (CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1) o Claude Code 2.1.309 não liga o
  // mouse tracking, e nenhuma opção da interface dele responde a clique. O padrão é a tela cheia do próprio Claude.
  it('vem desligado por padrão e só um "on" salvo liga', () => {
    expect(parseClaudeTerminalScroll(null)).toBe(false)
    expect(parseClaudeTerminalScroll('on')).toBe(true)
    expect(parseClaudeTerminalScroll('off')).toBe(false)
    expect(parseClaudeTerminalScroll('qualquer coisa')).toBe(false)
  })
  it('sem escolha salva o terminal novo do Claude não pede a tela clássica', () => {
    expect(shouldUseClassicScreen('claude', parseClaudeTerminalScroll(null))).toBe(false)
    expect(shouldUseClassicScreen('claude', parseClaudeTerminalScroll('on'))).toBe(true)
  })
  it('desligado nunca pede a tela clássica', () => {
    expect(shouldUseClassicScreen('claude', false)).toBe(false)
    expect(shouldUseClassicScreen('claude', true)).toBe(true)
    expect(shouldUseClassicScreen('codex', true)).toBe(false)
  })
})

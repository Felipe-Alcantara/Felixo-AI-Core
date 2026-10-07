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
  it('vem ligado por padrão e só um "off" salvo desliga', () => {
    expect(parseClaudeTerminalScroll(null)).toBe(true)
    expect(parseClaudeTerminalScroll('on')).toBe(true)
    expect(parseClaudeTerminalScroll('off')).toBe(false)
  })
  it('desligado nunca pede a tela clássica', () => {
    expect(shouldUseClassicScreen('claude', false)).toBe(false)
    expect(shouldUseClassicScreen('claude', true)).toBe(true)
    expect(shouldUseClassicScreen('codex', true)).toBe(false)
  })
})

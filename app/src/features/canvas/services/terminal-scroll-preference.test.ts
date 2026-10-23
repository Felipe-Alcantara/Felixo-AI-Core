import { afterEach, describe, expect, it } from 'vitest'
import {
  isClaudeCommand,
  loadClaudeTerminalScroll,
  parseClaudeTerminalScroll,
  saveClaudeTerminalScroll,
  shouldUseClassicScreen,
} from './terminal-scroll-preference'

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

describe('preferência gravada de antes do padrão novo', () => {
  function armazenamento(inicial: Record<string, string>) {
    const valores = new Map(Object.entries(inicial))
    ;(globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (chave: string) => valores.get(chave) ?? null,
        setItem: (chave: string, valor: string) => void valores.set(chave, valor),
      },
    }
    return valores
  }

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window
  })

  // O `on` antigo quase nunca foi escolha: o padrão era ligado e a tela gravava ao mexer. Com a chave antiga valendo,
  // o dono ficou com o mouse quebrado mesmo depois de o padrão virar desligado.
  it('um "on" gravado na chave antiga não liga a rolagem clássica', () => {
    armazenamento({ 'felixo-ai-core.claude-terminal-scroll': 'on' })

    expect(loadClaudeTerminalScroll()).toBe(false)
  })

  it('a escolha feita depois disso vale, e grava na chave nova', () => {
    const valores = armazenamento({ 'felixo-ai-core.claude-terminal-scroll': 'on' })
    saveClaudeTerminalScroll(true)

    expect(loadClaudeTerminalScroll()).toBe(true)
    expect(valores.get('felixo-ai-core.claude-terminal-scroll.v2')).toBe('on')
    saveClaudeTerminalScroll(false)
    expect(loadClaudeTerminalScroll()).toBe(false)
  })
})

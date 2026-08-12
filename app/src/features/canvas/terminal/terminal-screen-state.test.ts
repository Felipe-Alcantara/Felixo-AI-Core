import { describe, expect, it } from 'vitest'
import {
  cleanPrompt,
  hasClaudeInteractivePrompt,
  hasCodexInteractivePrompt,
  hasEmptyClaudeInput,
  hasEmptyCodexInput,
  isBusyScreen,
  isClaudeBypassPermissionsWarning,
  isCodexTrustPrompt,
  looksLikeApprovalPrompt,
  readInputLineState,
} from './terminal-screen-state'

describe('cleanPrompt', () => {
  it('strips ANSI escapes and collapses whitespace', () => {
    expect(cleanPrompt('\x1b[32m  ola   mundo \x1b[0m')).toBe('ola mundo')
  })

  it('returns an empty string for output that was only formatting', () => {
    expect(cleanPrompt('\x1b[2J\x1b[H')).toBe('')
  })
})

describe('isBusyScreen', () => {
  it('recognizes the working banner agent CLIs keep on screen', () => {
    expect(isBusyScreen('Working (7s • esc to interrupt)')).toBe(true)
    expect(isBusyScreen('Pensando… (12s · esc to interrupt)')).toBe(true)
  })

  it('recognizes a bare interrupt hint', () => {
    expect(isBusyScreen('esc to interrupt')).toBe(true)
  })

  it('does not treat a settled prompt as busy', () => {
    expect(isBusyScreen('> ')).toBe(false)
  })

  it('does not treat prose mentioning work as busy', () => {
    // No interrupt hint: this is the agent's answer, not its status banner.
    expect(isBusyScreen('I finished working on the tests.')).toBe(false)
  })
})

describe('looksLikeApprovalPrompt', () => {
  it('detects a selection cursor on a yes/no option', () => {
    expect(looksLikeApprovalPrompt('❯ 1. Yes, continue')).toBe(true)
  })

  it('detects a numbered menu asking for confirmation', () => {
    const screen = ['Do you want to proceed?', '1. Sim', '2. Não'].join('\n')

    expect(looksLikeApprovalPrompt(screen)).toBe(true)
  })

  it('needs both the menu and the question, not a list alone', () => {
    // A plain numbered list in an answer must not read as a decision screen.
    const screen = ['Passos:', '1. instalar', '2. rodar'].join('\n')

    expect(looksLikeApprovalPrompt(screen)).toBe(false)
  })

  it('does not fire on ordinary output', () => {
    expect(looksLikeApprovalPrompt('Arquivos alterados: 3')).toBe(false)
  })
})

describe('hasCodexInteractivePrompt', () => {
  it('recognizes the empty composer as ready for input', () => {
    expect(hasCodexInteractivePrompt(['banner', '›', ''].join('\n'))).toBe(true)
  })

  it('recognizes the composer that shows the CLI suggestion', () => {
    // O composer vazio do Codex nunca aparece em branco: a CLI desenha uma
    // sugestão apagada dentro dele. Exigir a linha em branco era não reconhecer
    // nunca a prontidão, e o contexto só saía quando a espera de emergência
    // estourava.
    expect(hasCodexInteractivePrompt('› Summarize recent commits')).toBe(true)
  })

  it('recognizes the composer with text already written in it', () => {
    expect(hasCodexInteractivePrompt('› /resume')).toBe(true)
  })

  it('does not read the directory trust screen as the composer', () => {
    const screen = [
      'Do you trust the contents of this directory?',
      '› 1. Yes, continue',
      '  2. No, quit',
    ].join('\n')

    expect(hasCodexInteractivePrompt(screen)).toBe(false)
  })

  it('does not fire before the composer appears', () => {
    expect(hasCodexInteractivePrompt('carregando…')).toBe(false)
  })
})

describe('hasEmptyCodexInput', () => {
  it('is true only for a composer with nothing rendered in it', () => {
    expect(hasEmptyCodexInput('›  ')).toBe(true)
  })

  it('treats the CLI suggestion as content, so nobody writes over it', () => {
    expect(hasEmptyCodexInput('› Explain this codebase')).toBe(false)
  })
})

describe('isCodexTrustPrompt', () => {
  it('detects the directory trust question', () => {
    expect(isCodexTrustPrompt('Do you trust the contents of this directory?')).toBe(true)
  })

  it('detects the wording variant built from separate phrases', () => {
    const screen = 'Trust this folder? It may have untrusted contents. 1. Yes, continue'

    expect(isCodexTrustPrompt(screen)).toBe(true)
  })

  it('sees through ANSI formatting and line breaks', () => {
    const screen = '\x1b[1mDo you trust the contents\x1b[0m\nof this directory?'

    expect(isCodexTrustPrompt(screen)).toBe(true)
  })

  it('does not fire on a normal approval prompt', () => {
    expect(isCodexTrustPrompt('Do you want to proceed? 1. Yes')).toBe(false)
  })
})

describe('telas reais do Claude Code (capturadas da CLI 2.1.227)', () => {
  /** Tela de aviso do modo yolo, o que a CLI mostra antes do REPL. */
  const BYPASS_WARNING = [
    '─'.repeat(60),
    '  WARNING: Claude Code running in Bypass Permissions mode',
    '  In Bypass Permissions mode, Claude Code will not ask for your approval before running',
    '  potentially dangerous commands.',
    '  By proceeding, you accept all responsibility for actions taken while running in Bypass',
    '  Permissions mode.',
    '  https://code.claude.com/docs/en/security',
    '  ❯ 1. No, exit',
    '    2. Yes, I accept',
    '  Enter to confirm · Esc to cancel',
  ].join('\n')

  /** REPL pronto, com a sugestão que a CLI desenha na entrada vazia. */
  const READY_PROMPT = [
    ' ▐▛███▜▌   Claude Code v2.1.227',
    '▝▜█████▛▘  Opus 5 with high effort · Claude Pro',
    '  ▘▘ ▝▝    ~/Programação/Github/Repositórios/Felixo-AI-Core',
    '─'.repeat(60),
    '❯ Try "how does ChatWorkspace.tsx work?"',
    '─'.repeat(60),
    '⏵⏵ bypass permissions on (shift+tab to cycle) · ← for agents',
  ].join('\n')

  describe('isClaudeBypassPermissionsWarning', () => {
    it('detects the yolo warning screen', () => {
      expect(isClaudeBypassPermissionsWarning(BYPASS_WARNING)).toBe(true)
    })

    it('sees through ANSI formatting and line breaks', () => {
      const screen = '\x1b[1mWARNING: Claude Code running in Bypass Permissions\x1b[0m\nmode\n2. Yes, I accept'

      expect(isClaudeBypassPermissionsWarning(screen)).toBe(true)
    })

    it('does not fire on the ready prompt, whose footer also mentions bypass permissions', () => {
      expect(isClaudeBypassPermissionsWarning(READY_PROMPT)).toBe(false)
    })

    it('does not fire on the folder trust dialog, which yolo mode never shows', () => {
      const screen = [
        'Do you trust the files in this folder?',
        '❯ 1. Yes, proceed',
        '  2. No, exit',
      ].join('\n')

      expect(isClaudeBypassPermissionsWarning(screen)).toBe(false)
    })

    it('does not fire on the Codex trust wording', () => {
      expect(
        isClaudeBypassPermissionsWarning('Do you trust the contents of this directory?'),
      ).toBe(false)
    })
  })

  describe('hasClaudeInteractivePrompt', () => {
    it('recognizes the ready prompt', () => {
      expect(hasClaudeInteractivePrompt(READY_PROMPT)).toBe(true)
    })

    it('recognizes a bare input line, without the CLI suggestion', () => {
      expect(hasClaudeInteractivePrompt(['─'.repeat(20), '│ ❯ ', '─'.repeat(20)].join('\n'))).toBe(
        true,
      )
    })

    it('recognizes the input line with text already written in it', () => {
      expect(hasClaudeInteractivePrompt('❯ Antes de qualquer tarefa: siga o padrão')).toBe(true)
    })

    it('does not mistake the yolo warning for the input line', () => {
      expect(hasClaudeInteractivePrompt(BYPASS_WARNING)).toBe(false)
    })

    it('does not mistake a decision dialog for the input line', () => {
      const screen = ['Do you want to proceed?', '❯ 1. Yes', '  2. No, and tell Claude why'].join(
        '\n',
      )

      expect(hasClaudeInteractivePrompt(screen)).toBe(false)
    })

    it('is false while the CLI is still booting (no input line drawn yet)', () => {
      expect(hasClaudeInteractivePrompt('Claude Code v2.1.227\nOpus 5 with high effort')).toBe(
        false,
      )
    })
  })

  describe('hasEmptyClaudeInput', () => {
    it('reads the CLI suggestion as an empty input', () => {
      expect(hasEmptyClaudeInput(READY_PROMPT)).toBe(true)
    })

    it('reads a bare marker as an empty input', () => {
      expect(hasEmptyClaudeInput('│ ❯ ')).toBe(true)
    })

    it('reads the block cursor as an empty input', () => {
      expect(hasEmptyClaudeInput('❯ █')).toBe(true)
    })

    it('is false once the context text is sitting in the input', () => {
      expect(hasEmptyClaudeInput('❯ Antes de qualquer tarefa: siga o PADRÃO DE QUALIDADE')).toBe(
        false,
      )
    })
  })
})

describe('readInputLineState', () => {
  const CLAUDE_READY = ['─'.repeat(20), '❯ Try "fix lint errors"', '─'.repeat(20)].join('\n')

  it('lê a entrada do Claude esperando texto', () => {
    expect(readInputLineState('claude', CLAUDE_READY)).toEqual({
      ready: true,
      visible: true,
      empty: true,
    })
  })

  it('lê a entrada do Claude com texto escrito nela', () => {
    expect(readInputLineState('claude', '❯ Antes de qualquer tarefa: siga o padrão')).toEqual({
      ready: true,
      visible: true,
      empty: false,
    })
  })

  it('não vê entrada nenhuma no aviso do modo yolo', () => {
    const screen = [
      'WARNING: Claude Code running in Bypass Permissions mode',
      '❯ 1. No, exit',
      '  2. Yes, I accept',
    ].join('\n')

    expect(readInputLineState('claude', screen)).toEqual({
      ready: false,
      visible: false,
      empty: false,
    })
  })

  it('lê o composer vazio do Codex como pronto', () => {
    expect(readInputLineState('codex', '›  ')).toEqual({
      ready: true,
      visible: true,
      empty: true,
    })
  })

  it('lê o composer do Codex com a sugestão da CLI como pronto', () => {
    expect(readInputLineState('codex', '› Write tests for @filename')).toEqual({
      ready: true,
      visible: true,
      empty: false,
    })
  })

  it('lê o composer do Codex com texto escrito nele', () => {
    expect(readInputLineState('codex', '› /resume')).toEqual({
      ready: true,
      visible: true,
      empty: false,
    })
  })

  it('não vê entrada nenhuma na tela de confiança do Codex', () => {
    const screen = ['Do you trust the contents of this directory?', '› 1. Yes, continue'].join(
      '\n',
    )

    expect(readInputLineState('codex', screen)).toEqual({
      ready: false,
      visible: false,
      empty: false,
    })
  })

  it('responde "não sei" para CLI cuja entrada não sabemos reconhecer', () => {
    expect(readInputLineState('gemini', '❯ qualquer coisa')).toBeUndefined()
    expect(readInputLineState(undefined, CLAUDE_READY)).toBeUndefined()
  })
})

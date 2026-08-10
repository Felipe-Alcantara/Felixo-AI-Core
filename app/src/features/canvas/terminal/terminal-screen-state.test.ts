import { describe, expect, it } from 'vitest'
import {
  cleanPrompt,
  hasCodexInteractivePrompt,
  isBusyScreen,
  isCodexTrustPrompt,
  looksLikeApprovalPrompt,
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

  it('does not consider a composer with text already typed as ready', () => {
    expect(hasCodexInteractivePrompt('› /resume')).toBe(false)
  })

  it('does not fire before the composer appears', () => {
    expect(hasCodexInteractivePrompt('carregando…')).toBe(false)
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

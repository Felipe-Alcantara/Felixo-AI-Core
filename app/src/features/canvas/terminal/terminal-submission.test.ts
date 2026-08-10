import { describe, expect, it } from 'vitest'
import { isSubmissionPending } from './terminal-submission'

describe('isSubmissionPending', () => {
  it('detects text still waiting on the Claude input line', () => {
    // The reported failure: "/resume" typed, Enter lost, nothing submitted.
    const viewport = ['╭──────────────────────╮', '│ > /resume', '╰──────────────────────╯'].join(
      '\n',
    )

    expect(isSubmissionPending(viewport, '/resume')).toBe(true)
  })

  it('detects text waiting on the Codex input line', () => {
    expect(isSubmissionPending('› /resume', '/resume')).toBe(true)
  })

  it('reports nothing pending once the CLI cleared the input line', () => {
    const viewport = ['> ', '', 'Resuming previous session...'].join('\n')

    expect(isSubmissionPending(viewport, '/resume')).toBe(false)
  })

  it('ignores the prompt echoed into the conversation history', () => {
    // After a successful submit the text often reappears above as history —
    // that must not read as "still pending", or Enter would be resent.
    const viewport = ['  You: /resume', '  Assistant: retomando…', '> '].join('\n')

    expect(isSubmissionPending(viewport, '/resume')).toBe(false)
  })

  it('sees through a trailing block cursor', () => {
    expect(isSubmissionPending('> /resume█', '/resume')).toBe(true)
  })

  it('sees through padding the TUI adds around the text', () => {
    expect(isSubmissionPending('>   /resume   ', '/resume')).toBe(true)
  })

  it('does not match a different pending command', () => {
    expect(isSubmissionPending('> /clear', '/resume')).toBe(false)
  })

  it('does not claim the line when the user kept typing past our text', () => {
    // Safety: while the retry window is open the user may be typing. Resending
    // Enter here would submit THEIR unfinished line — an action they never
    // confirmed, and one an agent may act on irreversibly.
    expect(isSubmissionPending('> /resume e depois rode os testes', '/resume')).toBe(false)
  })

  it('still tolerates the hint a TUI appends outside the typed text', () => {
    // A hint sits past wide padding to the box edge; typed continuation (above)
    // follows a single space. Ambiguous middle ground resolves as "not pending",
    // which merely skips a retry instead of submitting someone's draft.
    expect(isSubmissionPending('> /resume      enter to send', '/resume')).toBe(true)
  })

  it('treats an empty prompt as nothing to submit', () => {
    expect(isSubmissionPending('> ', '')).toBe(false)
  })

  it('handles a multi-line standing instruction', () => {
    const instruction = 'Siga o padrão de qualidade'

    expect(isSubmissionPending(`> ${instruction}`, instruction)).toBe(true)
  })

  it('normalizes the whitespace a wrapped TUI line introduces', () => {
    expect(isSubmissionPending('> Siga  o   padrão', 'Siga o padrão')).toBe(true)
  })

  it('reports nothing pending for a viewport with no prompt line at all', () => {
    expect(isSubmissionPending('carregando…', '/resume')).toBe(false)
  })
})

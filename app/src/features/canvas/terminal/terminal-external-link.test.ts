import { describe, expect, it, vi } from 'vitest'
import {
  activateTerminalExternalLink,
  hasTerminalLinkModifier,
  isAllowedTerminalExternalLink,
} from './terminal-external-link'

function mouseEvent(init: Partial<MouseEvent> = {}) {
  return { ctrlKey: false, metaKey: false, ...init } as MouseEvent
}

describe('terminal external links', () => {
  it.each(['https://example.com', 'http://localhost:5173/callback'])('allows %s', (uri) => {
    expect(isAllowedTerminalExternalLink(uri)).toBe(true)
  })

  it.each(['file:///C:/secret.txt', 'javascript:alert(1)', 'mailto:user@example.com', 'not a URL'])(
    'rejects %s',
    (uri) => {
      expect(isAllowedTerminalExternalLink(uri)).toBe(false)
    },
  )

  it('requires exactly Ctrl or Cmd before opening', () => {
    expect(hasTerminalLinkModifier(mouseEvent({ ctrlKey: true }))).toBe(true)
    expect(hasTerminalLinkModifier(mouseEvent({ metaKey: true }))).toBe(true)
    expect(hasTerminalLinkModifier(mouseEvent())).toBe(false)
    expect(hasTerminalLinkModifier(mouseEvent({ ctrlKey: true, metaKey: true }))).toBe(false)
  })

  it('opens only an allowed URL confirmed by the modifier', () => {
    const openExternalLink = vi.fn()

    expect(
      activateTerminalExternalLink(mouseEvent({ ctrlKey: true }), 'https://example.com', openExternalLink),
    ).toBe(true)
    expect(openExternalLink).toHaveBeenCalledWith('https://example.com')

    expect(
      activateTerminalExternalLink(mouseEvent(), 'https://example.com', openExternalLink),
    ).toBe(false)
    expect(
      activateTerminalExternalLink(mouseEvent({ ctrlKey: true }), 'file:///C:/secret.txt', openExternalLink),
    ).toBe(false)
    expect(openExternalLink).toHaveBeenCalledTimes(1)
  })
})

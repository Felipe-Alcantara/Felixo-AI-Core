import { describe, expect, it } from 'vitest'
import type { Terminal } from '@xterm/xterm'
import {
  computePreview,
  computeSignature,
  readBuffer,
  readTerminalTail,
  readViewport,
} from './terminal-buffer-reader'

/**
 * Minimal stand-in for the slice of xterm these readers touch: a list of lines
 * plus the viewport window over them. Keeps the tests free of a real terminal
 * (and of a DOM, which this suite does not have).
 */
function fakeTerminal(lines: string[], { rows = lines.length, viewportY = 0 } = {}): Terminal {
  return {
    rows,
    buffer: {
      active: {
        length: lines.length,
        viewportY,
        getLine: (row: number) =>
          row >= 0 && row < lines.length
            ? { translateToString: () => lines[row] }
            : undefined,
      },
    },
  } as unknown as Terminal
}

describe('readViewport', () => {
  it('reads only the visible window, not the scrollback above it', () => {
    const terminal = fakeTerminal(['rolado', 'visivel-1', 'visivel-2'], {
      rows: 2,
      viewportY: 1,
    })

    expect(readViewport(terminal)).toBe('visivel-1\nvisivel-2')
  })

  it('drops the blank lines a partially filled screen leaves at the end', () => {
    const terminal = fakeTerminal(['linha', '', ''], { rows: 3 })

    expect(readViewport(terminal)).toBe('linha')
  })
})

describe('readBuffer', () => {
  it('includes the scrollback, unlike the viewport reader', () => {
    const terminal = fakeTerminal(['antigo', 'atual'], { rows: 1, viewportY: 1 })

    expect(readBuffer(terminal)).toBe('antigo\natual')
  })
})

describe('readTerminalTail', () => {
  it('keeps the end of the output within the character budget', () => {
    const terminal = fakeTerminal(['aaaa', 'bbbb', 'cccc'])

    const tail = readTerminalTail(terminal, 9)

    expect(tail.endsWith('cccc')).toBe(true)
    expect(tail.length).toBeLessThanOrEqual(9)
  })

  it('returns everything when the buffer is smaller than the budget', () => {
    const terminal = fakeTerminal(['uma', 'duas'])

    expect(readTerminalTail(terminal)).toBe('uma\nduas')
  })
})

describe('computePreview', () => {
  it('takes the last non-empty lines, newest last', () => {
    const terminal = fakeTerminal(['primeira', '', 'segunda', ''])

    expect(computePreview(terminal)).toEqual(['primeira', 'segunda'])
  })

  it('skips the persistent CLI footer so the preview shows real output', () => {
    const terminal = fakeTerminal(['resposta do agente', 'claude-sonnet · 42k tokens'])

    expect(computePreview(terminal)).toEqual(['resposta do agente'])
  })

  it('keeps at most six lines', () => {
    const terminal = fakeTerminal(['1', '2', '3', '4', '5', '6', '7', '8'])

    expect(computePreview(terminal)).toEqual(['3', '4', '5', '6', '7', '8'])
  })
})

describe('computeSignature', () => {
  it('collapses two repaints that differ only by the elapsed counter', () => {
    const first = fakeTerminal(['Working (7s • esc to interrupt)'])
    const second = fakeTerminal(['Working (12s • esc to interrupt)'])

    // Without this, a CLI sitting on its busy banner would look like fresh work.
    expect(computeSignature(first)).toBe(computeSignature(second))
  })

  it('collapses two repaints that differ only by a spinner frame', () => {
    const first = fakeTerminal(['⠋ carregando'])
    const second = fakeTerminal(['⠙ carregando'])

    expect(computeSignature(first)).toBe(computeSignature(second))
  })

  it('changes when real output arrives', () => {
    const before = fakeTerminal(['linha um'])
    const after = fakeTerminal(['linha um', 'linha dois'])

    expect(computeSignature(before)).not.toBe(computeSignature(after))
  })

  it('changes when the buffer grows even if the visible text repeats', () => {
    // The line count anchors real scrolling that the text alone would hide.
    const before = fakeTerminal(['igual'], { rows: 1 })
    const after = fakeTerminal(['igual', 'igual'], { rows: 1 })

    expect(computeSignature(before)).not.toBe(computeSignature(after))
  })
})

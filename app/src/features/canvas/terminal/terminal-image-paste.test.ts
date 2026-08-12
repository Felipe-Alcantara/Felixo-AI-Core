import { describe, expect, it } from 'vitest'
import {
  findClipboardImage,
  formatImagePathForPrompt,
  hasClipboardText,
} from './terminal-image-paste'

/** Minimal stand-in for a paste event's `clipboardData`. */
function fakeClipboardData({
  items = [],
  files = [],
  text = '',
}: {
  items?: Array<{ kind: string; type: string; file?: File | null }>
  files?: File[]
  text?: string
}) {
  return {
    items: items.map((item) => ({
      kind: item.kind,
      type: item.type,
      getAsFile: () => item.file ?? null,
    })),
    files,
    getData: (format: string) => (format === 'text/plain' ? text : ''),
  } as unknown as DataTransfer
}

function fakeFile(name: string, type: string) {
  return { name, type } as File
}

describe('findClipboardImage', () => {
  it('finds an image pasted as a clipboard item', () => {
    const png = fakeFile('captura.png', 'image/png')

    expect(
      findClipboardImage(
        fakeClipboardData({
          items: [{ kind: 'file', type: 'image/png', file: png }],
        }),
      ),
    ).toBe(png)
  })

  it('falls back to files when the source populated only that list', () => {
    const jpg = fakeFile('foto.jpg', 'image/jpeg')

    expect(findClipboardImage(fakeClipboardData({ files: [jpg] }))).toBe(jpg)
  })

  it('ignores non-image items so a copied document is not sent as a picture', () => {
    const clipboardData = fakeClipboardData({
      items: [{ kind: 'file', type: 'application/pdf', file: fakeFile('a.pdf', 'application/pdf') }],
      files: [fakeFile('a.pdf', 'application/pdf')],
    })

    expect(findClipboardImage(clipboardData)).toBeNull()
  })

  it('ignores the string item that rides along with a copied image', () => {
    // Chromium reports the source markup as `kind: 'string'`; treating it as a
    // file would hand the terminal an empty attachment.
    const clipboardData = fakeClipboardData({
      items: [{ kind: 'string', type: 'image/png', file: null }],
    })

    expect(findClipboardImage(clipboardData)).toBeNull()
  })

  it('returns null when there is no clipboard data at all', () => {
    expect(findClipboardImage(null)).toBeNull()
    expect(findClipboardImage(fakeClipboardData({}))).toBeNull()
  })
})

describe('hasClipboardText', () => {
  it('recognises a plain text paste, which must keep xterm’s own path', () => {
    expect(hasClipboardText(fakeClipboardData({ text: 'npm run build' }))).toBe(true)
  })

  it('reports no text for an empty or absent clipboard', () => {
    expect(hasClipboardText(fakeClipboardData({ text: '' }))).toBe(false)
    expect(hasClipboardText(null)).toBe(false)
  })
})

describe('formatImagePathForPrompt', () => {
  it('types a plain path unquoted, followed by a space to keep writing', () => {
    expect(formatImagePathForPrompt('/home/user/.config/app/captura.png')).toBe(
      '/home/user/.config/app/captura.png ',
    )
  })

  it('quotes a path containing spaces so it stays one argument', () => {
    expect(formatImagePathForPrompt('C:\\Users\\Ana Paula\\img.png')).toBe(
      '"C:\\Users\\Ana Paula\\img.png" ',
    )
  })

  it('produces nothing for an empty path, so nothing is typed', () => {
    expect(formatImagePathForPrompt('')).toBe('')
    expect(formatImagePathForPrompt('   ')).toBe('')
  })
})

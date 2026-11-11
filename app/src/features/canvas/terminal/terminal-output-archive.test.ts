import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ARCHIVE_PAGE_BYTES,
  archiveViewHasMore,
  archiveViewText,
  describeArchiveView,
  prependArchivePage,
  readArchivePage,
  type ArchiveRead,
} from './terminal-output-archive'

function read(text: string, start: number, total: number, firstOffset = 0): ArchiveRead {
  return { page: { text, start, end: start + text.length }, firstOffset, total }
}

describe('Histórico arquivado da gaveta', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('cresce para trás com páginas contínuas até o começo do arquivo', () => {
    let view = prependArchivePage(null, read('cccc', 8, 12))
    expect(archiveViewHasMore(view)).toBe(true)

    view = prependArchivePage(view, read('bbbb', 4, 12))
    view = prependArchivePage(view, read('aaaa', 0, 12))
    expect(archiveViewText(view)).toBe('aaaabbbbcccc')
    expect(archiveViewHasMore(view)).toBe(false)
    expect(describeArchiveView(view)).toBe('Mostrando 12 B de 12 B guardados, desde o começo.')
  })

  it('acima do teto, as páginas mais novas saem e o começo pedido fica', () => {
    let view = prependArchivePage(null, read('cccc', 8, 12), 8)
    view = prependArchivePage(view, read('bbbb', 4, 12), 8)
    view = prependArchivePage(view, read('aaaa', 0, 12), 8)
    expect(archiveViewText(view)).toBe('aaaabbbb')
    expect(describeArchiveView(view)).toBe('Mostrando 8 B de 12 B guardados, desde o começo.')
  })

  it('página que não encosta na janela recomeça a janela em vez de colar dois trechos', () => {
    let view = prependArchivePage(null, read('cccc', 8, 12))
    // O arquivo foi trocado (importação) e a página veio de outro lugar.
    view = prependArchivePage(view, read('zz', 0, 2))
    expect(archiveViewText(view)).toBe('zz')
  })

  it('diz quando o trecho mais antigo já saiu do arquivo e quando não há nada', () => {
    const podado = prependArchivePage(null, read('fim', 100, 103, 100))
    expect(archiveViewHasMore(podado)).toBe(false)
    expect(describeArchiveView(podado)).toContain('o trecho mais antigo já saiu do arquivo')
    expect(describeArchiveView(prependArchivePage(null, read('', 0, 0)))).toBe(
      'Nada arquivado ainda para este terminal.',
    )
    expect(describeArchiveView(null)).toBe('Lendo o Histórico arquivado…')
  })

  it('pede ao main a página que termina no começo da janela e repassa o erro dele', async () => {
    const readArchive = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, text: 'abc', start: 3, end: 6, total: 6, firstOffset: 0 })
      .mockResolvedValueOnce({ ok: false, message: 'disco fora' })
    vi.stubGlobal('window', { felixo: { pty: { readArchive } } })

    await expect(readArchivePage('canvas:t1')).resolves.toEqual(read('abc', 3, 6))
    await expect(readArchivePage('canvas:t1', 3)).rejects.toThrow('disco fora')
    expect(readArchive).toHaveBeenNthCalledWith(1, { sessionId: 'canvas:t1', maxBytes: ARCHIVE_PAGE_BYTES })
    expect(readArchive).toHaveBeenNthCalledWith(2, { sessionId: 'canvas:t1', maxBytes: ARCHIVE_PAGE_BYTES, before: 3 })
  })
})

import { describe, expect, it, vi } from 'vitest'

import {
  DOCUMENT_READER_UNAVAILABLE_MESSAGE,
  readSystemDesignDocument,
  systemDesignDocumentRevision,
  type SystemDesignDocumentReader,
} from './system-design-document'
import type { SystemDesignDocument } from './types'

function documentWith(content: string): SystemDesignDocument {
  return {
    path: 'core/GUIA_MINIMO_QUALIDADE.md',
    title: 'Guia mínimo de qualidade',
    summary: 'Contrato curto de qualidade.',
    byteSize: content.length,
    updatedAt: '2026-09-21T10:00:00.000Z',
    content,
  }
}

function readerReturning(
  result: Awaited<ReturnType<SystemDesignDocumentReader['getDocument']>>,
): SystemDesignDocumentReader {
  return { getDocument: vi.fn(async () => result) }
}

describe('systemDesignDocumentRevision', () => {
  const guia = { path: 'core/GUIA.md', updatedAt: '2026-09-21T10:00:00.000Z' }

  it('sincronizar de novo o mesmo commit não muda a revisão, mesmo com updatedAt novo', () => {
    expect(systemDesignDocumentRevision({ ...guia, sourceSha: 'abc' })).toBe(
      systemDesignDocumentRevision({ ...guia, sourceSha: 'abc', updatedAt: '2026-09-22T08:00:00.000Z' }),
    )
  })

  it('commit novo muda a revisão, para a prévia aberta reler o guia', () => {
    expect(systemDesignDocumentRevision({ ...guia, sourceSha: 'abc' })).not.toBe(
      systemDesignDocumentRevision({ ...guia, sourceSha: 'def' }),
    )
  })

  it('sem sha, a revisão segue o updatedAt', () => {
    expect(systemDesignDocumentRevision(guia)).not.toBe(
      systemDesignDocumentRevision({ ...guia, updatedAt: '2026-09-22T08:00:00.000Z' }),
    )
  })

  it('guias diferentes no mesmo commit têm revisões diferentes', () => {
    expect(systemDesignDocumentRevision({ ...guia, sourceSha: 'abc' })).not.toBe(
      systemDesignDocumentRevision({ ...guia, path: 'core/OUTRO.md', sourceSha: 'abc' }),
    )
  })
})

describe('readSystemDesignDocument', () => {
  it('pede o guia pelo caminho e devolve o conteúdo pronto para a prévia', async () => {
    const reader = readerReturning({ ok: true, document: documentWith('# Guia\n\nTexto.') })

    const state = await readSystemDesignDocument(reader, 'core/GUIA_MINIMO_QUALIDADE.md')

    expect(reader.getDocument).toHaveBeenCalledWith('core/GUIA_MINIMO_QUALIDADE.md')
    expect(state).toEqual({ status: 'ready', content: '# Guia\n\nTexto.' })
  })

  it('sem a ponte do Electron explica que a leitura é do app desktop', async () => {
    expect(await readSystemDesignDocument(undefined, 'core/x.md')).toEqual({
      status: 'error',
      message: DOCUMENT_READER_UNAVAILABLE_MESSAGE,
    })
  })

  it('repassa o motivo que o processo principal deu para a falha', async () => {
    const state = await readSystemDesignDocument(
      readerReturning({ ok: false, message: 'Documento nao encontrado.' }),
      'core/sumiu.md',
    )

    expect(state).toEqual({ status: 'error', message: 'Documento nao encontrado.' })
  })

  it('resposta ok sem documento vira erro com orientação, não prévia vazia', async () => {
    const state = await readSystemDesignDocument(readerReturning({ ok: true }), 'core/x.md')

    expect(state.status).toBe('error')
    expect(state.status === 'error' && state.message).toMatch(/Sincronize/)
  })

  it('documento só com espaços em branco é mostrado como vazio', async () => {
    const state = await readSystemDesignDocument(
      readerReturning({ ok: true, document: documentWith('  \n\t') }),
      'core/x.md',
    )

    expect(state).toEqual({ status: 'empty' })
  })

  it('uma chamada IPC que rejeita vira estado de erro em vez de exceção', async () => {
    const reader: SystemDesignDocumentReader = {
      getDocument: vi.fn(async () => {
        throw new Error('canal fechado')
      }),
    }

    expect(await readSystemDesignDocument(reader, 'core/x.md')).toEqual({
      status: 'error',
      message: 'canal fechado',
    })
  })
})

import { describe, expect, it } from 'vitest'
import { decideSyncStatusAfterNetwork, hasUsableCachedSnapshot } from './notion-sync-status'

describe('hasUsableCachedSnapshot', () => {
  it('true quando a leitura local trouxe tarefas', () => {
    expect(hasUsableCachedSnapshot({ ok: true, tasks: [{ id: 'a' } as never] })).toBe(true)
  })

  it('false quando a leitura local não trouxe tarefas', () => {
    expect(hasUsableCachedSnapshot({ ok: true, tasks: [] })).toBe(false)
  })

  it('false quando a leitura local falhou', () => {
    expect(hasUsableCachedSnapshot({ ok: false, tasks: [{ id: 'a' } as never] })).toBe(false)
  })

  it('false quando tasks nem veio no resultado', () => {
    expect(hasUsableCachedSnapshot({ ok: true, tasks: undefined })).toBe(false)
  })
})

describe('decideSyncStatusAfterNetwork', () => {
  it('usa o syncStatus explícito da rede quando presente', () => {
    expect(decideSyncStatusAfterNetwork({ ok: true, syncStatus: 'success' }, false)).toBe('success')
    expect(decideSyncStatusAfterNetwork({ ok: true, syncStatus: 'stale' }, true)).toBe('stale')
  })

  it('sem syncStatus explícito, cai pro boolean stale legado', () => {
    expect(decideSyncStatusAfterNetwork({ ok: true, stale: false }, false)).toBe('success')
    expect(decideSyncStatusAfterNetwork({ ok: true, stale: true }, true)).toBe('stale')
  })

  it('rede falhou mas havia snapshot local: continua stale, nunca error', () => {
    expect(decideSyncStatusAfterNetwork({ ok: false }, true)).toBe('stale')
  })

  it('rede falhou e não havia snapshot local nenhum: error', () => {
    expect(decideSyncStatusAfterNetwork({ ok: false }, false)).toBe('error')
  })
})

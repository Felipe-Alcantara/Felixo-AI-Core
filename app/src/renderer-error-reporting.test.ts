import { describe, expect, it, vi } from 'vitest'
import {
  buildUnhandledRejectionEntry,
  buildWindowErrorEntry,
  installRendererErrorReporting,
} from './renderer-error-reporting'

describe('buildWindowErrorEntry', () => {
  it('usa a mensagem e o stack do Error quando disponível', () => {
    const error = new Error('quebrou o componente')
    const entry = buildWindowErrorEntry({ message: 'ignorado', filename: 'App.tsx', lineno: 12, colno: 3, error })

    expect(entry.level).toBe('error')
    expect(entry.scope).toBe('renderer:window-error')
    expect(entry.message).toBe('quebrou o componente')
    expect(entry.details).toMatchObject({ filename: 'App.tsx', lineno: 12, colno: 3 })
    expect((entry.details as { stack: string | null }).stack).toContain('Error: quebrou o componente')
  })

  it('recorre à mensagem do evento quando não há objeto Error', () => {
    const entry = buildWindowErrorEntry({ message: 'erro de script cross-origin' })
    expect(entry.message).toBe('erro de script cross-origin')
    expect((entry.details as { stack: string | null }).stack).toBeNull()
  })

  it('nunca fica com mensagem vazia', () => {
    const entry = buildWindowErrorEntry({})
    expect(entry.message).toBe('Erro sem mensagem.')
  })
})

describe('buildUnhandledRejectionEntry', () => {
  it('usa a mensagem do Error quando o motivo é um Error', () => {
    const entry = buildUnhandledRejectionEntry({ reason: new Error('promise perdida') })
    expect(entry.scope).toBe('renderer:unhandled-rejection')
    expect(entry.message).toBe('promise perdida')
  })

  it('serializa o motivo quando não é um Error nem string', () => {
    const entry = buildUnhandledRejectionEntry({ reason: { code: 'ENOENT' } })
    expect(entry.message).toBe('{"code":"ENOENT"}')
  })

  it('tem uma mensagem padrão quando o motivo é undefined', () => {
    const entry = buildUnhandledRejectionEntry({})
    expect(entry.message).toBe('Promise rejeitada sem motivo.')
  })
})

function fakeWindow() {
  const listeners: Record<string, ((event: unknown) => void)[]> = {}
  const log = vi.fn().mockResolvedValue(undefined)
  const target = {
    addEventListener: (type: string, listener: (event: unknown) => void) => {
      listeners[type] = [...(listeners[type] ?? []), listener]
    },
    removeEventListener: (type: string, listener: (event: unknown) => void) => {
      listeners[type] = (listeners[type] ?? []).filter((current) => current !== listener)
    },
    felixo: { qaLogger: { log } },
  }
  return { target: target as unknown as Window, listeners, log }
}

describe('installRendererErrorReporting', () => {
  it('registra os dois listeners e manda a entrada construída pro qaLogger.log', () => {
    const { target, listeners, log } = fakeWindow()
    installRendererErrorReporting(target)

    listeners.error[0]({ message: 'falhou', error: new Error('falhou') })
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ scope: 'renderer:window-error', message: 'falhou' }))

    listeners.unhandledrejection[0]({ reason: new Error('rejeitada') })
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ scope: 'renderer:unhandled-rejection', message: 'rejeitada' }))
  })

  it('não lança quando window.felixo ainda não existe (preload não carregou)', () => {
    const { target, listeners } = fakeWindow()
    ;(target as unknown as { felixo: undefined }).felixo = undefined
    installRendererErrorReporting(target)

    expect(() => listeners.error[0]({ message: 'x' })).not.toThrow()
  })

  it('a função de limpeza remove os dois listeners', () => {
    const { target, listeners } = fakeWindow()
    const cleanup = installRendererErrorReporting(target)

    expect(listeners.error).toHaveLength(1)
    cleanup()
    expect(listeners.error).toHaveLength(0)
    expect(listeners.unhandledrejection).toHaveLength(0)
  })
})

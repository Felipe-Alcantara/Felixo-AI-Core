import { describe, expect, it, vi } from 'vitest'
import {
  buildUnhandledRejectionEntry,
  buildWindowErrorEntry,
  createResizeObserverLoopMeter,
  installRendererErrorReporting,
  isResizeObserverLoopNotice,
} from './renderer-error-reporting'

const AVISO_DO_RO = 'ResizeObserver loop completed with undelivered notifications.'

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

describe('isResizeObserverLoopNotice', () => {
  it('reconhece as duas redações do Chromium (a atual e a antiga)', () => {
    expect(isResizeObserverLoopNotice({ message: AVISO_DO_RO })).toBe(true)
    expect(isResizeObserverLoopNotice({ message: 'ResizeObserver loop limit exceeded' })).toBe(true)
  })

  it('não confunde com um erro de verdade nem com evento sem mensagem', () => {
    expect(isResizeObserverLoopNotice({ message: 'Cannot read properties of undefined' })).toBe(false)
    expect(isResizeObserverLoopNotice({ message: 'falha no ResizeObserver loop' })).toBe(false)
    expect(isResizeObserverLoopNotice({})).toBe(false)
  })
})

describe('createResizeObserverLoopMeter', () => {
  function meter(windowMs = 10_000) {
    const clock = { t: 0 }
    return { clock, meter: createResizeObserverLoopMeter(windowMs, () => clock.t) }
  }

  it('a primeira ocorrência vira um aviso (warn, não error), com escopo próprio', () => {
    const { meter: m } = meter()
    const entry = m.record()

    expect(entry).toMatchObject({ level: 'warn', scope: 'renderer:resize-observer-loop' })
    expect(entry?.details).toEqual({ omitidasDaJanelaAnterior: 0 })
  })

  it('as repetições dentro da janela não geram entrada (um arrasto emite dezenas por segundo)', () => {
    const { meter: m, clock } = meter(10_000)
    m.record()
    const repeticoes = Array.from({ length: 40 }, (_, i) => {
      clock.t = 100 + i * 16
      return m.record()
    })

    expect(repeticoes.every((entry) => entry === null)).toBe(true)
  })

  it('a ocorrência seguinte à janela volta a registrar e diz quantas ficaram de fora', () => {
    const { meter: m, clock } = meter(10_000)
    m.record() // 1ª, registrada
    for (let i = 0; i < 40; i++) {
      clock.t = 100 + i * 16
      m.record() // 40 omitidas
    }

    clock.t = 10_000
    const entry = m.record()

    expect(entry?.level).toBe('warn')
    expect(entry?.details).toEqual({ omitidasDaJanelaAnterior: 40 })
  })

  it('uma janela sem repetição não carrega contagem para a seguinte', () => {
    const { meter: m, clock } = meter(10_000)
    m.record()
    clock.t = 25_000

    expect(m.record()?.details).toEqual({ omitidasDaJanelaAnterior: 0 })
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

  it('o aviso do ResizeObserver não polui o log como erro: vira um warn por janela', () => {
    const { target, listeners, log } = fakeWindow()
    const clock = { t: 0 }
    installRendererErrorReporting(target, () => clock.t)

    // Medido: ~15 por arrasto de gaveta de 120 quadros.
    for (let i = 0; i < 15; i++) {
      clock.t = i * 16
      listeners.error[0]({ message: AVISO_DO_RO })
    }

    expect(log).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'warn', scope: 'renderer:resize-observer-loop' }),
    )
    expect(log).not.toHaveBeenCalledWith(expect.objectContaining({ scope: 'renderer:window-error' }))
  })

  it('um erro de verdade logo depois do aviso continua sendo error', () => {
    const { target, listeners, log } = fakeWindow()
    installRendererErrorReporting(target, () => 0)

    listeners.error[0]({ message: AVISO_DO_RO })
    listeners.error[0]({ message: 'falhou', error: new Error('falhou') })

    expect(log).toHaveBeenLastCalledWith(
      expect.objectContaining({ level: 'error', scope: 'renderer:window-error', message: 'falhou' }),
    )
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

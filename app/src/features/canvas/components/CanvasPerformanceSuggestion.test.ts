import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({ snapshots: {} as Record<string, { activity: string }>, mode: false, setMode: vi.fn(), primary: () => {}, secondary: () => {} }))
vi.mock('../terminal/terminal-session-context', () => ({ useSessionSnapshots: () => estado.snapshots }))
vi.mock('../../shared/performance/performance-mode-context', () => ({
  usePerformanceMode: () => ({ performanceMode: estado.mode, setPerformanceMode: estado.setMode }),
}))
vi.mock('../../shared/hardware/HardwareNotices', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../shared/hardware/HardwareNotices')>()
  return { ...original, NoticeToast: (props: Parameters<typeof original.NoticeToast>[0]) => {
    estado.primary = props.onPrimary ?? (() => {})
    estado.secondary = props.onSecondary
    return createElement(original.NoticeToast, props)
  } }
})
import { CanvasPerformanceSuggestion } from './CanvasPerformanceSuggestion'

function render(nodeCount: number, hydrated = true) {
  return renderToStaticMarkup(createElement(CanvasPerformanceSuggestion, { nodeCount, hydrated }))
}

describe('sugestão de performance por carga', () => {
  beforeEach(() => { estado.snapshots = {}; estado.mode = false; estado.setMode.mockClear() })

  it('sugere nos limiares de nós ou sessões vivas, sem contar sessões encerradas', () => {
    expect(render(299)).toBe('')
    expect(render(300)).toContain('Ligar Modo Performance')
    estado.snapshots = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [i, { activity: 'idle' }]))
    estado.snapshots.fim = { activity: 'exited' }
    estado.snapshots.erro = { activity: 'error' }
    expect(render(0)).toBe('')
    estado.snapshots.novo = { activity: 'starting' }
    expect(render(0)).toContain('10 terminais ativos')
    expect(render(0)).toContain('Agora não')
  })

  it('aguarda hidratação e não sugere com o modo ligado', () => {
    expect(render(300, false)).toBe('')
    estado.mode = true
    expect(render(300)).toBe('')
  })

  it('respeita resposta salva após reiniciar', () => {
    vi.stubGlobal('localStorage', { getItem: () => 'answered' })
    expect(render(300)).toBe('')
    vi.unstubAllGlobals()
  })

  it('salva a escolha e só liga o modo pela ação principal', () => {
    const setItem = vi.fn()
    vi.stubGlobal('localStorage', { getItem: () => null, setItem })
    render(300)
    estado.secondary()
    expect(setItem).toHaveBeenCalledWith('felixo-ai-core.performance-load-suggestion', 'answered')
    expect(estado.setMode).not.toHaveBeenCalled()
    render(300)
    estado.primary()
    expect(estado.setMode).toHaveBeenCalledWith(true)
    vi.unstubAllGlobals()
  })
})

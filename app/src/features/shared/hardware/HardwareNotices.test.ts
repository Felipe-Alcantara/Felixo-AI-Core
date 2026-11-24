import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { botaoPor, botoes } from '../test-support/react-tree'

const estado = vi.hoisted(() => ({
  gpu: null as null | { fallback: string },
  recovery: false,
  dismissRecovery: vi.fn(),
  setPerformanceMode: vi.fn(),
}))
vi.mock('../graphics/gpu-status-store', () => ({
  useGpuStatus: () => estado.gpu,
  acknowledgeGpuFallback: vi.fn(() => Promise.resolve()),
}))
vi.mock('../graphics/gpu-preference', () => ({ describeGpuFallback: (motivo: string) => `A placa de vídeo voltou: ${motivo}.` }))
vi.mock('../performance/performance-mode-context', () => ({
  usePerformanceMode: () => ({
    performanceMode: false,
    setPerformanceMode: estado.setPerformanceMode,
    recoveryNotice: estado.recovery,
    dismissRecoveryNotice: estado.dismissRecovery,
  }),
}))
import { HardwareNotices, NoticeToast } from './HardwareNotices'
import { answerPerformanceSuggestion } from '../performance/performance-suggestion'

const toast = (extra: Partial<Parameters<typeof NoticeToast>[0]> = {}) => {
  const onPrimary = vi.fn()
  const onSecondary = vi.fn()
  const arvore = NoticeToast({
    icon: null,
    title: 'Ligar o Modo Performance?',
    description: 'Poucas CPUs.',
    primaryLabel: 'Ligar Modo Performance',
    onPrimary,
    secondaryLabel: 'Agora não',
    onSecondary,
    dismissLabel: 'Dispensar sugestão do Modo Performance',
    ...extra,
  })
  return { arvore, onPrimary, onSecondary }
}

describe('NoticeToast', () => {
  it('"Ligar Modo Performance" aciona só a ação principal', () => {
    const { arvore, onPrimary, onSecondary } = toast()
    botaoPor(arvore, /^Ligar Modo Performance$/).props.onClick()
    expect(onPrimary).toHaveBeenCalledTimes(1)
    expect(onSecondary).not.toHaveBeenCalled()
  })

  it('"Agora não" e o × (Dispensar) fazem a mesma coisa: a ação secundária', () => {
    const { arvore, onPrimary, onSecondary } = toast()
    botaoPor(arvore, /^Agora não$/).props.onClick()
    botaoPor(arvore, /^Dispensar sugestão do Modo Performance$/).props.onClick()
    expect(onSecondary).toHaveBeenCalledTimes(2)
    expect(onPrimary).not.toHaveBeenCalled()
  })

  it('sem ação principal o aviso só tem o secundário e o ×', () => {
    const { arvore } = toast({ primaryLabel: undefined, onPrimary: undefined })
    expect(botoes(arvore)).toHaveLength(2)
  })
})

describe('answerPerformanceSuggestion', () => {
  const acoes = () => ({ saveAnswered: vi.fn(), markAnswered: vi.fn(), setPerformanceMode: vi.fn() })

  it('"Ligar Modo Performance" grava a resposta, esconde a sugestão e liga o modo', () => {
    const a = acoes()
    answerPerformanceSuggestion(true, a)
    expect(a.saveAnswered).toHaveBeenCalledTimes(1)
    expect(a.markAnswered).toHaveBeenCalledTimes(1)
    expect(a.setPerformanceMode).toHaveBeenCalledWith(true)
  })

  it('"Agora não" e o × gravam a resposta, mas não ligam o modo', () => {
    const a = acoes()
    answerPerformanceSuggestion(false, a)
    expect(a.saveAnswered).toHaveBeenCalledTimes(1)
    expect(a.markAnswered).toHaveBeenCalledTimes(1)
    expect(a.setPerformanceMode).not.toHaveBeenCalled()
  })
})

describe('HardwareNotices', () => {
  beforeEach(() => {
    estado.gpu = null
    estado.recovery = false
  })

  it('sem nada a avisar não desenha nada', () => {
    expect(renderToStaticMarkup(createElement(HardwareNotices))).toBe('')
  })

  it('a volta automática da placa de vídeo aparece com o motivo e o botão de dispensar', () => {
    estado.gpu = { fallback: 'driver instável' }
    const html = renderToStaticMarkup(createElement(HardwareNotices))
    expect(html).toContain('Placa de vídeo voltou para Automático')
    expect(html).toContain('driver instável')
    expect(html).toContain('aria-label="Dispensar aviso da placa de vídeo"')
  })

  it('o aviso de recuperação vem antes dos outros', () => {
    estado.recovery = true
    estado.gpu = { fallback: 'driver instável' }
    const html = renderToStaticMarkup(createElement(HardwareNotices))
    expect(html).toContain('Modo Performance ativado')
    expect(html).not.toContain('Placa de vídeo voltou')
  })
})

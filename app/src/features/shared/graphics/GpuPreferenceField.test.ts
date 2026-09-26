import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { GpuFallbackAlert, GpuPreferenceFieldView, type GpuPreferenceFieldViewProps } from './GpuPreferenceField'
import type { GpuPreferenceStatus } from './gpu-preference'

const STATUS: GpuPreferenceStatus = {
  preference: 'auto',
  applied: 'auto',
  notApplied: null,
  sessionOutcome: 'not-guarded',
  supported: true,
  unsupportedReason: null,
  fallback: null,
  devices: [
    { vendorId: 0x10de, deviceId: 0x134f },
    { vendorId: 0x8086, deviceId: 0x1916 },
  ],
  multipleGpus: true,
}

function render(overrides: Partial<GpuPreferenceFieldViewProps> = {}) {
  const props: GpuPreferenceFieldViewProps = {
    status: STATUS,
    selected: 'auto',
    onSelect: () => {},
    onSave: () => {},
    saving: false,
    message: '',
    open: true,
    onToggle: () => {},
    renderer: 'ANGLE (Intel, Mesa Intel(R) HD Graphics 520 (SKL GT2), OpenGL 4.6)',
    ...overrides,
  }
  return renderToStaticMarkup(createElement(GpuPreferenceFieldView, props))
}

describe('opção de placa de vídeo nas Configurações', () => {
  it('fica recolhida numa opção avançada com resumo alcançável por teclado', () => {
    const html = render({ open: false })
    expect(html).toMatch(/^<details/)
    expect(html).not.toContain(' open=""')
    expect(html).toContain('<summary')
    expect(html).toContain('Opções avançadas: placa de vídeo')
  })

  it('explica quando vale, o custo em bateria e mostra a GPU em uso', () => {
    const html = render()
    expect(html).toContain('próxima abertura do Felixo')
    expect(html).toContain('gasta mais bateria')
    expect(html).toContain('o app volta sozinho para Automático e avisa')
    expect(html).toContain('Em uso agora:')
    expect(html).toContain('HD Graphics 520')
  })

  it('o seletor tem rótulo acessível e o botão salvar só liga quando há mudança', () => {
    const unchanged = render()
    expect(unchanged).toContain('aria-label="Placa de vídeo"')
    expect(unchanged).toContain('role="combobox"')
    expect(unchanged).toMatch(/<button type="button" disabled=""[^>]*>.*Salvar placa de vídeo/s)

    const changed = render({ selected: 'dedicada' })
    expect(changed).not.toMatch(/<button type="button" disabled=""[^>]*>.*Salvar placa de vídeo/s)
  })

  it('mostra o que vale nesta abertura e na próxima', () => {
    expect(render({ status: { ...STATUS, preference: 'dedicada' } })).toContain(
      'Nesta abertura: Automático. Na próxima: Dedicada.',
    )
  })

  it('sem placa lida mostra rasterização por software; antes de ler, "lendo"', () => {
    expect(render({ renderer: null })).toContain('nenhuma placa (rasterização por software)')
    expect(render({ renderer: undefined })).toContain('lendo…')
  })

  it('em sistema sem mecanismo mostra o motivo e desliga o seletor', () => {
    const html = render({
      status: { ...STATUS, supported: false, unsupportedReason: 'Este sistema não tem um jeito confiável.' },
    })
    expect(html).toContain('Este sistema não tem um jeito confiável.')
    expect(html).toMatch(/role="combobox"[^>]*disabled=""|disabled=""[^>]*role="combobox"/)
  })

  it('com a escolha salva e sem duas placas explica que só dá para voltar para Automático', () => {
    const html = render({
      status: { ...STATUS, preference: 'dedicada', devices: [STATUS.devices[1]], multipleGpus: false },
      selected: 'dedicada',
    })
    expect(html).not.toContain('Este computador tem mais de uma placa de vídeo')
    expect(html).toContain('só dá para voltar para Automático')
    // O seletor continua ligado: Automático é uma opção válida.
    expect(html).not.toMatch(/role="combobox"[^>]*disabled=""|disabled=""[^>]*role="combobox"/)
  })

  it('no macOS com placa NVIDIA mostra por que a Dedicada não vale, sem esconder a escolha', () => {
    const html = render({ status: { ...STATUS, unavailablePreferences: { dedicada: 'macos-nvidia-forced-low-power' } } })
    expect(html).toContain('Este computador tem mais de uma placa de vídeo')
    expect(html).toContain('a Dedicada não teria efeito')
  })

  it('o aviso de volta automática tem papel de status e o botão Entendi', () => {
    const html = renderToStaticMarkup(
      createElement(GpuFallbackAlert, {
        fallback: { from: 'dedicada', reason: 'previous-start-unfinished', at: null, detail: null },
        onAcknowledge: () => {},
      }),
    )
    expect(html).toContain('role="status"')
    expect(html).toContain('Placa de vídeo voltou para Automático')
    expect(html).toContain('Entendi')
  })
})

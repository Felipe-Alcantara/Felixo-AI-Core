import { describe, expect, it } from 'vitest'
import { isSoftwareRenderer, readActiveGpuRenderer } from './active-gpu-renderer'
import {
  GPU_PREFERENCE_OPTIONS,
  describeAppliedGpu,
  describeGpuChoiceLimit,
  describeGpuFallback,
  gpuPreferenceOptions,
  isGpuPreference,
  shouldShowGpuChoice,
  type GpuPreferenceStatus,
} from './gpu-preference'

const BASE_STATUS: GpuPreferenceStatus = {
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

describe('preferência de placa de vídeo', () => {
  it('oferece Automático, Integrada e Dedicada marcada como experimental', () => {
    expect(GPU_PREFERENCE_OPTIONS.map((option) => option.value)).toEqual(['auto', 'integrada', 'dedicada'])
    expect(GPU_PREFERENCE_OPTIONS[2].label).toBe('Dedicada (experimental)')
    expect(GPU_PREFERENCE_OPTIONS[2].description).toMatch(/bateria/)
  })

  it('só aceita as três preferências', () => {
    expect(isGpuPreference('dedicada')).toBe(true)
    expect(isGpuPreference('hardware')).toBe(false)
  })

  it('só mostra a escolha com duas placas ou mais', () => {
    expect(shouldShowGpuChoice(BASE_STATUS)).toBe(true)
    expect(shouldShowGpuChoice({ ...BASE_STATUS, devices: [BASE_STATUS.devices[0]], multipleGpus: false })).toBe(false)
    expect(shouldShowGpuChoice(null)).toBe(false)
    expect(gpuPreferenceOptions(BASE_STATUS).map((option) => option.disabled ?? false)).toEqual([false, false, false])
    expect(describeGpuChoiceLimit(BASE_STATUS)).toBeNull()
  })

  it('com uma escolha salva, mostra o campo mesmo sem duas placas, só para voltar para Automático', () => {
    // Ex.: Dedicada salva no Linux e a dedicada desligada no MUX, ou uma eGPU
    // desconectada: sem o campo, não haveria como desfazer pela tela.
    const singleGpu: GpuPreferenceStatus = {
      ...BASE_STATUS,
      preference: 'dedicada',
      applied: 'dedicada',
      devices: [BASE_STATUS.devices[1]],
      multipleGpus: false,
    }
    expect(shouldShowGpuChoice(singleGpu)).toBe(true)
    expect(gpuPreferenceOptions(singleGpu).map((option) => [option.value, option.disabled ?? false])).toEqual([
      ['auto', false],
      ['integrada', true],
      ['dedicada', true],
    ])
    expect(describeGpuChoiceLimit(singleGpu)).toBe(
      'Nesta abertura o Felixo não encontrou duas placas de vídeo, então só dá para voltar para Automático.',
    )

    // No modo compatível o getGPUInfo é recusado e a lista de placas vem vazia.
    const compatible: GpuPreferenceStatus = {
      ...singleGpu,
      applied: 'auto',
      notApplied: 'software-rendering',
      devices: [],
    }
    expect(shouldShowGpuChoice(compatible)).toBe(true)
    expect(gpuPreferenceOptions(compatible).filter((option) => !option.disabled).map((option) => option.value)).toEqual(['auto'])
    expect(describeGpuChoiceLimit(compatible)).toMatch(/modo compatível.*não lê as placas.*voltar para Automático/)

    // No Automático e sem duas placas, continua escondido.
    expect(shouldShowGpuChoice({ ...compatible, preference: 'auto' })).toBe(false)
  })

  it('separa o que vale nesta abertura do que vale na próxima', () => {
    expect(describeAppliedGpu({ ...BASE_STATUS, preference: 'dedicada', applied: 'dedicada' })).toBe('Nesta abertura: Dedicada.')
    expect(describeAppliedGpu({ ...BASE_STATUS, preference: 'dedicada' })).toBe('Nesta abertura: Automático. Na próxima: Dedicada.')
    expect(describeAppliedGpu({ ...BASE_STATUS, preference: 'dedicada', notApplied: 'software-rendering' })).toMatch(/modo compatível/)
  })

  it('explica a abertura feita enquanto outra reabria o app para aplicar a escolha', () => {
    expect(describeAppliedGpu({ ...BASE_STATUS, preference: 'integrada', notApplied: 'relaunch-in-progress' })).toBe(
      'Esta abertura aconteceu enquanto o Felixo reabria para usar a Integrada, então ficou no Automático, sem mudar a escolha.',
    )
  })

  it('explica cada volta automática em linguagem de quem usa', () => {
    const at = '2026-09-26T12:00:00.000Z'
    expect(describeGpuFallback({ from: 'dedicada', reason: 'previous-start-unfinished', at, detail: null })).toMatch(
      /não terminou de abrir da última vez.*voltou para Automático/,
    )
    expect(describeGpuFallback({ from: 'dedicada', reason: 'gpu-disabled', at, detail: null })).toMatch(/sem aceleração.*próxima vez/)
    expect(describeGpuFallback({ from: 'dedicada', reason: 'vulkan-unavailable', at, detail: null })).toMatch(/Vulkan/)
    expect(describeGpuFallback({ from: 'integrada', reason: 'gpu-process-gone', at, detail: 'crashed' })).toMatch(
      /caiu usando a placa de vídeo integrada/,
    )
    expect(describeGpuFallback({ from: 'integrada', reason: 'relaunch-failed', at, detail: null })).toMatch(
      /não conseguiu reabrir sozinho.*voltou para Automático.*sem essas variáveis/,
    )
  })
})

describe('GPU em uso lida pelo WebGL', () => {
  function canvasReturning(renderer: unknown, { debugInfo = true } = {}) {
    const lost: string[] = []
    const context = {
      RENDERER: 0x1f01,
      getExtension(name: string) {
        if (name === 'WEBGL_debug_renderer_info') return debugInfo ? { UNMASKED_RENDERER_WEBGL: 0x9246 } : null
        if (name === 'WEBGL_lose_context') return { loseContext: () => lost.push('perdido') }
        return null
      },
      getParameter(parameter: number) {
        return parameter === 0x9246 || parameter === 0x1f01 ? renderer : null
      },
    }
    return { lost, create: () => ({ getContext: () => context }) }
  }

  it('devolve o renderer do ANGLE e descarta o contexto', () => {
    const canvas = canvasReturning('ANGLE (NVIDIA, Vulkan 1.4.312 (NVIDIA GeForce 920MX (0x0000134F)))')
    expect(readActiveGpuRenderer(canvas.create)).toBe('ANGLE (NVIDIA, Vulkan 1.4.312 (NVIDIA GeForce 920MX (0x0000134F)))')
    expect(canvas.lost).toEqual(['perdido'])
  })

  it('usa o RENDERER comum quando a extensão de depuração não existe', () => {
    expect(readActiveGpuRenderer(canvasReturning('WebKit WebGL', { debugInfo: false }).create)).toBe('WebKit WebGL')
  })

  it('sem WebGL ou com erro devolve null', () => {
    expect(readActiveGpuRenderer(() => ({ getContext: () => null }))).toBeNull()
    expect(
      readActiveGpuRenderer(() => {
        throw new Error('sem canvas')
      }),
    ).toBeNull()
  })

  it('reconhece a rasterização por software', () => {
    expect(isSoftwareRenderer('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))')).toBe(true)
    expect(isSoftwareRenderer(null)).toBe(true)
    expect(isSoftwareRenderer('ANGLE (Intel, Mesa Intel(R) HD Graphics 520 (SKL GT2), OpenGL 4.6)')).toBe(false)
  })
})

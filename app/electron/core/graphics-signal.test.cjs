'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const {
  CRITICAL_GPU_FEATURES,
  detectGpuIncompatibility,
  isIncompatibleFeatureStatus,
} = require('./graphics-signal.cjs')

test('sem featureStatus (ainda não coletado, ou Electron indisponível): compatível, sem sinal', () => {
  assert.deepEqual(detectGpuIncompatibility(), { incompatible: false, reason: null, disabledFeatures: [] })
  assert.deepEqual(detectGpuIncompatibility({}), { incompatible: false, reason: null, disabledFeatures: [] })
  assert.deepEqual(
    detectGpuIncompatibility({ featureStatus: null }),
    { incompatible: false, reason: null, disabledFeatures: [] },
  )
})

test('GPU saudável: todas as features críticas habilitadas, sem sinal', () => {
  const resultado = detectGpuIncompatibility({
    featureStatus: {
      gpu_compositing: 'enabled',
      webgl: 'enabled',
      rasterization: 'enabled',
      video_decode: 'enabled',
      vulkan: 'disabled_off', // não crítica: sozinha não deve acionar o sinal
    },
  })
  assert.equal(resultado.incompatible, false)
  assert.equal(resultado.reason, null)
  assert.deepEqual(resultado.disabledFeatures, [])
})

test('uma feature crítica desligada já é sinal de incompatibilidade', () => {
  const resultado = detectGpuIncompatibility({
    featureStatus: { gpu_compositing: 'disabled_software', webgl: 'enabled', rasterization: 'enabled' },
  })
  assert.equal(resultado.incompatible, true)
  assert.equal(resultado.reason, 'gpu-feature-disabled')
  assert.deepEqual(resultado.disabledFeatures, ['gpu_compositing'])
})

test('lista todas as features críticas desligadas, não só a primeira', () => {
  const resultado = detectGpuIncompatibility({
    featureStatus: { gpu_compositing: 'blocklisted', webgl: 'disabled_off', rasterization: 'unavailable_software' },
  })
  assert.deepEqual(resultado.disabledFeatures, [...CRITICAL_GPU_FEATURES])
})

test('isIncompatibleFeatureStatus reconhece as variações reais do Chromium', () => {
  for (const status of ['disabled', 'disabled_off', 'disabled_software', 'blocklisted', 'blacklisted', 'unavailable_software', 'DISABLED_OFF']) {
    assert.equal(isIncompatibleFeatureStatus(status), true, `deveria reconhecer "${status}"`)
  }
  for (const status of ['enabled', 'enabled_on', 'unavailable_off', '', null, undefined, 42]) {
    assert.equal(isIncompatibleFeatureStatus(status), false, `não deveria reconhecer "${status}"`)
  }
})

test('não confunde com a heurística de memória — este módulo não sabe nada sobre RAM/plataforma', () => {
  // Sanidade: o módulo não exporta nem depende de LOW_END_MEMORY_BYTES,
  // totalMemoryBytes, platformName — as duas fontes de sinal continuam
  // fisicamente separadas em módulos diferentes.
  const modulo = require('./graphics-signal.cjs')
  assert.equal('LOW_END_MEMORY_BYTES' in modulo, false)
  assert.equal('resolveGraphicsProfile' in modulo, false)
})

'use strict'

const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const { ALL_SCENARIOS, parseArgs, sameGpu } = require('./hardware-check.cjs')

test('aceita os cenários conhecidos e os vendorIds esperados', () => {
  const options = parseArgs(['--scenarios=dedicada,pendente', '--expect-integrada=0x8086', '--expect-dedicada=0x10de'])
  assert.deepEqual(options.scenarios, ['dedicada', 'pendente'])
  assert.equal(options.expectIntegrada, 0x8086)
  assert.equal(options.expectDedicada, 0x10de)
  assert.deepEqual(parseArgs([]).scenarios, ALL_SCENARIOS)
})

test('recusa cenário, vendorId ou argumento desconhecido', () => {
  assert.throws(() => parseArgs(['--scenarios=turbo']), /--scenarios aceita/)
  assert.throws(() => parseArgs(['--expect-dedicada=nvidia']), /vendorId/)
  assert.throws(() => parseArgs(['--rodadas=3']), /Argumento desconhecido/)
  assert.throws(() => parseArgs(['--app-image=']), /caminho do \.AppImage/)
})

test('roda os cenários de relançamento também no pacote AppImage', () => {
  const options = parseArgs(['--scenarios=integrada-prime-run,relancamento-perdido', '--app-image=release/Felixo.AppImage'])
  assert.deepEqual(options.scenarios, ['integrada-prime-run', 'relancamento-perdido'])
  assert.equal(options.appImage, path.resolve('release/Felixo.AppImage'))
  assert.equal(parseArgs([]).appImage, '')
  assert.ok(ALL_SCENARIOS.includes('relancamento-perdido'))
  assert.ok(ALL_SCENARIOS.includes('relancamento-em-andamento'))
})

test('a GPU da tela e a do CDP batem por fornecedor e dispositivo, sem a versão do driver', () => {
  // Strings reais de 26/09/2026: o WebGL recebe o renderer sem a versão do driver.
  assert.equal(
    sameGpu(
      'ANGLE (NVIDIA, Vulkan 1.4.312 (NVIDIA NVIDIA GeForce 920MX (0x0000134F)), NVIDIA)',
      'ANGLE (NVIDIA, Vulkan 1.4.312 (NVIDIA NVIDIA GeForce 920MX (0x0000134F)), NVIDIA-580.178.4.0)',
    ),
    true,
  )
  assert.equal(
    sameGpu(
      'ANGLE (Intel, Mesa Intel(R) HD Graphics 520 (SKL GT2), OpenGL 4.6)',
      'ANGLE (NVIDIA, Vulkan 1.4.312 (NVIDIA NVIDIA GeForce 920MX (0x0000134F)), NVIDIA-580.178.4.0)',
    ),
    false,
  )
  assert.equal(sameGpu(null, 'ANGLE (Intel, x, y)'), false)
})

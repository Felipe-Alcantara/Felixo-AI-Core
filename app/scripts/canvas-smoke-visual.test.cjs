'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  findViewportOverflow,
  summarizeGeometryStability,
} = require('./canvas-smoke-visual.cjs')

function frame(selector, rect, viewport = { width: 800, height: 600, deviceScaleFactor: 1 }) {
  return {
    viewport,
    elements: [{ selector, visible: true, rect }],
  }
}

test('geometria constante em frames seguidos passa no threshold visual', () => {
  const rect = { left: 10, top: 20, right: 110, bottom: 70, width: 100, height: 50 }
  const result = summarizeGeometryStability(
    [frame('.canvas', rect), frame('.canvas', rect), frame('.canvas', rect)],
    ['.canvas'],
    0.5,
  )

  assert.equal(result.stable, true)
  assert.equal(result.sampleCount, 3)
  assert.deepEqual(result.violations, [])
})

test('tremor além do threshold identifica o elemento e o eixo que se move', () => {
  const result = summarizeGeometryStability(
    [
      frame('[data-id="fixture-note"]', { left: 10, top: 20, right: 110, bottom: 70, width: 100, height: 50 }),
      frame('[data-id="fixture-note"]', { left: 10.7, top: 20, right: 110.7, bottom: 70, width: 100, height: 50 }),
    ],
    ['[data-id="fixture-note"]'],
    0.5,
  )

  assert.equal(result.stable, false)
  assert.ok(result.violations.some((item) => item.selector === '[data-id="fixture-note"]' && item.property === 'left'))
})

test('elemento essencial ausente ou oculto falha com o seletor responsável', () => {
  const hidden = frame('.drawer', { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 })
  hidden.elements[0].visible = false
  const result = summarizeGeometryStability(
    [hidden],
    ['.drawer', '.toolbar'],
  )

  assert.equal(result.stable, false)
  assert.deepEqual(result.violations.map((item) => item.selector), ['.drawer', '.toolbar'])
  assert.ok(result.violations.every((item) => item.reason === 'missing-or-hidden'))
})

test('surface além do limite da viewport é apontada pelo seletor e retângulo', () => {
  const snapshot = frame('.notifications', {
    left: 780, top: 20, right: 840, bottom: 120, width: 60, height: 100,
  })
  const violations = findViewportOverflow(snapshot, ['.notifications'])

  assert.equal(violations.length, 1)
  assert.equal(violations[0].selector, '.notifications')
  assert.equal(violations[0].reason, 'outside-viewport')
})

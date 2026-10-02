'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  ALLOWED_OUTSIDE,
  ALLOWED_OVERLAPS,
  MATRIX_SURFACES,
  buildMatrixCases,
  describeCase,
  findMissingSurfaces,
  findSurfaceOverlaps,
} = require('./canvas-smoke-matriz.cjs')

const rect = (left, top, right, bottom) => ({ left, top, right, bottom })
const surface = (name, box) => ({ name, visible: true, rect: box })
const CASE = { viewport: { width: 1280, height: 800 } }

function allSurfaces(overrides = {}) {
  const base = {
    topbar: rect(288, 0, 1280, 48),
    sidebar: rect(0, 0, 288, 800),
    statusbar: rect(288, 776, 1280, 800),
    zoom: rect(300, 700, 460, 740),
    minimap: rect(1060, 600, 1260, 750),
    inspector: rect(992, 60, 1280, 560),
    'inspector-puck': null,
    ...overrides,
  }
  return Object.entries(base).map(([name, box]) => (box ? surface(name, box) : { name, visible: false, rect: null }))
}

test('aponta a sobreposição entre superfícies com o par e os retângulos', () => {
  const surfaces = allSurfaces({ zoom: rect(200, 700, 360, 740) })
  const violations = findSurfaceOverlaps(surfaces, {}, { allowed: [] })
  assert.equal(violations.length, 1)
  assert.equal(violations[0].pair, 'sidebar×zoom')
  assert.deepEqual(violations[0].overlap, { width: 88, height: 40 })
  assert.deepEqual(Object.keys(violations[0].rects).sort(), ['sidebar', 'zoom'])
})

test('borda encostada ou interseção de até 1 px não é sobreposição', () => {
  const surfaces = allSurfaces({ zoom: rect(287, 700, 447, 740) })
  assert.deepEqual(findSurfaceOverlaps(surfaces, {}, { allowed: [] }), [])
})

test('ignora superfície escondida e respeita a lista de permitidas com condição', () => {
  const surfaces = allSurfaces({ zoom: rect(200, 700, 360, 740) })
  const allowed = [{ a: 'zoom', b: 'sidebar', motivo: 'teste', when: (matrixCase) => matrixCase.viewport?.width <= 320 }]
  assert.equal(findSurfaceOverlaps(surfaces, { viewport: { width: 320 } }, { allowed }).length, 0)
  assert.equal(findSurfaceOverlaps(surfaces, { viewport: { width: 1280 } }, { allowed }).length, 1)
  const hidden = surfaces.map((item) => (item.name === 'zoom' ? { ...item, visible: false } : item))
  assert.equal(findSurfaceOverlaps(hidden, {}, { allowed: [] }).length, 0)
})

test('exige as superfícies obrigatórias e aceita a falta do Mini Map', () => {
  assert.deepEqual(findMissingSurfaces(allSurfaces({ minimap: null }), CASE), [])
  const problems = findMissingSurfaces(allSurfaces({ statusbar: null }), CASE)
  assert.deepEqual(problems, [{ name: 'statusbar', reason: 'ausente' }])
})

test('exige a lista Elementos ou o puck, e acusa superfície fora da janela', () => {
  const semInspector = findMissingSurfaces(allSurfaces({ inspector: null }), CASE)
  assert.deepEqual(semInspector, [{ name: 'inspector|inspector-puck', reason: 'ausente' }])
  assert.deepEqual(findMissingSurfaces(allSurfaces({ inspector: null, 'inspector-puck': rect(1180, 750, 1268, 790) }), CASE), [])
  const fora = findMissingSurfaces(allSurfaces({ statusbar: rect(288, 790, 1280, 830) }), CASE)
  assert.equal(fora[0].name, 'statusbar')
  assert.equal(fora[0].reason, 'fora-da-janela')
})

test('a matriz do PR e a completa são determinísticas e cobrem o Modo Performance', () => {
  const pr = buildMatrixCases('pr')
  assert.deepEqual(buildMatrixCases('pr'), pr)
  assert.equal(pr.length, 16)
  assert.equal(pr.filter((item) => item.performance).length, 2)
  const completa = buildMatrixCases('completa')
  assert.equal(completa.length, 44)
  assert.equal(new Set(completa.map(describeCase)).size, completa.length)
  assert.ok(completa.some((item) => item.performance && item.theme === 'high_contrast'))
  assert.throws(() => buildMatrixCases('sorteada'), /matriz desconhecida/)
})

test('o rótulo do caso diz tema, viewport, DPR e Modo Performance', () => {
  assert.equal(
    describeCase({ theme: 'dark', viewport: { width: 320, height: 720, deviceScaleFactor: 2 }, performance: true }),
    'dark-320x720-dpr2-performance',
  )
})

test('toda permissão de sobreposição nomeia superfícies medidas e diz o motivo', () => {
  const names = new Set(MATRIX_SURFACES.map((item) => item.name))
  for (const entry of ALLOWED_OVERLAPS) {
    assert.ok(names.has(entry.a) && names.has(entry.b), `${entry.a}×${entry.b} não é superfície medida`)
    assert.ok(entry.motivo?.trim(), `${entry.a}×${entry.b} sem motivo`)
    if (entry.task) assert.match(entry.task, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  }
})

test('superfície fora da janela só passa com permissão do mesmo caso', () => {
  const allowedOutside = [{ name: 'zoom', motivo: 'teste', when: (matrixCase) => matrixCase.viewport.width <= 320 }]
  const surfaces = allSurfaces({ zoom: rect(260, 640, 467, 682) })
  const estreito = { viewport: { width: 320, height: 720 } }
  const zoomProblems = (options) => findMissingSurfaces(surfaces, estreito, options).filter((item) => item.name === 'zoom')
  assert.deepEqual(zoomProblems({ allowedOutside }), [])
  assert.equal(zoomProblems({ allowedOutside: [] })[0].reason, 'fora-da-janela')
})

test('toda permissão de superfície fora da janela nomeia superfície medida, motivo e task', () => {
  const names = new Set(MATRIX_SURFACES.map((item) => item.name))
  for (const entry of ALLOWED_OUTSIDE) {
    assert.ok(names.has(entry.name), `${entry.name} não é superfície medida`)
    assert.ok(entry.motivo?.trim(), `${entry.name} sem motivo`)
    assert.match(entry.task, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  }
})

'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  ALLOWED_OUTSIDE,
  ALLOWED_OVERLAPS,
  MATRIX_SURFACES,
  STATUSBAR_DRAWER_VIEWPORTS,
  buildMatrixCases,
  describeCase,
  findMissingSurfaces,
  findStatusbarProblems,
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
  assert.ok(!pr.some((item) => item.theme === 'light'), 'o claro só muda cor: fica fora do PR')
  const completa = buildMatrixCases('completa')
  assert.equal(completa.length, 66)
  assert.ok(completa.some((item) => item.theme === 'light' && item.performance))
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

// Barra de status com a gaveta aberta e um bloco selecionado (task 3e791f95).
const barra = (over = {}) => ({
  bar: rect(240, 870, 726, 900),
  button: rect(565, 875, 643, 897),
  buttonHit: true,
  overflowX: 0,
  overflowY: 0,
  viewport: { width: 1320, height: 900 },
  ...over,
})

test('a barra com a gaveta aberta é medida em 1320 e em 768 px (critério de aceite)', () => {
  assert.deepEqual(STATUSBAR_DRAWER_VIEWPORTS.map((viewport) => viewport.width), [1320, 768])
})

test('barra de uma linha, com o Remover dentro dela e recebendo o clique, não tem problema', () => {
  assert.deepEqual(findStatusbarProblems(barra()), [])
  const estreita = barra({ bar: rect(240, 870, 328, 900), button: rect(256, 875, 284, 897), viewport: { width: 768, height: 900 } })
  assert.deepEqual(findStatusbarProblems(estreita), [])
})

test('o estado de antes da correção reprova: texto que estoura e quebra, e Remover fora da caixa e coberto', () => {
  // Medido em 05/11/2026 no `HEAD` (474b0a7), janela de 1320 px com a gaveta
  // aberta e o terminal selecionado: barra de 240 a 446, botão de 560 a 682 e
  // o clique no centro dele não chegava ao botão (o inspector ficava por cima).
  const antes = barra({
    bar: rect(240, 870, 446, 900),
    button: rect(560.2, 874.5, 682.3, 896.5),
    buttonHit: false,
    overflowX: 291,
    overflowY: 2,
    viewport: { width: 1320, height: 900 },
  })
  assert.deepEqual(findStatusbarProblems(antes).map((problem) => problem.tipo), [
    'conteudo-estoura-a-barra',
    'quebra-linha',
    'remover-fora-da-barra',
    'remover-coberto',
  ])
})

test('acusa barra ou botão ausente e botão fora da janela', () => {
  assert.deepEqual(findStatusbarProblems(barra({ bar: null })), [{ tipo: 'barra-ausente' }])
  assert.deepEqual(findStatusbarProblems(barra({ button: null })), [{ tipo: 'remover-ausente' }])
  const fora = findStatusbarProblems(barra({ bar: rect(240, 870, 1400, 900), button: rect(1300, 875, 1380, 897) }))
  assert.deepEqual(fora.map((problem) => problem.tipo), ['remover-fora-da-janela'])
})

test('meio pixel de arredondamento não é estouro nem quebra', () => {
  assert.deepEqual(findStatusbarProblems(barra({ overflowX: 1, overflowY: 1 })), [])
})

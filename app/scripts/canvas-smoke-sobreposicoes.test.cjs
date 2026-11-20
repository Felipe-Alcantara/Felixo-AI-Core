'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  CENARIOS,
  DEFEITOS_CONHECIDOS,
  FAIXA_MINIMA_DO_CANVAS,
  TASK_SOBREPOSICOES,
  cortesDaJanela,
  cortesDoMenuPorCima,
  problemasDaSidebar,
  separarDefeitos,
  sobreposicao,
} = require('./canvas-smoke-sobreposicoes.cjs')

const rect = (left, top, right, bottom) => ({ left, top, right, bottom, width: right - left, height: bottom - top })

test('cortesDaJanela: um retângulo dentro da janela não corta nada', () => {
  assert.deepEqual(cortesDaJanela(rect(0, 0, 320, 720), { width: 320, height: 720 }), [])
})

test('cortesDaJanela: aponta o lado e quantos px passam da janela', () => {
  const viewport = { width: 320, height: 720 }
  assert.deepEqual(cortesDaJanela(rect(200, 100, 332, 300), viewport), [{ tipo: 'fora-da-janela', lados: { direita: 12 } }])
  assert.deepEqual(cortesDaJanela(rect(-3, 700, 100, 740), viewport), [{ tipo: 'fora-da-janela', lados: { esquerda: 3, base: 20 } }])
})

test('cortesDaJanela: encostar na borda ou passar só o subpixel não conta', () => {
  assert.deepEqual(cortesDaJanela(rect(0, 0, 320.4, 720), { width: 320, height: 720 }), [])
})

test('cortesDoMenuPorCima: menu que sobe além do topo do cartão é cortado', () => {
  const cartao = rect(0, 100, 320, 250)
  assert.deepEqual(cortesDoMenuPorCima(rect(10, 42, 170, 200), cartao), [{ tipo: 'menu-cortado-pela-borda-de-cima', cortadoEm: 58 }])
})

test('cortesDoMenuPorCima: menu inteiro dentro do cartão não é cortado', () => {
  assert.deepEqual(cortesDoMenuPorCima(rect(10, 120, 170, 240), rect(0, 100, 320, 250)), [])
})

test('cortesDoMenuPorCima: sem medida (menu ou cartão ausente) é reportado, não ignorado', () => {
  assert.deepEqual(cortesDoMenuPorCima(null, rect(0, 0, 1, 1)), [{ tipo: 'sem-medida' }])
})

test('sobreposicao: devolve a área quando há cobertura real e null quando só encostam', () => {
  assert.deepEqual(sobreposicao(rect(0, 0, 100, 50), rect(80, 40, 200, 90)), { largura: 20, altura: 10 })
  assert.equal(sobreposicao(rect(0, 0, 100, 50), rect(100, 0, 200, 50)), null)
  assert.equal(sobreposicao(rect(0, 0, 100, 50), rect(300, 300, 400, 400)), null)
})

test('problemasDaSidebar: a sidebar que deixa menos que a faixa mínima de canvas é reprovada', () => {
  const sidebar = rect(0, 0, 288, 720)
  const topbar = rect(288, 0, 320, 48)
  assert.deepEqual(problemasDaSidebar({ sidebar, topbar }, { width: 320, height: 720 }), [
    { tipo: 'faixa-do-canvas-curta', faixa: 32 },
  ])
})

test('problemasDaSidebar: em janela larga, com faixa suficiente e barra dentro, não há problema', () => {
  const sidebar = rect(0, 0, 288, 800)
  const topbar = rect(288, 0, 1280, 48)
  assert.deepEqual(problemasDaSidebar({ sidebar, topbar }, { width: 1280, height: 800 }), [])
  assert.equal(FAIXA_MINIMA_DO_CANVAS, 160)
})

test('problemasDaSidebar: barra superior que sai pela direita é reportada', () => {
  const sidebar = rect(0, 0, 100, 720)
  const topbar = rect(100, 0, 340, 48)
  const problemas = problemasDaSidebar({ sidebar, topbar }, { width: 320, height: 720 })
  assert.equal(problemas.at(-1).tipo, 'barra-superior-fora-da-janela')
})

test('problemasDaSidebar: sidebar ausente é "sem-medida", não passa em silêncio', () => {
  assert.deepEqual(problemasDaSidebar({ sidebar: null, topbar: null }, { width: 320, height: 720 }), [
    { tipo: 'sem-medida', elemento: 'sidebar' },
  ])
})

test('separarDefeitos: um defeito sabido só cobre o caso em que foi confirmado', () => {
  const defeitos = [{ risco: 'sidebar-expandida', tipo: 'faixa-do-canvas-curta', task: 'T-1', when: (caso) => caso.width <= 320 }]
  const problema = { tipo: 'faixa-do-canvas-curta', faixa: 32 }
  assert.deepEqual(separarDefeitos('sidebar-expandida', { width: 320 }, [problema], defeitos), {
    conhecidos: [{ ...problema, task: 'T-1' }],
    novos: [],
  })
  assert.deepEqual(separarDefeitos('sidebar-expandida', { width: 768 }, [problema], defeitos), {
    conhecidos: [],
    novos: [problema],
  })
})

test('separarDefeitos: outro risco ou outro tipo de problema continua novo', () => {
  const defeitos = [{ risco: 'menu-cor-moldura', tipo: 'fora-da-janela', task: 'T-2' }]
  const problema = { tipo: 'fora-da-janela', lados: { direita: 10 } }
  assert.equal(separarDefeitos('sidebar-expandida', { width: 320 }, [problema], defeitos).novos.length, 1)
  assert.equal(separarDefeitos('menu-cor-moldura', { width: 320 }, [{ tipo: 'sem-medida' }], defeitos).novos.length, 1)
})

test('DEFEITOS_CONHECIDOS: cada entrada aponta a task de sobreposições e um risco de CENARIOS', () => {
  assert.ok(Array.isArray(DEFEITOS_CONHECIDOS))
  // Um cenário pode medir mais de um risco (`riscos`): o do Git com a gaveta também mede o aviso de CLIs.
  const riscos = new Set(CENARIOS.flatMap((cenario) => cenario.riscos ?? [cenario.risco]))
  for (const entrada of DEFEITOS_CONHECIDOS) {
    assert.equal(entrada.task, TASK_SOBREPOSICOES)
    assert.ok(riscos.has(entrada.risco), `risco sem cenário: ${entrada.risco}`)
  }
})

test('CENARIOS: cada risco tem nome único, um texto de inventário e uma função de medição', () => {
  const nomes = CENARIOS.map((cenario) => cenario.risco)
  assert.equal(new Set(nomes).size, nomes.length)
  for (const cenario of CENARIOS) {
    assert.equal(typeof cenario.medir, 'function', cenario.risco)
    assert.ok(cenario.inventario.trim(), cenario.risco)
  }
})

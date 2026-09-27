'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const {
  FORBIDDEN_CHANNEL_PATTERNS,
  channelsOutside,
  clipToViewport,
  compositeOver,
  containingBlockReason,
  contains,
  contrastRatio,
  diffChannels,
  diffStorage,
  externalRequests,
  flattenLayers,
  forbiddenChannels,
  inflate,
  intersects,
  coversSmallTarget,
  rectInside,
  storageViolations,
} = require('./canvas-smoke-onboarding-geometry.cjs')

const rect = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height, width, height })
const VIEWPORT = { width: 1280, height: 800 }

test('rectInside: dentro da janela passa; um pixel fora, ou dentro da margem, reprova', () => {
  assert.equal(rectInside(rect(12, 12, 352, 200), VIEWPORT, 12), true)
  assert.equal(rectInside(rect(0, 0, 1280, 800), VIEWPORT), true)
  // Arredondamento de subpixel não reprova.
  assert.equal(rectInside(rect(-0.4, 10, 100, 100), VIEWPORT), true)
  // Casos que DEVEM reprovar.
  assert.equal(rectInside(rect(-2, 10, 100, 100), VIEWPORT), false)
  assert.equal(rectInside(rect(1200, 10, 100, 100), VIEWPORT), false)
  assert.equal(rectInside(rect(10, 790, 100, 20), VIEWPORT), false)
  assert.equal(rectInside(rect(4, 12, 100, 100), VIEWPORT, 12), false)
})

test('contains: o anel contém o alvo com folga; um alvo maior que o anel reprova', () => {
  const target = rect(60, 100, 40, 40)
  assert.equal(contains(target, target), true)
  assert.equal(contains(rect(61, 101, 38, 38), target, 2), true)
  assert.equal(contains(rect(64, 100, 36, 40), target, 2), false)
  assert.equal(contains(rect(0, 0, 10, 10), target, 2), false)
})

test('intersects: sobreposição conta, encostar a borda não conta', () => {
  assert.equal(intersects(rect(0, 0, 100, 100), rect(50, 50, 100, 100)), true)
  assert.equal(intersects(rect(0, 0, 100, 100), rect(100, 0, 100, 100)), false)
  assert.equal(intersects(rect(0, 0, 100, 100), rect(0, 100.2, 100, 100)), false)
  assert.equal(intersects(rect(0, 0, 100, 100), rect(200, 200, 10, 10)), false)
  // DEVE reprovar a checagem do smoke: card por cima do NoticeToast.
  assert.equal(intersects(rect(460, 600, 352, 180), rect(464, 680, 352, 104)), true)
})

test('coversSmallTarget: só um alvo maior que meia janela pode ficar sob o card', () => {
  const pequena = { width: 416, height: 289 }
  // DEVE reprovar: a folha de 720×500 com zoom +3 por cima do botão Projetos (medido no app).
  assert.equal(coversSmallTarget(rect(12, 104, 392, 173), rect(7, 131, 38, 19), pequena), true)
  // A mesma folha na coluna à direita do rail passa.
  assert.equal(coversSmallTarget(rect(59, 12, 345, 190), rect(7, 131, 38, 19), pequena), false)
  // A região do canvas (maior que meia janela) pode ficar sob a folha.
  assert.equal(coversSmallTarget(rect(12, 12, 392, 173), rect(0, 0, 416, 289), pequena), false)
  // Encostar a borda não conta.
  assert.equal(coversSmallTarget(rect(49, 12, 345, 190), rect(7, 131, 42, 19), pequena), false)
  assert.throws(() => coversSmallTarget(rect(0, 0, 1, 1), null, pequena), TypeError)
})

test('inflate e clipToViewport: contorno visível do anel e parte do alvo na janela', () => {
  assert.deepEqual(inflate(rect(10, 10, 20, 20), 4), { left: 6, top: 6, right: 34, bottom: 34, width: 28, height: 28 })
  assert.deepEqual(clipToViewport(rect(-10, 700, 100, 200), VIEWPORT), { left: 0, top: 700, right: 90, bottom: 800, width: 90, height: 100 })
  assert.deepEqual(clipToViewport(rect(2000, 10, 10, 10), VIEWPORT).width, 0)
})

test('retângulo inválido lança em vez de passar calado', () => {
  assert.throws(() => contains(null, rect(0, 0, 1, 1)), TypeError)
  assert.throws(() => intersects({ left: 0, top: 0 }, rect(0, 0, 1, 1)), TypeError)
  assert.throws(() => rectInside({ left: Number.NaN, top: 0, right: 1, bottom: 1 }, VIEWPORT), TypeError)
})

test('contrastRatio: preto e branco dão 21, cor igual dá 1, e o cinza do meio reprova 4,5', () => {
  assert.equal(Number(contrastRatio([255, 255, 255], [0, 0, 0]).toFixed(2)), 21)
  assert.equal(Number(contrastRatio([0, 0, 0, 1], [255, 255, 255, 1]).toFixed(2)), 21)
  assert.equal(contrastRatio([120, 120, 120], [120, 120, 120]), 1)
  // #767676 sobre branco é o limite conhecido de 4,5:1.
  assert.ok(contrastRatio([0x76, 0x76, 0x76], [255, 255, 255]) >= 4.5)
  // Casos que DEVEM reprovar o mínimo de texto.
  assert.ok(contrastRatio([0x77, 0x77, 0x77], [0x99, 0x99, 0x99]) < 4.5)
  assert.ok(contrastRatio([103, 232, 249], [255, 255, 255]) < 3)
})

test('contrastRatio: frente translúcida é composta sobre o fundo antes de medir', () => {
  // Branco a 10% sobre preto é quase preto: contraste baixo, não 21.
  assert.ok(contrastRatio([255, 255, 255, 0.1], [0, 0, 0, 1]) < 1.5)
  assert.throws(() => contrastRatio([300, 0, 0], [0, 0, 0]), TypeError)
  assert.throws(() => contrastRatio('rgb(0, 0, 0)', [0, 0, 0]), TypeError)
})

test('compositeOver e flattenLayers: camadas do elemento até a raiz', () => {
  assert.deepEqual(compositeOver([255, 255, 255, 0.5], [0, 0, 0, 1]), [127.5, 127.5, 127.5, 1])
  assert.deepEqual(compositeOver([0, 0, 0, 0], [10, 20, 30, 1]), [10, 20, 30, 1])
  // Botão transparente sobre o card preto sobre a raiz escura: preto.
  assert.deepEqual(flattenLayers([[0, 0, 0, 0], [0, 0, 0, 1], [5, 6, 7, 1]]), [0, 0, 0, 1])
  // Sem camada opaca, vale a base.
  assert.deepEqual(flattenLayers([[0, 0, 0, 0]], [255, 255, 255, 1]), [255, 255, 255, 1])
})

test('containingBlockReason: só propriedades que prendem o fixed contam', () => {
  const none = { transform: 'none', filter: 'none', perspective: 'none', contain: 'none', isolation: 'auto', willChange: 'auto', backdropFilter: 'none' }
  assert.equal(containingBlockReason(none), null)
  assert.equal(containingBlockReason({ ...none, willChange: 'scroll-position' }), null)
  assert.equal(containingBlockReason({ ...none, contain: 'style' }), null)
  // Casos que DEVEM reprovar a checagem do host.
  assert.equal(containingBlockReason({ ...none, transform: 'matrix(1, 0, 0, 1, 0, 0)' }), 'transform')
  assert.equal(containingBlockReason({ ...none, filter: 'blur(2px)' }), 'filter')
  assert.equal(containingBlockReason({ ...none, contain: 'layout paint' }), 'contain')
  assert.equal(containingBlockReason({ ...none, isolation: 'isolate' }), 'isolation')
  assert.equal(containingBlockReason({ ...none, willChange: 'transform' }), 'will-change')
  assert.equal(containingBlockReason({ ...none, backdropFilter: 'blur(4px)' }), 'backdrop-filter')
})

test('diffChannels: só os canais que subiram, com o aumento', () => {
  const before = { 'canvas:list': 2, 'onboarding:read': 1, 'devtools:main-eval': 3 }
  const after = { 'canvas:list': 2, 'onboarding:read': 1, 'onboarding:write': 2, 'devtools:main-eval': 4 }
  assert.deepEqual(diffChannels(before, after), { 'devtools:main-eval': 1, 'onboarding:write': 2 })
  assert.deepEqual(diffChannels({}, {}), {})
})

test('forbiddenChannels: PTY, CLI, rede, crédito e escrita no canvas reprovam; leitura e o tour passam', () => {
  const delta = {
    'onboarding:write': 1,
    'devtools:main-eval': 1,
    'canvas:list': 1,
    'canvas:list-edges': 1,
    'clis:get-setup-status': 1,
    'pty:spawn': 1,
    'cli:send': 1,
    'openia:generate-image': 1,
    'notion:tasks:list': 1,
    'canvas:save': 1,
    'canvas:set-skills': 1,
    'projects:pick-folder': 1,
    'projects:list': 1,
  }
  assert.deepEqual(forbiddenChannels(delta).sort(), [
    'canvas:save',
    'canvas:set-skills',
    'cli:send',
    'notion:tasks:list',
    'openia:generate-image',
    'projects:pick-folder',
    'pty:spawn',
  ])
  assert.deepEqual(forbiddenChannels({ 'onboarding:read': 1, 'onboarding:write': 3 }), [])
})

test('FORBIDDEN_CHANNEL_PATTERNS acompanha os canais reais do preload', () => {
  const preload = fs.readFileSync(path.join(__dirname, '..', 'electron', 'preload.cjs'), 'utf8')
  const channels = [...preload.matchAll(/ipcRenderer\.invoke\('([^']+)'/g)].map((match) => match[1])
  assert.ok(channels.length > 50, 'o preload expõe os canais esperados')
  // Nenhum padrão ficou obsoleto: cada um casa pelo menos um canal real.
  for (const pattern of FORBIDDEN_CHANNEL_PATTERNS) {
    assert.ok(channels.some((channel) => pattern.test(channel)), `padrão sem canal no preload: ${pattern}`)
  }
  // Os canais do próprio tutorial e as leituras do boot nunca são proibidos.
  for (const allowed of ['onboarding:read', 'onboarding:write', 'canvas:list', 'canvas:list-edges', 'devtools:main-eval', 'hardware:get-profile']) {
    assert.ok(channels.includes(allowed), `canal ausente no preload: ${allowed}`)
    assert.deepEqual(forbiddenChannels({ [allowed]: 1 }), [], allowed)
  }
  // Toda escrita do canvas cai num padrão proibido.
  for (const write of ['canvas:save', 'canvas:save-edge', 'canvas:delete', 'canvas:delete-edge', 'canvas:clear', 'canvas:import']) {
    assert.ok(channels.includes(write), `canal ausente no preload: ${write}`)
    assert.deepEqual(forbiddenChannels({ [write]: 1 }), [write])
  }
})

test('channelsOutside: o percurso só pode usar a janela de controle e os canais do tour', () => {
  const delta = { 'onboarding:write': 1, 'devtools:main-eval': 1, 'updates:get-status': 1 }
  assert.deepEqual(channelsOutside(delta, ['updates:get-status', 'devtools:main-eval']), [])
  // DEVE reprovar: canal novo que a janela ociosa não usou.
  assert.deepEqual(channelsOutside({ ...delta, 'qa-logger:log': 1 }, ['updates:get-status']), ['qa-logger:log'])
})

test('diffStorage e storageViolations: só a remoção do marcador de primeiro boot é permitida', () => {
  const before = { 'felixo:onboarding:primeiro-boot': '1', 'felixo-ai-core.theme': 'dark', 'felixo:canvas-sidebar-collapsed': '0' }
  const onlyMarker = diffStorage(before, { 'felixo-ai-core.theme': 'dark', 'felixo:canvas-sidebar-collapsed': '0' })
  assert.deepEqual(onlyMarker, { added: [], removed: ['felixo:onboarding:primeiro-boot'], changed: [] })
  assert.deepEqual(storageViolations(onlyMarker, { removable: ['felixo:onboarding:primeiro-boot'] }), [])

  // Casos que DEVEM reprovar: o tour mudou uma preferência ou criou chave.
  const changed = diffStorage(before, { ...before, 'felixo:canvas-sidebar-collapsed': '1', 'felixo:novo': 'x' })
  assert.deepEqual(storageViolations(changed, { removable: ['felixo:onboarding:primeiro-boot'] }), [
    { key: 'felixo:novo', kind: 'added' },
    { key: 'felixo:canvas-sidebar-collapsed', kind: 'changed' },
  ])
  assert.deepEqual(storageViolations(diffStorage(before, {}), {}).length, 3)
})

test('externalRequests: a origem do app e os esquemas locais passam; qualquer outro host reprova', () => {
  const origin = 'http://127.0.0.1:5173'
  assert.deepEqual(
    externalRequests(
      [
        'http://127.0.0.1:5173/src/features/onboarding/onboarding-ui-entry.ts',
        'file:///opt/app/dist/assets/index.js',
        'data:image/png;base64,AAAA',
        'blob:http://127.0.0.1:5173/abc',
        'devtools://devtools/bundled/x.js',
      ],
      origin,
    ),
    [],
  )
  assert.deepEqual(
    externalRequests(['https://api.openai.com/v1/images', 'http://127.0.0.1:9/', 'nao é url'], origin),
    ['https://api.openai.com/v1/images', 'http://127.0.0.1:9/', 'nao é url'],
  )
})

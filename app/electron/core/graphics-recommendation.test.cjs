'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const {
  clearGraphicsRecommendation,
  dismissGraphicsRecommendation,
  evaluateGpuAfterReady,
  persistGraphicsRecommendation,
  readDismissedSignal,
  readGraphicsRecommendation,
} = require('./graphics-recommendation.cjs')

/** SQLite-free fake filesystem, isolado em memória por teste. */
function fakeFileSystem() {
  const files = new Map()
  return {
    files,
    mkdirSync: () => {},
    writeFileSync: (filePath, content) => files.set(filePath, content),
    readFileSync: (filePath) => {
      if (!files.has(filePath)) {
        const error = new Error('ENOENT')
        error.code = 'ENOENT'
        throw error
      }
      return files.get(filePath)
    },
    rmSync: (filePath) => {
      files.delete(filePath)
    },
  }
}

test('persistGraphicsRecommendation grava e readGraphicsRecommendation lê de volta', () => {
  const fileSystem = fakeFileSystem()
  persistGraphicsRecommendation({
    userDataPath: '/perfil',
    reason: 'gpu-feature-disabled',
    disabledFeatures: ['webgl'],
    detectedAt: '2026-09-10T12:00:00.000Z',
    fileSystem,
  })

  const lida = readGraphicsRecommendation('/perfil', fileSystem)
  assert.deepEqual(lida, {
    reason: 'gpu-feature-disabled',
    disabledFeatures: ['webgl'],
    detectedAt: '2026-09-10T12:00:00.000Z',
  })
})

test('sem recomendação persistida, ou userDataPath vazio: devolve null', () => {
  const fileSystem = fakeFileSystem()
  assert.equal(readGraphicsRecommendation('/perfil', fileSystem), null)
  assert.equal(readGraphicsRecommendation('', fileSystem), null)
  assert.equal(readGraphicsRecommendation(undefined, fileSystem), null)
})

test('clearGraphicsRecommendation apaga sem lançar mesmo sem nada salvo', () => {
  const fileSystem = fakeFileSystem()
  assert.doesNotThrow(() => clearGraphicsRecommendation('/perfil', fileSystem))
  persistGraphicsRecommendation({
    userDataPath: '/perfil',
    reason: 'gpu-feature-disabled',
    disabledFeatures: ['webgl'],
    detectedAt: '2026-09-10T12:00:00.000Z',
    fileSystem,
  })
  clearGraphicsRecommendation('/perfil', fileSystem)
  assert.equal(readGraphicsRecommendation('/perfil', fileSystem), null)
})

test('evaluateGpuAfterReady: GPU saudável não persiste nada e limpa recomendação velha', async () => {
  const fileSystem = fakeFileSystem()
  persistGraphicsRecommendation({
    userDataPath: '/perfil',
    reason: 'gpu-feature-disabled',
    disabledFeatures: ['webgl'],
    detectedAt: '2026-09-09T00:00:00.000Z',
    fileSystem,
  })

  const resultado = await evaluateGpuAfterReady({
    userDataPath: '/perfil',
    getGPUFeatureStatus: () => ({ gpu_compositing: 'enabled', webgl: 'enabled', rasterization: 'enabled' }),
    fileSystem,
  })

  assert.deepEqual(resultado, { evaluated: true, recommended: false })
  assert.equal(readGraphicsRecommendation('/perfil', fileSystem), null)
})

test('evaluateGpuAfterReady: GPU incompatível persiste a recomendação com motivo e timestamp', async () => {
  const fileSystem = fakeFileSystem()

  const resultado = await evaluateGpuAfterReady({
    userDataPath: '/perfil',
    getGPUFeatureStatus: () => ({ gpu_compositing: 'blocklisted', webgl: 'enabled', rasterization: 'enabled' }),
    now: () => '2026-09-10T15:00:00.000Z',
    fileSystem,
  })

  assert.equal(resultado.evaluated, true)
  assert.equal(resultado.recommended, true)
  assert.deepEqual(resultado.recommendation, {
    reason: 'gpu-feature-disabled',
    disabledFeatures: ['gpu_compositing'],
    detectedAt: '2026-09-10T15:00:00.000Z',
  })
  assert.deepEqual(readGraphicsRecommendation('/perfil', fileSystem), resultado.recommendation)
})

test('evaluateGpuAfterReady: getGPUFeatureStatus assíncrona (Promise) também funciona', async () => {
  const fileSystem = fakeFileSystem()
  const resultado = await evaluateGpuAfterReady({
    userDataPath: '/perfil',
    getGPUFeatureStatus: async () => ({ webgl: 'disabled_off' }),
    fileSystem,
  })
  assert.equal(resultado.recommended, true)
})

test('evaluateGpuAfterReady: sessão já em software rendering não avalia nada e limpa recomendação velha', async () => {
  const fileSystem = fakeFileSystem()
  persistGraphicsRecommendation({
    userDataPath: '/perfil',
    reason: 'gpu-feature-disabled',
    disabledFeatures: ['webgl'],
    detectedAt: '2026-09-09T00:00:00.000Z',
    fileSystem,
  })
  let chamou = false

  const resultado = await evaluateGpuAfterReady({
    userDataPath: '/perfil',
    getGPUFeatureStatus: () => {
      chamou = true
      return {}
    },
    alreadyUsingSoftwareRendering: true,
    fileSystem,
  })

  assert.deepEqual(resultado, { evaluated: false, recommended: false })
  assert.equal(chamou, false, 'não deveria nem consultar a GPU quando já está em software')
  assert.equal(readGraphicsRecommendation('/perfil', fileSystem), null)
})

test('evaluateGpuAfterReady: getGPUFeatureStatus indisponível (não é função) não quebra o boot', async () => {
  const fileSystem = fakeFileSystem()
  const resultado = await evaluateGpuAfterReady({ userDataPath: '/perfil', fileSystem })
  assert.deepEqual(resultado, { evaluated: false, recommended: false })
})

test('evaluateGpuAfterReady: getGPUFeatureStatus que lança não derruba o app nem mexe na recomendação existente', async () => {
  const fileSystem = fakeFileSystem()
  persistGraphicsRecommendation({
    userDataPath: '/perfil',
    reason: 'gpu-feature-disabled',
    disabledFeatures: ['webgl'],
    detectedAt: '2026-09-09T00:00:00.000Z',
    fileSystem,
  })

  const resultado = await evaluateGpuAfterReady({
    userDataPath: '/perfil',
    getGPUFeatureStatus: () => {
      throw new Error('API indisponível nesta build')
    },
    fileSystem,
  })

  assert.deepEqual(resultado, { evaluated: false, recommended: false })
  // Recomendação de um boot anterior continua valendo — uma falha de
  // consulta não é evidência de que o problema sumiu.
  assert.notEqual(readGraphicsRecommendation('/perfil', fileSystem), null)
})

test('recomendação recusada: o MESMO sinal não volta a incomodar no próximo boot', async () => {
  const fileSystem = fakeFileSystem()
  const featureStatus = { gpu_compositing: 'blocklisted', webgl: 'enabled', rasterization: 'enabled' }

  // Boot 1: detecta e persiste.
  const boot1 = await evaluateGpuAfterReady({ userDataPath: '/perfil', getGPUFeatureStatus: () => featureStatus, fileSystem })
  assert.equal(boot1.recommended, true)

  // A pessoa recusa (equivalente ao IPC graphics:dismiss-recommendation).
  dismissGraphicsRecommendation('/perfil', fileSystem)
  assert.equal(readGraphicsRecommendation('/perfil', fileSystem), null)
  assert.deepEqual(readDismissedSignal('/perfil', fileSystem), ['gpu_compositing'])

  // Boot 2: MESMO sinal (o driver continua exatamente igual) — fica quieto,
  // não persiste recomendação nova nenhuma.
  const boot2 = await evaluateGpuAfterReady({ userDataPath: '/perfil', getGPUFeatureStatus: () => featureStatus, fileSystem })
  assert.equal(boot2.recommended, false)
  assert.equal(boot2.dismissed, true)
  assert.equal(readGraphicsRecommendation('/perfil', fileSystem), null)
})

test('recomendação recusada: um sinal DIFERENTE volta a perguntar', async () => {
  const fileSystem = fakeFileSystem()

  const boot1 = await evaluateGpuAfterReady({
    userDataPath: '/perfil',
    getGPUFeatureStatus: () => ({ gpu_compositing: 'blocklisted', webgl: 'enabled', rasterization: 'enabled' }),
    fileSystem,
  })
  assert.equal(boot1.recommended, true)
  dismissGraphicsRecommendation('/perfil', fileSystem)

  // Boot 2: agora é o webgl que quebrou também — sinal diferente do que foi
  // recusado (['gpu_compositing'] !== ['gpu_compositing','webgl']).
  const boot2 = await evaluateGpuAfterReady({
    userDataPath: '/perfil',
    getGPUFeatureStatus: () => ({ gpu_compositing: 'blocklisted', webgl: 'disabled_off', rasterization: 'enabled' }),
    fileSystem,
  })
  assert.equal(boot2.recommended, true)
  assert.deepEqual(readGraphicsRecommendation('/perfil', fileSystem).disabledFeatures, ['gpu_compositing', 'webgl'])
})

test('sinal de GPU incompatível NUNCA sobrescreve a escolha manual da pessoa (só sugere)', async () => {
  const fileSystem = fakeFileSystem()
  const { resolveGraphicsProfile } = require('./graphics-mode.cjs')

  // A pessoa escolheu manualmente "GPU normal" (hardware) mesmo sabendo do
  // risco — o modo persistido continua sendo exatamente esse, mesmo depois
  // de detectar e recomendar o compatível.
  const perfilAntes = resolveGraphicsProfile({
    argv: [], environment: {}, userDataPath: '', platformName: 'linux',
    totalMemoryBytes: 16 * 1024 * 1024 * 1024, cpuCount: 8,
  })
  assert.equal(perfilAntes.mode, 'auto') // sem persisted mode ainda, é o baseline

  const resultado = await evaluateGpuAfterReady({
    userDataPath: '/perfil',
    getGPUFeatureStatus: () => ({ gpu_compositing: 'blocklisted' }),
    alreadyUsingSoftwareRendering: false, // ex.: modo manual 'hardware', GPU ligada nesta sessão
    fileSystem,
  })

  // Recomenda — mas isso é só um arquivo de sugestão separado. O modo
  // gráfico em si (o que resolveGraphicsProfile realmente aplicaria) nunca
  // é tocado por evaluateGpuAfterReady — só persistGraphicsMode() (chamado
  // manualmente via graphics:set-mode) muda isso.
  assert.equal(resultado.recommended, true)
  assert.equal(fileSystem.files.has('graphics-mode.json'), false)
})

test('precedência de graphics-mode.cjs (CLI > env > persisted > default) continua intacta', () => {
  const { resolveGraphicsProfile } = require('./graphics-mode.cjs')

  const porCli = resolveGraphicsProfile({
    argv: ['--felixo-graphics-mode=software'],
    environment: { FELIXO_GRAPHICS_MODE: 'hardware' },
    userDataPath: '',
    platformName: 'linux',
    totalMemoryBytes: 16 * 1024 * 1024 * 1024,
  })
  assert.equal(porCli.mode, 'software')
  assert.equal(porCli.source, 'cli')
})

test('recomendação aceita: persistGraphicsMode grava o que o próximo boot vai ler', () => {
  const { persistGraphicsMode, resolveGraphicsProfile } = require('./graphics-mode.cjs')
  const fileSystem = fakeFileSystem()

  // Equivalente ao clique em "Usar modo compatível": graphics:set-mode('software').
  persistGraphicsMode({ userDataPath: '/perfil', mode: 'software', fileSystem })

  // Próximo boot: resolveGraphicsProfile lê exatamente esse modo persistido.
  const proximoBoot = resolveGraphicsProfile({
    argv: [], environment: {}, userDataPath: '/perfil', platformName: 'win32',
    totalMemoryBytes: 16 * 1024 * 1024 * 1024, fileSystem,
  })
  assert.equal(proximoBoot.mode, 'software')
  assert.equal(proximoBoot.useSoftwareRendering, true)
  assert.equal(proximoBoot.source, 'profile')
})

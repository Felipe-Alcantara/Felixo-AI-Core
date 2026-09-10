'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const {
  clearGraphicsRecommendation,
  evaluateGpuAfterReady,
  persistGraphicsRecommendation,
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

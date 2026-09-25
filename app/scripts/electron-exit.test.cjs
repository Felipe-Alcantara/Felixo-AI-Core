'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { reportFailureAndExit, runningElectronApp } = require('./electron-exit.cjs')

function comExitCodePreservado(fn) {
  const anterior = process.exitCode
  try {
    fn()
  } finally {
    process.exitCode = anterior
  }
}

test('no processo principal do Electron a falha sai com app.exit(1), não só process.exitCode', () => {
  // Regressão: com `app.quit()` o Electron ignorava process.exitCode e saía 0,
  // deixando verde o passo de CI de uma bancada que tinha falhado.
  const chamadas = []
  comExitCodePreservado(() => {
    reportFailureAndExit(new Error('posix_spawnp failed.'), '[benchmark]', {
      electronApp: { exit: (code) => chamadas.push(code) },
      log: () => {},
    })
    assert.equal(process.exitCode, 1)
  })
  assert.deepEqual(chamadas, [1])
})

test('fora do Electron só marca process.exitCode e registra o erro com o prefixo', () => {
  const linhas = []
  comExitCodePreservado(() => {
    reportFailureAndExit(new Error('falhou'), '[bundle]', { electronApp: null, log: (linha) => linhas.push(linha) })
    assert.equal(process.exitCode, 1)
  })
  assert.equal(linhas.length, 1)
  assert.match(linhas[0], /^\[bundle\] Error: falhou/)
})

test('erro que não é Error também é registrado', () => {
  const linhas = []
  comExitCodePreservado(() => {
    reportFailureAndExit('texto solto', '[x]', { electronApp: null, log: (linha) => linhas.push(linha) })
  })
  assert.equal(linhas[0], '[x] texto solto')
})

test('rodando em Node puro (como aqui) não há app do Electron', () => {
  assert.equal(runningElectronApp(), null)
})

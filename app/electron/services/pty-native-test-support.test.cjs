'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  encerrarPtyDeFormaEstavelNoWindows,
  criarKillPtyEstavelNoWindows,
} = require('./pty-native-test-support.cjs')

test('fora do Windows não faz nada e devolve false', () => {
  const chamadas = []
  const resultado = encerrarPtyDeFormaEstavelNoWindows(
    { pid: 4242 },
    { platformName: 'linux', runTaskkill: (...args) => chamadas.push(args) },
  )

  assert.equal(resultado, false)
  assert.deepEqual(chamadas, [])
})

test('sem pid utilizável devolve false mesmo no Windows', () => {
  const chamadas = []
  const resultado = encerrarPtyDeFormaEstavelNoWindows(
    { pid: undefined },
    { platformName: 'win32', runTaskkill: (...args) => chamadas.push(args) },
  )

  assert.equal(resultado, false)
  assert.deepEqual(chamadas, [])
})

test('sem ptyProcess (undefined) devolve false, sem lançar', () => {
  assert.equal(
    encerrarPtyDeFormaEstavelNoWindows(undefined, { platformName: 'win32' }),
    false,
  )
})

test('no Windows com pid roda taskkill /T /F no pid certo, e devolve true', () => {
  const chamadas = []
  const resultado = encerrarPtyDeFormaEstavelNoWindows(
    { pid: 4242 },
    { platformName: 'win32', runTaskkill: (...args) => chamadas.push(args) },
  )

  assert.equal(resultado, true)
  assert.deepEqual(chamadas, [['taskkill', ['/pid', '4242', '/T', '/F'], { stdio: 'ignore' }]])
})

test('taskkill que lança (processo já morto) não propaga o erro — ainda devolve true', () => {
  const resultado = encerrarPtyDeFormaEstavelNoWindows(
    { pid: 4242 },
    {
      platformName: 'win32',
      runTaskkill: () => {
        throw new Error('The process with PID 4242 could not be found.')
      },
    },
  )

  assert.equal(resultado, true)
})

test('criarKillPtyEstavelNoWindows devolve uma função pronta pra injetar em PtyProcessManager', () => {
  const kill = criarKillPtyEstavelNoWindows()
  assert.equal(typeof kill, 'function')
  // O comportamento real por plataforma já está coberto (com platformName
  // injetado) nos testes acima; aqui só provamos que a fábrica devolve algo
  // chamável com a assinatura (ptyProcess, signal) que PtyProcessManager
  // espera de `killPtyProcess`, sem depender de rodar exatamente no Windows
  // ou fora dele — este arquivo roda nos três SOs do CI.
  assert.equal(typeof kill({ pid: 4242 }, 'SIGKILL'), 'boolean')
})

'use strict'

const { EventEmitter } = require('node:events')
const test = require('node:test')
const assert = require('node:assert/strict')

const runner = require('./dev-runner.cjs')

test('o marcador distingue o Vite do Felixo de uma porta de outro processo', async () => {
  const response = new EventEmitter()
  response.statusCode = 200
  response.setEncoding = () => {}
  const request = new EventEmitter()
  request.destroy = () => {}

  const marker = runner.fetchMarker({
    httpGet: (_options, callback) => {
      process.nextTick(() => {
        callback(response)
        response.emit('data', runner.EXPECTED_MARKER)
        response.emit('end')
      })
      return request
    },
  })

  assert.deepEqual(await marker, {
    status: 200,
    body: runner.EXPECTED_MARKER,
  })
})

test('decide limpar, iniciar ou recusar a partir do marcador', () => {
  assert.equal(runner.decidirAcaoDoVite({ status: 'felixo' }), 'limpar-e-iniciar')
  assert.equal(runner.decidirAcaoDoVite({ status: 'down' }), 'iniciar')
  assert.equal(runner.decidirAcaoDoVite({ status: 'foreign' }), 'recusar')
})

test('espera o marcador e recusa uma resposta HTTP que não é do Felixo', async () => {
  await assert.rejects(
    runner.waitForFelixoVite({
      probe: async () => ({ status: 'foreign', httpStatus: 404 }),
      sleep: async () => {},
    }),
    /porta 5173.*outro processo/i,
  )
})

test('interpreta PIDs do lsof no POSIX e do netstat no Windows', () => {
  assert.deepEqual(runner.parseListeningPids('120\n120\n  121\n', 'darwin'), [120, 121])

  const netstat = [
    '  TCP    127.0.0.1:5173    0.0.0.0:0    LISTENING    4321',
    '  TCP    [::1]:5173       [::]:0       LISTENING    4321',
    '  TCP    127.0.0.1:5174    0.0.0.0:0    LISTENING    9999',
  ].join('\r\n')
  assert.deepEqual(runner.parseListeningPids(netstat, 'win32'), [4321])
})

test('só procura o dono da porta depois de confirmar o marcador', async () => {
  let encontrouPids = false
  let matou = false

  const resultado = await runner.stopFelixoVite({
    probe: async () => ({ status: 'foreign', httpStatus: 200 }),
    findPids: () => {
      encontrouPids = true
      return [123]
    },
    terminate: () => {
      matou = true
    },
  })

  assert.deepEqual(resultado, { stopped: false, reason: 'foreign', pids: [] })
  assert.equal(encontrouPids, false)
  assert.equal(matou, false)
})

test('encerra o Vite confirmado e não um servidor estrangeiro', async () => {
  const estados = [{ status: 'felixo' }, { status: 'down' }]
  const encerrados = []

  const resultado = await runner.stopFelixoVite({
    probe: async () => estados.shift() ?? { status: 'down' },
    findPids: () => [321],
    terminate: (pid, options) => encerrados.push({ pid, options }),
    sleep: async () => {},
  })

  assert.equal(resultado.stopped, true)
  assert.deepEqual(encerrados, [{ pid: 321, options: undefined }])
})

test('modo web limpa um Vite válido antes de iniciar e libera o novo no SIGTERM', async () => {
  const vite = new EventEmitter()
  vite.exitCode = null
  vite.signalCode = null
  vite.kill = () => {
    vite.exitCode = 0
    process.nextTick(() => vite.emit('close', 0, null))
    return true
  }
  let iniciouVite = false
  let parouVite = false

  const execução = runner.runDev({
    web: true,
    probe: async () => ({ status: 'felixo' }),
    spawnViteImpl: () => {
      iniciouVite = true
      return vite
    },
    stopServer: async () => {
      parouVite = true
      return { stopped: true }
    },
    wait: async () => {},
    log: () => {},
  })

  setImmediate(() => process.emit('SIGTERM'))
  assert.equal(await execução, 143)
  assert.equal(iniciouVite, true)
  assert.equal(parouVite, true)
})

test('falha esperando o marcador encerra o Vite recém-iniciado', async () => {
  const vite = new EventEmitter()
  vite.exitCode = null
  vite.signalCode = null
  vite.kill = () => {
    vite.exitCode = 1
    process.nextTick(() => vite.emit('close', 1, null))
    return true
  }
  let criouVite = false

  await assert.rejects(
    runner.runDev({
      web: true,
      probe: async () => ({ status: 'down' }),
      spawnViteImpl: () => {
        criouVite = true
        return vite
      },
      wait: async () => {
        throw new Error('marcador não apareceu')
      },
      stopServer: async () => {
        throw new Error('não deve procurar PID de servidor próprio')
      },
      log: () => {},
    }),
    /marcador não apareceu/,
  )
  assert.equal(criouVite, true)
  assert.equal(vite.exitCode, 1)
})

test('sinal durante a inicialização encerra o Vite antes de liberar a sessão', async () => {
  const vite = new EventEmitter()
  vite.exitCode = null
  vite.signalCode = null
  vite.kill = () => {
    vite.exitCode = 143
    process.nextTick(() => vite.emit('close', 143, 'SIGTERM'))
    return true
  }

  const execução = runner.runDev({
    web: true,
    probe: async () => ({ status: 'down' }),
    spawnViteImpl: () => vite,
    wait: () => new Promise(() => {}),
    log: () => {},
  })

  setImmediate(() => process.emit('SIGTERM'))
  assert.equal(await execução, 143)
  assert.equal(vite.exitCode, 143)
})

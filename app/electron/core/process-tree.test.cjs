'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')

const { DEFAULT_GRACE_MS, killProcessTree } = require('./process-tree.cjs')

// --- Unitários: cada ramo da plataforma, com as chamadas de baixo nível injetadas ---

test('POSIX: manda SIGTERM no grupo, espera graceMs, escala para SIGKILL — nunca chama taskkill', async () => {
  const chamadas = []
  await killProcessTree({
    pid: 4242,
    platformName: 'linux',
    graceMs: 30,
    killGroup: (pid, signal) => chamadas.push({ pid, signal }),
    spawnTaskkill: () => assert.fail('não deveria chamar taskkill fora do Windows'),
  })

  assert.deepEqual(chamadas, [
    { pid: 4242, signal: 'SIGTERM' },
    { pid: 4242, signal: 'SIGKILL' },
  ])
})

test('Windows: chama taskkill /T /F com o pid — nunca process.kill de grupo (não existe lá)', async () => {
  const chamadas = []
  const fakeSpawnTaskkill = (command, args, options) => {
    chamadas.push({ command, args, options })
    const { EventEmitter } = require('node:events')
    const child = new EventEmitter()
    setImmediate(() => child.emit('close', 0))
    return child
  }

  await killProcessTree({
    pid: 777,
    platformName: 'win32',
    killGroup: () => assert.fail('não deveria matar grupo POSIX no Windows'),
    spawnTaskkill: fakeSpawnTaskkill,
  })

  assert.equal(chamadas.length, 1)
  assert.equal(chamadas[0].command, 'taskkill')
  assert.deepEqual(chamadas[0].args, ['/pid', '777', '/T', '/F'])
})

test('Windows: falha do taskkill (processo já morto) não rejeita a promise', async () => {
  const fakeSpawnTaskkill = () => {
    const { EventEmitter } = require('node:events')
    const child = new EventEmitter()
    setImmediate(() => child.emit('error', new Error('não encontrado')))
    return child
  }

  await assert.doesNotReject(() =>
    killProcessTree({ pid: 999, platformName: 'win32', spawnTaskkill: fakeSpawnTaskkill }),
  )
})

test('a promise NUNCA rejeita, nem para ESRCH (comum) nem para outro erro (raro, ex.: EPERM)', async () => {
  await assert.doesNotReject(() =>
    killProcessTree({
      pid: 1,
      platformName: 'darwin',
      graceMs: 5,
      killGroup: () => {
        throw Object.assign(new Error('sem processo'), { code: 'ESRCH' })
      },
    }),
  )

  // É "melhor esforço" de propósito: os dois lugares que chamam isto o fazem em
  // fire-and-forget (setTimeout/callback de abort), sem `.catch()` — uma rejeição
  // aqui viraria exceção não tratada e derrubaria o processo principal do app,
  // o que é pior do que o processo órfão que este módulo existe para evitar.
  await assert.doesNotReject(() =>
    killProcessTree({
      pid: 1,
      platformName: 'darwin',
      graceMs: 5,
      killGroup: () => {
        throw Object.assign(new Error('sem permissão'), { code: 'EPERM' })
      },
    }),
  )
})

test('erro que não é ESRCH ainda chega a quem quiser logar, via onError — só não rejeita a promise', async () => {
  const erros = []
  await killProcessTree({
    pid: 1,
    platformName: 'darwin',
    graceMs: 5,
    killGroup: () => {
      throw Object.assign(new Error('sem permissão'), { code: 'EPERM' })
    },
    onError: (error) => erros.push(error),
  })

  assert.equal(erros.length, 2) // SIGTERM e SIGKILL, os dois falharam
  assert.equal(erros[0].code, 'EPERM')
})

test('erro ESRCH nunca chega ao onError — só o inesperado vale a pena logar', async () => {
  const erros = []
  await killProcessTree({
    pid: 1,
    platformName: 'darwin',
    graceMs: 5,
    killGroup: () => {
      throw Object.assign(new Error('sem processo'), { code: 'ESRCH' })
    },
    onError: (error) => erros.push(error),
  })

  assert.equal(erros.length, 0)
})

test('pid inválido (ausente, zero, negativo) não chama nada', async () => {
  for (const pid of [undefined, null, 0, -5, NaN]) {
    await killProcessTree({
      pid,
      platformName: 'linux',
      killGroup: () => assert.fail(`não deveria matar nada para pid ${pid}`),
      spawnTaskkill: () => assert.fail(`não deveria matar nada para pid ${pid}`),
    })
  }
})

test('DEFAULT_GRACE_MS é o intervalo usado quando graceMs não é passado', async () => {
  const tempos = []
  const inicio = Date.now()
  await killProcessTree({
    pid: 1,
    platformName: 'linux',
    killGroup: () => tempos.push(Date.now() - inicio),
  })
  // Só confere que o SIGKILL (segunda chamada) não veio antes do grace default —
  // sem travar o teste no tempo exato, que dependeria do agendador do SO.
  assert.ok(tempos[1] >= DEFAULT_GRACE_MS - 5, `esperado >= ${DEFAULT_GRACE_MS}ms, foi ${tempos[1]}ms`)
})

// --- Fim a fim: processo real com neto real, provando que o neto não fica órfão ---
//
// "Reproduzir com prova, não com impressão" (mesma exigência que já apareceu neste
// repositório para o bug de detecção de CLI no Windows). Um `child.kill('SIGKILL')`
// avulso mata só o processo do meio; este teste sobe avô→pai→neto de verdade e prova
// que o neto morre também — é o cenário real do `npm install` rodando um script de
// pós-instalação.

function estaVivo(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function esperar(condicao, { timeoutMs = 4000, intervalMs = 40 } = {}) {
  const limite = Date.now() + timeoutMs
  while (Date.now() < limite) {
    if (condicao()) return true
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  return false
}

test('processo real: matar a raiz sem árvore mata só o pai (prova do bug antes da correção)', { skip: process.platform === 'win32' }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-process-tree-'))
  const pidFile = path.join(dir, 'neto.pid')
  const script = `
    const { spawn } = require('node:child_process')
    const neto = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
    require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(neto.pid))
    setInterval(() => {}, 1000)
  `
  // SEM detached: true — reproduz o estado do instalador antes da correção.
  const pai = spawn(process.execPath, ['-e', script], { stdio: 'ignore' })

  assert.ok(await esperar(() => fs.existsSync(pidFile)), 'o pai não subiu o neto a tempo')
  const netoPid = Number(fs.readFileSync(pidFile, 'utf8'))
  assert.ok(estaVivo(netoPid))

  pai.kill('SIGKILL')
  await esperar(() => !estaVivo(pai.pid))

  // A prova do bug: o neto continua vivo mesmo com o pai morto.
  assert.ok(estaVivo(netoPid), 'esperado o neto continuar vivo — se morreu, o bug não reproduziu aqui')
  process.kill(netoPid, 'SIGKILL') // limpeza: este teste não usa killProcessTree de propósito
})

test('processo real: killProcessTree mata pai E neto quando o pai nasce detached (a correção)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-process-tree-'))
  const pidFile = path.join(dir, 'neto.pid')
  const script = `
    const { spawn } = require('node:child_process')
    const neto = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
    require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(neto.pid))
    setInterval(() => {}, 1000)
  `
  const pai = spawn(process.execPath, ['-e', script], {
    stdio: 'ignore',
    // No POSIX isto é o que faz `process.kill(-pid)` alcançar o grupo inteiro;
    // no Windows o `killProcessTree` usa `taskkill /T` e nem depende disto.
    detached: process.platform !== 'win32',
  })

  assert.ok(await esperar(() => fs.existsSync(pidFile)), 'o pai não subiu o neto a tempo')
  const netoPid = Number(fs.readFileSync(pidFile, 'utf8'))
  assert.ok(estaVivo(netoPid))

  await killProcessTree({ pid: pai.pid, graceMs: 200 })

  assert.ok(await esperar(() => !estaVivo(pai.pid)), 'o pai deveria ter morrido')
  assert.ok(await esperar(() => !estaVivo(netoPid)), 'o neto ficou órfão — killProcessTree não alcançou a árvore inteira')
})

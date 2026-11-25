'use strict'
require('../../scripts/test-support/pasta-do-teste.cjs') // isola o temporário deste arquivo (ver pasta-do-teste.cjs)

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { createPtyCliHealthGate } = require('./pty-cli-health-gate.cjs')
const { planAutoInstall } = require('./cli-auto-install-plan.cjs')

function setup({ managed, systemExe = null }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-gate-'))
  const root = path.join(dir, 'clis')
  const system = path.join(dir, 'sistema')
  fs.mkdirSync(root, { recursive: true })
  fs.mkdirSync(system, { recursive: true })
  // Placeholder de texto do npm no lugar do executável.
  if (systemExe) fs.writeFileSync(path.join(system, 'claude.exe'), 'placeholder do npm')
  const runs = []
  const gate = createPtyCliHealthGate({
    getInstaller: () => ({
      layout: { root },
      inspectManaged: () => managed,
      run: (reason) => {
        runs.push(reason)
        return Promise.resolve()
      },
    }),
    getEnv: () => ({}),
    resolvePath: (command) => (command === 'claude' ? path.join(systemExe ? system : root, 'claude.exe') : null),
    platformName: process.platform,
  })
  return { gate, runs, root, cleanup: () => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }) }
}

test('cópia do app incompleta e é a que abriria: bloqueia e dispara o reparo uma vez', () => {
  const { gate, runs, cleanup } = setup({ managed: { complete: false, incomplete: true } })
  try {
    const first = gate.check({ command: 'claude' })
    assert.equal(first.block, true)
    assert.match(first.message, /Claude ficou incompleta; reinstalando/)
    gate.check({ command: 'claude' })
    assert.deepEqual(runs, ['repair'])
  } finally {
    cleanup()
  }
})

test('cópia do app incompleta mas o terminal abriria a do sistema inteira: repara sem bloquear', () => {
  const runs = []
  const gate = createPtyCliHealthGate({
    getInstaller: () => ({
      layout: { root: path.join(os.tmpdir(), 'clis-x') },
      inspectManaged: () => ({ incomplete: true }),
      run: (reason) => (runs.push(reason), Promise.resolve()),
    }),
    getEnv: () => ({}),
    resolvePath: () => path.join(os.tmpdir(), 'outro', 'claude.cmd'),
  })
  assert.equal(gate.check({ command: 'claude' }), null)
  assert.deepEqual(runs, ['repair'])
})

test('claude.exe do sistema com o placeholder do npm: só avisa', () => {
  const { gate, runs, cleanup } = setup({ managed: { complete: true, incomplete: false }, systemExe: true })
  try {
    const result = gate.check({ command: 'claude' })
    assert.equal(result.warn, true)
    assert.equal(result.block, undefined)
    assert.match(result.message, /instalado no sistema está incompleto/)
    assert.deepEqual(runs, [])
  } finally {
    cleanup()
  }
})

test('comando que não é Claude nem Codex passa direto', () => {
  const { gate, cleanup } = setup({ managed: { complete: false, incomplete: true } })
  try {
    assert.equal(gate.check({ command: 'pwsh' }), null)
  } finally {
    cleanup()
  }
})

test('plano: pacote do app incompleto entra na fila mesmo com a CLI do sistema detectada', () => {
  const catalog = [{ id: 'codex', name: 'Codex' }]
  const base = { catalog, detections: [{ detected: true }], managedPresent: [false], appVersion: '1' }
  assert.equal(planAutoInstall({ ...base }).pending.length, 0)
  assert.equal(planAutoInstall({ ...base, managedIncomplete: [true] }).pending.length, 1)
  // Falha registrada nesta versão bloqueia a rodada automática, mas não o reparo pedido por quem abriu o agente.
  const previousState = { codex: { version: '1', ok: false } }
  assert.equal(planAutoInstall({ ...base, managedIncomplete: [true], previousState }).pending.length, 0)
  assert.equal(planAutoInstall({ ...base, managedIncomplete: [true], previousState, reason: 'repair' }).pending.length, 1)
})

'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const {
  measureFirstOutput,
  parseArgs,
} = require('./terminal-responsiveness-during-install.cjs')

/** PtyProcessManager falso: emite o marcador em onData logo depois do spawn. */
function createFakeManager({ delayMs = 5, marker = 'FELIXO_RESPONSIVENESS_FIRST_OUTPUT_OK', exitBeforeMarker = false } = {}) {
  const sessions = new Map()
  return {
    spawn(sessionId, { onData, onExit }) {
      sessions.set(sessionId, { onData, onExit })
      if (exitBeforeMarker) {
        setTimeout(() => onExit?.({ exitCode: 0 }), delayMs)
        return
      }
      setTimeout(() => onData?.(`${marker}\n`), delayMs)
    },
    write() {
      return true
    },
    kill() {},
    killAll() {},
  }
}

describe('measureFirstOutput', () => {
  it('mede o tempo até o marcador aparecer no output', async () => {
    const manager = createFakeManager({ delayMs: 10 })
    const durationMs = await measureFirstOutput(manager)

    assert.ok(durationMs >= 5, `esperava pelo menos ~10ms, teve ${durationMs}`)
    assert.ok(durationMs < 2000, `não deveria demorar segundos num fake, teve ${durationMs}`)
  })

  it('rejeita pelo timeout quando a sessão encerra sem nenhum output antes do marcador', async () => {
    const manager = createFakeManager({ exitBeforeMarker: true, delayMs: 5 })

    // onExit sem onData nenhum antes: firstOutputAt continua null, o caminho
    // de onExit não resolve nada — só o timeout cobre esse caso. Um timeout
    // curto injetado evita a suíte esperar os 15s reais de produção.
    await assert.rejects(measureFirstOutput(manager, 30), /tempo limite/)
  })

  it('rejeita se manager.spawn lançar', async () => {
    const manager = {
      spawn: () => {
        throw new Error('falha de spawn')
      },
      kill: () => {},
    }

    await assert.rejects(measureFirstOutput(manager), /falha de spawn/)
  })
})

describe('parseArgs', () => {
  it('usa os padrões quando nenhum argumento é passado', () => {
    const options = parseArgs([])

    assert.equal(options.iterations, 5)
    assert.deepEqual(options.agentCounts, [1, 2, 5, 10])
    assert.equal(options.out, null)
    assert.equal(options.managers, null)
  })

  it('aceita --iterations, --agents e --managers', () => {
    const options = parseArgs(['--iterations=3', '--agents=1,2', '--managers=npm-runtime,yarn-classic', '--out=x.json'])

    assert.equal(options.iterations, 3)
    assert.deepEqual(options.agentCounts, [1, 2])
    assert.deepEqual(options.managers, ['npm-runtime', 'yarn-classic'])
    assert.equal(options.out, 'x.json')
  })

  it('rejeita contagem de agentes repetida', () => {
    assert.throws(() => parseArgs(['--agents=1,1']), /únicas/)
  })

  it('rejeita argumento desconhecido', () => {
    assert.throws(() => parseArgs(['--desconhecido']), /desconhecido/)
  })
})

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const {
  isAutoInstallEnabled,
  planAutoInstall,
  summarizeAutoInstall,
} = require('./cli-auto-install-plan.cjs')

const CATALOG = [
  { id: 'codex', name: 'Codex CLI' },
  { id: 'claude', name: 'Claude Code CLI' },
  { id: 'gemini', name: 'Gemini CLI' },
]

function detections(...detected) {
  return detected.map((value) => ({ detected: value }))
}

describe('cli-auto-install-plan', () => {
  it('only queues the CLIs missing from the machine', () => {
    const { pending, progress } = planAutoInstall({
      catalog: CATALOG,
      detections: detections(true, false, false),
      appVersion: '0.1.0',
    })

    assert.deepEqual(
      pending.map((cli) => cli.id),
      ['claude', 'gemini'],
    )
    assert.deepEqual(
      progress.map((item) => item.state),
      ['present', 'pending', 'pending'],
    )
  })

  // Uma falha que se repete (sem rede, npm bloqueado pela rede da empresa)
  // nao pode virar uma reinstalacao a cada abertura do app.
  it('does not retry automatically what already failed in this version', () => {
    const previousState = {
      claude: { version: '0.1.0', ok: false, message: 'sem rede' },
    }

    const { pending, progress } = planAutoInstall({
      catalog: CATALOG,
      detections: detections(true, false, true),
      previousState,
      appVersion: '0.1.0',
    })

    assert.deepEqual(pending, [])
    assert.equal(progress[1].state, 'skipped')
    assert.equal(progress[1].message, 'sem rede')
  })

  it('does not reinstall automatically after a successful install when detection is still unavailable', () => {
    const { pending, progress } = planAutoInstall({
      catalog: CATALOG,
      detections: detections(false, true, true),
      previousState: { codex: { version: '0.1.0', ok: true, message: 'instalado' } },
      appVersion: '0.1.0',
    })

    assert.deepEqual(pending, [])
    assert.equal(progress[0].state, 'skipped')
  })

  it('tries again in a new version of the app', () => {
    const { pending } = planAutoInstall({
      catalog: CATALOG,
      detections: detections(true, false, true),
      previousState: { claude: { version: '0.1.0', ok: false } },
      appVersion: '0.2.0',
    })

    assert.deepEqual(
      pending.map((cli) => cli.id),
      ['claude'],
    )
  })

  it('ignores the failure record when the person asks to try again', () => {
    const { pending } = planAutoInstall({
      catalog: CATALOG,
      detections: detections(true, false, true),
      previousState: { claude: { version: '0.1.0', ok: false } },
      appVersion: '0.1.0',
      reason: 'manual',
    })

    assert.deepEqual(
      pending.map((cli) => cli.id),
      ['claude'],
    )
  })

  it('runs only in the installed app, unless explicitly forced', () => {
    assert.equal(isAutoInstallEnabled(true, {}), true)
    assert.equal(isAutoInstallEnabled(false, {}), false)
    assert.equal(isAutoInstallEnabled(false, { FELIXO_AUTO_INSTALL_CLIS: '1' }), true)
    assert.equal(isAutoInstallEnabled(true, { FELIXO_AUTO_INSTALL_CLIS: '0' }), false)
  })

  it('reports the failures by name, so the message says what to do about', () => {
    const summary = summarizeAutoInstall([
      { name: 'Codex CLI', state: 'present' },
      { name: 'Claude Code CLI', state: 'installed' },
      { name: 'Gemini CLI', state: 'failed' },
    ])

    assert.equal(summary.state, 'error')
    assert.match(summary.message, /Gemini CLI/)
  })

  it('stays quiet when there was nothing to install', () => {
    const summary = summarizeAutoInstall([
      { name: 'Codex CLI', state: 'present' },
      { name: 'Claude Code CLI', state: 'present' },
    ])

    assert.equal(summary.state, 'idle')
  })
})

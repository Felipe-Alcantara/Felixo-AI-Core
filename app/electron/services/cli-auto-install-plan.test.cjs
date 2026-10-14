const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const {
  compareCliVersions,
  getAutoInstallableClis,
  isAutoInstallEnabled,
  isManagedCliOutdated,
  isTargetNewer,
  planAutoInstall,
  planSystemUpdates,
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

/** Executáveis que o app instalou e ainda estão no disco, na ordem do catálogo. */
function managed(...present) {
  return present
}

describe('cli-auto-install-plan', () => {
  it('compara semver das CLIs sem confundir patch, prerelease e versao desconhecida', () => {
    assert.equal(compareCliVersions('0.58.0', '0.64.0'), -1)
    assert.equal(compareCliVersions('2.1.296', '2.1.296'), 0)
    assert.equal(compareCliVersions('1.0.0', '1.0.0-beta.1'), 1)
    assert.equal(compareCliVersions('nao-sei', '1.0.0'), null)
  })

  it('considera desatualizada a copia gerenciada sem versao verificavel', () => {
    assert.equal(
      isManagedCliOutdated({
        managedPresent: true,
        managedVersion: null,
        latestVersion: '0.64.0',
      }),
      true,
    )
    assert.equal(
      isManagedCliOutdated({
        managedPresent: true,
        managedVersion: '0.64.0',
        latestVersion: '0.64.0',
      }),
      false,
    )
  })

  it('does not put another ecosystem launcher in the npm auto-install queue', () => {
    const catalog = [
      ...CATALOG,
      { id: 'openia', name: 'Openia', autoInstall: false },
    ]

    assert.deepEqual(
      getAutoInstallableClis(catalog).map((cli) => cli.id),
      ['codex', 'claude', 'gemini'],
    )
  })

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
      managedPresent: managed(true, false, false),
      previousState: { codex: { version: '0.1.0', ok: true, message: 'instalado' } },
      appVersion: '0.1.0',
    })

    assert.deepEqual(pending, [])
    assert.equal(progress[0].state, 'skipped')
  })

  it('keeps a successful install valid after the app updates', () => {
    // O app publica uma versão por push: amarrar o sucesso à versão fazia a
    // CLI ser reinstalada na abertura seguinte a qualquer atualização.
    const { pending, progress } = planAutoInstall({
      catalog: CATALOG,
      detections: detections(false, true, true),
      managedPresent: managed(true, false, false),
      previousState: { codex: { version: '0.1.55', ok: true, message: 'instalado' } },
      appVersion: '0.1.103',
    })

    assert.deepEqual(pending, [])
    assert.equal(progress[0].state, 'skipped')
  })

  it('queues an old managed CLI for update even when its binary is detected', () => {
    const { pending, progress } = planAutoInstall({
      catalog: CATALOG,
      detections: detections(true, true, true),
      managedPresent: managed(true, true, true),
      managedVersions: ['0.153.4', '2.1.263', '0.58.0'],
      latestVersions: ['0.162.1', '2.1.296', '0.64.0'],
      previousState: {
        codex: { version: '0.1.0', ok: true },
        claude: { version: '0.1.0', ok: true },
        gemini: { version: '0.1.0', ok: true },
      },
      appVersion: '0.1.0',
    })

    assert.deepEqual(
      pending.map((cli) => cli.id),
      ['codex', 'claude', 'gemini'],
    )
    assert.match(progress[0].message, /0\.153\.4 -> 0\.162\.1/)
  })

  it('nao reinstala a copia gerenciada quando ela ja e igual ao latest', () => {
    const { pending, progress } = planAutoInstall({
      catalog: CATALOG,
      detections: detections(false, false, false),
      managedPresent: managed(true, true, true),
      managedVersions: ['0.162.1', '2.1.296', '0.64.0'],
      latestVersions: ['0.162.1', '2.1.296', '0.64.0'],
      previousState: {
        codex: { version: '0.1.0', ok: true },
        claude: { version: '0.1.0', ok: true },
        gemini: { version: '0.1.0', ok: true },
      },
      appVersion: '0.1.0',
    })

    assert.deepEqual(pending, [])
    assert.deepEqual(progress.map((item) => item.state), ['skipped', 'skipped', 'skipped'])
  })

  it('tenta novamente uma falha quando o registry publica um latest novo', () => {
    const { pending } = planAutoInstall({
      catalog: CATALOG,
      detections: detections(false, true, true),
      previousState: {
        codex: { version: '0.1.0', targetVersion: '0.153.4', ok: false },
      },
      latestVersions: ['0.162.1', null, null],
      appVersion: '0.1.0',
    })

    assert.deepEqual(pending.map((cli) => cli.id), ['codex'])
  })

  it('reinstalls when the binary we installed is no longer on disk', () => {
    const { pending } = planAutoInstall({
      catalog: CATALOG,
      detections: detections(false, true, true),
      managedPresent: managed(false, false, false),
      previousState: { codex: { version: '0.1.55', ok: true, message: 'instalado' } },
      appVersion: '0.1.103',
    })

    assert.deepEqual(
      pending.map((cli) => cli.id),
      ['codex'],
    )
  })

  it('a manual retry ignores the successful record', () => {
    const { pending } = planAutoInstall({
      catalog: CATALOG,
      detections: detections(false, true, true),
      managedPresent: managed(true, false, false),
      previousState: { codex: { version: '0.1.103', ok: true } },
      appVersion: '0.1.103',
      reason: 'manual',
    })

    assert.deepEqual(
      pending.map((cli) => cli.id),
      ['codex'],
    )
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

  it('runs whenever the app opens, unless explicitly disabled', () => {
    assert.equal(isAutoInstallEnabled({}), true)
    assert.equal(isAutoInstallEnabled({ FELIXO_AUTO_INSTALL_CLIS: '1' }), true)
    assert.equal(isAutoInstallEnabled({ FELIXO_AUTO_INSTALL_CLIS: '0' }), false)
  })

  it('reports the failures by name, so the message says what to do about', () => {
    const summary = summarizeAutoInstall([
      { name: 'Codex CLI', state: 'present' },
      { name: 'Claude Code CLI', state: 'installed' },
      {
        name: 'Gemini CLI',
        state: 'failed',
        message: 'Missing optional dependency @example/native. Reinstall a CLI.',
      },
    ])

    assert.equal(summary.state, 'error')
    assert.match(summary.message, /Gemini CLI/)
    assert.match(summary.message, /Missing optional dependency @example\/native/)
  })

  it('stays quiet when there was nothing to install', () => {
    const summary = summarizeAutoInstall([
      { name: 'Codex CLI', state: 'present' },
      { name: 'Claude Code CLI', state: 'present' },
    ])

    assert.equal(summary.state, 'idle')
  })
})

describe('planSystemUpdates', () => {
  const alvo = ['0.163.0-alpha.11', '2.1.300', '0.65.0-preview.0']

  it('atualiza a instalação do npm global que ficou para trás e deixa a que está em dia', () => {
    const plan = planSystemUpdates({
      catalog: CATALOG,
      systemInstalls: [null, { version: '2.1.287' }, { version: '0.65.0-preview.0' }],
      targetVersions: alvo,
      appVersion: '0.1.460',
    })

    assert.deepEqual(
      plan.map(({ cli, action, from, to }) => ({ id: cli.id, action, from, to })),
      [
        { id: 'claude', action: 'update', from: '2.1.287', to: '2.1.300' },
        { id: 'gemini', action: 'current', from: '0.65.0-preview.0', to: '0.65.0-preview.0' },
      ],
    )
  })

  it('sem alvo confirmado no registry não mexe no sistema (nunca rebaixa para o manifesto)', () => {
    const plan = planSystemUpdates({
      catalog: CATALOG,
      systemInstalls: [null, { version: '2.1.287' }, null],
      targetVersions: [null, null, null],
      appVersion: '0.1.460',
    })

    assert.deepEqual(plan, [])
  })

  it('nunca rebaixa uma instalação do sistema mais nova que o alvo', () => {
    const plan = planSystemUpdates({
      catalog: CATALOG,
      systemInstalls: [null, { version: '2.1.301' }, null],
      targetVersions: alvo,
      appVersion: '0.1.460',
    })

    assert.equal(plan[0].action, 'current')
  })

  it('não repete na abertura seguinte a mesma atualização que já falhou, mas repete com alvo novo ou a pedido', () => {
    const previousState = {
      'sistema:claude': { version: '0.1.460', targetVersion: '2.1.300', ok: false, message: 'sem permissão' },
    }
    const base = {
      catalog: CATALOG,
      systemInstalls: [null, { version: '2.1.287' }, null],
      appVersion: '0.1.460',
      previousState,
    }

    assert.equal(planSystemUpdates({ ...base, targetVersions: alvo })[0].action, 'skipped')
    assert.equal(
      planSystemUpdates({ ...base, targetVersions: [null, '2.1.301', null] })[0].action,
      'update',
    )
    assert.equal(planSystemUpdates({ ...base, targetVersions: alvo, reason: 'manual' })[0].action, 'update')
  })
})

describe('isTargetNewer', () => {
  it('segue a publicação mais recente dentro da mesma versão principal (preview para nightly)', () => {
    assert.equal(isTargetNewer('0.65.0-preview.0', '0.65.0-nightly.20261014.g42c518220'), true)
  })

  it('nunca rebaixa a versão principal, nem para o canal estável', () => {
    assert.equal(isTargetNewer('0.66.0', '0.65.0-nightly.20261014.g42c518220'), false)
    assert.equal(isTargetNewer('0.65.0-preview.0', '0.64.0'), false)
  })

  it('a mesma versão não troca, e versão desconhecida sempre troca', () => {
    assert.equal(isTargetNewer('2.1.300', '2.1.300'), false)
    assert.equal(isTargetNewer(null, '2.1.300'), true)
    assert.equal(isTargetNewer('nao-sei', '2.1.300'), true)
    assert.equal(isTargetNewer('2.1.300', null), false)
  })
})

'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const {
  AGENT_CLI_PROVIDERS,
  createAgentCliVersions,
  normalizeCliVersion,
} = require('./agent-cli-versions.cjs')
const { parseVersionFromOutput } = require('../core/cli-detector.cjs')
const fixtures = require('../__fixtures__/agent-resume-versions.json')

function fakeDetect(versions) {
  const calls = []
  const detect = async (provider) => {
    calls.push(provider)
    const value = versions[provider]
    if (value instanceof Error) throw value
    return value ?? null
  }
  return { detect, calls }
}

test('a versão medida de cada fixture passa pelo formato que o renderer aceita', () => {
  for (const fixture of fixtures.versions) {
    assert.equal(normalizeCliVersion(parseVersionFromOutput(fixture.versionOutput)), fixture.version, fixture.versionOutput)
  }
})

test('texto que não é versão nunca vira versão', () => {
  // `parseVersionFromOutput` devolve a primeira linha crua quando não acha número.
  for (const raw of [parseVersionFromOutput('command not found'), 'v1.2.3', '1', '', null, undefined, 42]) {
    assert.equal(normalizeCliVersion(raw), null, String(raw))
  }
})

test('reaproveita a detecção da abertura e não roda --version de novo', async () => {
  const { detect, calls } = fakeDetect({})
  let resolveStartup
  const startup = new Promise((resolve) => {
    resolveStartup = resolve
  })
  const versions = createAgentCliVersions({ detect })
  versions.seed(startup)

  const pending = versions.snapshot()
  resolveStartup([
    { command: 'claude', detected: true, version: '2.1.285' },
    { command: 'codex', detected: true, version: '0.156.1' },
    { command: 'gemini', detected: true, version: '0.57.0' },
    { command: 'git', detected: true, version: '2.50.0' },
  ])

  assert.deepEqual(await pending, { claude: '2.1.285', codex: '0.156.1', gemini: '0.57.0' })
  assert.deepEqual(calls, [])
  assert.equal(versions.peek('gemini'), '0.57.0')
})

test('sem versão na abertura (o --version do Gemini estourou o prazo), a primeira pergunta lê de novo', async () => {
  const { detect, calls } = fakeDetect({ gemini: '0.62.0' })
  const versions = createAgentCliVersions({ detect })
  versions.seed(Promise.resolve([{ command: 'gemini', detected: false, version: null }]))

  assert.equal(await versions.get('gemini'), '0.62.0')
  assert.deepEqual(calls, ['gemini'])
  assert.equal(versions.peek('gemini'), '0.62.0')
})

test('versão lida vale o prazo longo; leitura sem versão, só o curto', async () => {
  let now = 1000
  const { detect, calls } = fakeDetect({ codex: '0.156.1', gemini: null })
  const versions = createAgentCliVersions({ detect, now: () => now, ttlMs: 600_000, missingTtlMs: 60_000 })

  assert.equal(await versions.get('codex'), '0.156.1')
  assert.equal(await versions.get('gemini'), null)
  assert.deepEqual(calls, ['codex', 'gemini'])

  // Dentro do prazo curto, nada é relido.
  now += 30_000
  await Promise.all([versions.get('codex'), versions.get('gemini')])
  assert.deepEqual(calls, ['codex', 'gemini'])

  // Passado o curto, só a leitura sem versão é refeita (o Gemini instalado agora).
  now += 30_000
  await Promise.all([versions.get('codex'), versions.get('gemini')])
  assert.deepEqual(calls, ['codex', 'gemini', 'gemini'])

  // Passado o longo, a versão lida também (a CLI atualizada com o app aberto).
  now += 600_000
  await versions.get('codex')
  assert.equal(calls.filter((provider) => provider === 'codex').length, 2)
})

test('perguntas simultâneas dividem a mesma leitura', async () => {
  const { detect, calls } = fakeDetect({ codex: '0.156.1' })
  const versions = createAgentCliVersions({ detect })

  const [first, second] = await Promise.all([versions.get('codex'), versions.get('codex')])
  assert.equal(first, '0.156.1')
  assert.equal(second, '0.156.1')
  assert.deepEqual(calls, ['codex'])
})

test('falha, versão fora do formato e CLI desconhecida viram null', async () => {
  const { detect, calls } = fakeDetect({ claude: new Error('timeout'), codex: 'codex-cli 0.156.1' })
  const versions = createAgentCliVersions({ detect })

  assert.deepEqual(await versions.snapshot(), { claude: null, codex: null, gemini: null })
  assert.equal(await versions.get('openia'), null)
  assert.deepEqual(calls.sort(), [...AGENT_CLI_PROVIDERS].sort())
})

test('sem leitura nenhuma, peek não espera nada e devolve null', () => {
  const versions = createAgentCliVersions({ detect: async () => '0.57.0' })
  assert.equal(versions.peek('gemini'), null)
})

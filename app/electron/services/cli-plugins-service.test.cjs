'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const { createCliPluginsService, validateGeminiSource } = require('./cli-plugins-service.cjs')

/** CLI falsa: guarda cada chamada e responde pelo que o teste pedir. */
function setup(responder, accountEnv = { CLAUDE_CONFIG_DIR: 'temp-conta' }) {
  const calls = []
  const service = createCliPluginsService({
    resolveAccountEnv: (providerId, accountId) =>
      accountId === 'inexistente'
        ? { ok: false, message: 'A conta selecionada não existe mais.' }
        : { ok: true, env: { ...accountEnv, ANTHROPIC_API_KEY: 'segredo', PATH: 'x' } },
    runCommand: async (call) => {
      calls.push(call)
      return responder(call)
    },
  })
  return { service, calls }
}

const ok = (stdout) => ({ ok: true, stdout, stderr: '' })

test('claude: lista instalados e disponíveis, sem repetir o que já está instalado', async () => {
  const { service, calls } = setup(({ args }) =>
    args.includes('marketplace')
      ? ok(JSON.stringify([{ name: 'oficial', source: 'github', repo: 'anthropics/x' }]))
      : ok(
          JSON.stringify({
            installed: [{ id: 'a@oficial', version: '1.0.0', scope: 'user', enabled: false }],
            available: [
              { pluginId: 'a@oficial', name: 'a', marketplaceName: 'oficial' },
              {
                pluginId: 'b@oficial',
                name: 'b',
                description: 'Faz b\u0007',
                marketplaceName: 'oficial',
                version: '2',
                source: { source: 'git-subdir', url: 'https://github.com/o/r', path: 'p/b' },
              },
            ],
          }),
        ),
  )
  const result = await service.list({ providerId: 'claude', accountId: 'c1', includeAvailable: true })
  assert.equal(result.ok, true)
  assert.deepEqual(
    result.installed.map((p) => [p.id, p.enabled, p.scope]),
    [['a@oficial', false, 'user']],
  )
  assert.deepEqual(result.available.map((p) => p.id), ['b@oficial'])
  assert.equal(result.available[0].origin, 'https://github.com/o/r (p/b)')
  assert.equal(result.available[0].description, 'Faz b')
  assert.equal(result.marketplaces[0].name, 'oficial')
  assert.deepEqual(calls[0].args, ['plugin', 'list', '--json', '--available'])
  assert.equal(calls[0].env.CLAUDE_CONFIG_DIR, 'temp-conta')
  assert.equal('ANTHROPIC_API_KEY' in calls[0].env, false, 'a chave da conta não vai ao processo')
  assert.ok(calls[0].outputLimit > 1024 * 1024, 'a lista do marketplace passa de 2 MB')
})

test('claude: sem includeAvailable a lista é um array só de instalados', async () => {
  const { service, calls } = setup(({ args }) =>
    args.includes('marketplace')
      ? ok('[]')
      : ok(JSON.stringify([{ id: 'demo@mk', version: '0.1.0', scope: 'user', enabled: true }])),
  )
  const result = await service.list({ providerId: 'claude' })
  assert.equal(result.installed[0].name, 'demo')
  assert.equal(result.installed[0].marketplace, 'mk')
  assert.deepEqual(calls[0].args, ['plugin', 'list', '--json'])
})

test('codex: separa instalados e disponíveis e não oferece ligar nem atualizar', async () => {
  const { service } = setup(({ args }) =>
    args.includes('marketplace')
      ? ok(JSON.stringify({ marketplaces: [{ name: 'mk', root: 'raiz' }] }))
      : ok(
          JSON.stringify({
            installed: [],
            available: [
              { pluginId: 'demo@mk', name: 'demo', marketplaceName: 'mk', source: { source: 'local', path: 'p' } },
            ],
          }),
        ),
  )
  const result = await service.list({ providerId: 'codex', includeAvailable: true })
  assert.equal(result.available[0].id, 'demo@mk')
  assert.equal(result.capabilities.toggle, false)
  assert.equal(result.marketplaces[0].origin, 'raiz')
  const toggled = await service.setEnabled({
    providerId: 'codex',
    pluginId: 'demo@mk',
    enabled: true,
    confirmed: true,
  })
  assert.equal(toggled.ok, false)
})

test('gemini: lê o JSON e, sem JSON, o texto; nunca pede catálogo', async () => {
  const comJson = setup(() =>
    ok(JSON.stringify([{ name: 'g', version: '1.0.0', isActive: true, source: 'https://github.com/o/g' }])),
  )
  const a = await comJson.service.list({ providerId: 'gemini', includeAvailable: true })
  assert.deepEqual(
    a.installed.map((p) => [p.name, p.enabled, p.origin]),
    [['g', true, 'https://github.com/o/g']],
  )
  assert.deepEqual(comJson.calls.map((c) => c.args), [['extensions', 'list', '-o', 'json']])

  const texto = setup(() => ok('✓ g (1.0.0)\n Source: https://github.com/o/g\n'))
  const b = await texto.service.list({ providerId: 'gemini' })
  assert.deepEqual(
    b.installed.map((p) => [p.name, p.version, p.origin]),
    [['g', '1.0.0', 'https://github.com/o/g']],
  )

  const vazio = setup(() => ok('No extensions installed.'))
  assert.deepEqual((await vazio.service.list({ providerId: 'gemini' })).installed, [])
})

test('lista que a CLI não entrega ou em formato desconhecido vira erro, não lista vazia', async () => {
  const falha = setup(() => ({
    ok: false,
    stdout: '',
    stderr: 'boom',
    message: 'claude encerrou com codigo 1: boom',
  }))
  assert.equal((await falha.service.list({ providerId: 'claude' })).ok, false)
  const torto = setup(() => ok('<html>'))
  const result = await torto.service.list({ providerId: 'claude' })
  assert.equal(result.ok, false)
  assert.match(result.message, /formato/)
})

test('nada instala, remove, liga ou atualiza sem confirmed === true', async () => {
  const { service, calls } = setup(() => ok('{}'))
  for (const confirmed of [undefined, false, 'true', 1]) {
    for (const [action, params] of [
      ['install', { pluginId: 'a@mk' }],
      ['remove', { pluginId: 'a@mk' }],
      ['setEnabled', { pluginId: 'a@mk', enabled: true }],
      ['update', { pluginId: 'a@mk' }],
    ]) {
      const result = await service[action]({ providerId: 'claude', confirmed, ...params })
      assert.equal(result.ok, false)
      assert.equal(result.requiresConfirmation, true)
    }
  }
  assert.equal(calls.length, 0)
})

test('claude: instala só no escopo user, sem -y, e usa a mensagem da CLI', async () => {
  const { service, calls } = setup(() =>
    ok('{"command":"install","outcome":"ok","message":"Successfully installed plugin: a@mk (scope: user)"}'),
  )
  const result = await service.install({ providerId: 'claude', accountId: 'c1', pluginId: 'a@mk', confirmed: true })
  assert.equal(result.ok, true)
  assert.match(result.message, /Successfully installed/)
  assert.deepEqual(calls[0].args, ['plugin', 'install', 'a@mk', '--scope', 'user', '--json'])
  assert.equal(calls[0].args.some((arg) => arg === '-y' || arg === '--yes' || arg.startsWith('--accept')), false)
})

test('outcome de erro no JSON conta como falha mesmo com código 0', async () => {
  const { service } = setup(() => ok('{"outcome":"error","message":"Command needs confirmation"}'))
  const result = await service.install({ providerId: 'claude', pluginId: 'a@mk', confirmed: true })
  assert.equal(result.ok, false)
  assert.match(result.message, /needs confirmation/)
})

test('o id do plugin é validado antes de virar argumento', async () => {
  const { service, calls } = setup(() => ok('{}'))
  for (const pluginId of ['--scope', '-y', 'a b', 'a;rm', '../x', '', 'a@@b', undefined, 'a@-x']) {
    const result = await service.install({ providerId: 'claude', pluginId, confirmed: true })
    assert.equal(result.ok, false, String(pluginId))
  }
  const noGemini = await service.install({ providerId: 'gemini', source: 'a@b', confirmed: true })
  assert.equal(noGemini.ok, false)
  assert.equal(calls.length, 0)
})

test('gemini instala só por URL https, com o consentimento dado pela confirmação do app', async () => {
  assert.equal(validateGeminiSource('http://github.com/o/g'), null)
  assert.equal(validateGeminiSource('C:\\pasta\\ext'), null)
  assert.equal(validateGeminiSource('https://u:p@github.com/o/g'), null)
  assert.equal(validateGeminiSource('https://github.com/o/g x'), null)
  const { service, calls } = setup(() => ok('instalada'))
  const result = await service.install({ providerId: 'gemini', source: 'https://github.com/o/g', confirmed: true })
  assert.equal(result.ok, true)
  assert.deepEqual(calls[0].args, ['extensions', 'install', 'https://github.com/o/g', '--consent', '--skip-settings'])
})

test('codex instala e remove com add/remove; claude liga e desliga no escopo user', async () => {
  const { service, calls } = setup(() => ok('{}'))
  await service.install({ providerId: 'codex', pluginId: 'demo@mk', confirmed: true })
  await service.remove({ providerId: 'codex', pluginId: 'demo@mk', confirmed: true })
  await service.setEnabled({ providerId: 'claude', pluginId: 'demo@mk', enabled: false, confirmed: true })
  assert.deepEqual(
    calls.map((c) => c.args),
    [
      ['plugin', 'add', 'demo@mk', '--json'],
      ['plugin', 'remove', 'demo@mk', '--json'],
      ['plugin', 'disable', 'demo@mk', '--scope', 'user', '--json'],
    ],
  )
})

test('conta inexistente não chega à CLI; duas alterações na mesma conta não se sobrepõem', async () => {
  const { service, calls } = setup(() => new Promise((resolve) => setTimeout(() => resolve(ok('{}')), 20)))
  assert.equal((await service.list({ providerId: 'claude', accountId: 'inexistente' })).ok, false)
  assert.equal(calls.length, 0)
  const params = { providerId: 'claude', accountId: 'c1', pluginId: 'a@mk', confirmed: true }
  const [first, second] = await Promise.all([service.install(params), service.update(params)])
  assert.equal(first.ok, true)
  assert.equal(second.ok, false)
  assert.match(second.message, /em andamento/)
})

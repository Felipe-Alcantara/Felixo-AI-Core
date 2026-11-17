const test = require('node:test')
const assert = require('node:assert/strict')
const { checkNotionCli, createNotionAgentEnv } = require('./notion-agent-env.cjs')

test('o token da conexão vira NOTION_TOKEN; conexão ausente ou sem token não entrega nada', () => {
  const store = { getCredential: (id) => (id === 'c1' ? { token: 'ntn_segredo' } : id === 'c2' ? { token: null } : null) }
  const build = createNotionAgentEnv({ getConnectionStore: () => store })

  assert.deepEqual(build('c1'), { NOTION_TOKEN: 'ntn_segredo' })
  assert.equal(build('c2'), null)
  assert.equal(build('c3'), null)
  assert.equal(build(''), null)
  assert.equal(build(undefined), null)
  // O cofre nasce depois do gerenciador de terminais: store ausente não derruba o spawn.
  assert.equal(createNotionAgentEnv({ getConnectionStore: () => undefined })('c1'), null)
})

test('o diagnóstico lê o perfil ativo sem repassar token nem o ambiente do app com NOTION_TOKEN', async () => {
  let visto
  const run = async (command, args, env) => {
    visto = { command, args, env }
    return JSON.stringify({ ok: true, dados: { ativo: 'felipe', perfis: [{ alias: 'felipe', token: 'ntn_39...z4rk' }] } })
  }
  const status = await checkNotionCli({ run, env: { PATH: 'x', NOTION_TOKEN: 'ntn_do_app' } })

  assert.deepEqual(status, { installed: true, activeProfile: 'felipe', installHint: 'pipx install notion-automacoes' })
  assert.equal(visto.command, 'notion-tasks')
  assert.equal('NOTION_TOKEN' in visto.env, false)
  assert.ok(!JSON.stringify(status).includes('ntn_'))
})

test('o diagnóstico separa CLI ausente (ENOENT) de falha desconhecida', async () => {
  const ausente = await checkNotionCli({ run: async () => { throw Object.assign(new Error('x'), { code: 'ENOENT' }) } })
  const quebrada = await checkNotionCli({ run: async () => { throw new Error('saiu com 1') } })
  const semPerfil = await checkNotionCli({ run: async () => JSON.stringify({ ok: true, dados: { ativo: null, perfis: [] } }) })

  assert.equal(ausente.installed, false)
  assert.equal(quebrada.installed, null)
  assert.equal(semPerfil.activeProfile, null)
})

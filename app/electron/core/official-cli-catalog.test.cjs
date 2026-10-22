const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const {
  getOfficialAiCli,
  listOfficialAiCliModels,
  listOfficialAiClis,
} = require('./official-cli-catalog.cjs')

describe('official-cli-catalog', () => {
  it('contains official install commands for supported AI CLIs', () => {
    const clis = listOfficialAiClis()

    assert.equal(clis.length, 4)
    assert.deepEqual(
      clis.map((cli) => cli.id),
      ['codex', 'claude', 'gemini', 'openia'],
    )
    assert.deepEqual(getOfficialAiCli('codex').install.args, [
      'i',
      '-g',
      '@openai/codex',
    ])
    assert.deepEqual(getOfficialAiCli('codex').login.args, ['login'])
    assert.equal(getOfficialAiCli('codex').login.windowsCommand, 'codex.cmd')
    assert.deepEqual(getOfficialAiCli('claude').install.args, [
      'install',
      '-g',
      '@anthropic-ai/claude-code',
    ])
    assert.equal(getOfficialAiCli('claude').login.windowsCommand, 'claude.cmd')
    assert.deepEqual(getOfficialAiCli('gemini').install.args, [
      'install',
      '-g',
      '@google/gemini-cli',
    ])
    assert.equal(getOfficialAiCli('gemini').login.windowsCommand, 'gemini.cmd')
    assert.deepEqual(getOfficialAiCli('openia').install.args, [
      '-m',
      'pip',
      'install',
      '--user',
      '--upgrade',
      'https://github.com/Felipe-Alcantara/Openia/archive/6f75f8f.zip',
    ])
    // Atualizar instala o mesmo pino: um pino só no install deixaria o botão
    // de atualizar entregando a revisão antiga.
    assert.deepEqual(getOfficialAiCli('openia').update.args, getOfficialAiCli('openia').install.args)
    assert.equal(getOfficialAiCli('openia').isLauncher, true)
    assert.equal(getOfficialAiCli('openia').autoInstall, false)
    assert.equal(getOfficialAiCli('openia').modelSelection, 'felixo-spawn-interface')
    assert.deepEqual(getOfficialAiCli('openia').models, [])
  })

  it('maps one installed CLI to all app adapters it unlocks', () => {
    assert.deepEqual(
      listOfficialAiCliModels('codex').map((model) => model.cliType),
      ['codex', 'codex-app-server'],
    )
    assert.deepEqual(
      listOfficialAiCliModels('claude').map((model) => model.cliType),
      ['claude'],
    )
    assert.deepEqual(
      listOfficialAiCliModels('gemini').map((model) => model.cliType),
      ['gemini', 'gemini-acp'],
    )
  })

  it('exposes Codex account switch commands only for Codex', () => {
    assert.deepEqual(getOfficialAiCli('codex').accountSwitch.logout.args, [
      'logout',
    ])
    assert.deepEqual(getOfficialAiCli('codex').accountSwitch.status.args, [
      'login',
      'status',
    ])
    assert.equal(getOfficialAiCli('claude').accountSwitch, undefined)
    assert.equal(getOfficialAiCli('gemini').accountSwitch, undefined)
    assert.equal(getOfficialAiCli('openia').accountSwitch, undefined)
  })

  it('returns cloned catalog entries', () => {
    const cli = getOfficialAiCli('codex')
    cli.install.args.push('mutated')

    assert.deepEqual(getOfficialAiCli('codex').install.args, [
      'i',
      '-g',
      '@openai/codex',
    ])
  })

  // O mapa das rotas de instalação (22/10/2026): três CLIs por npm, uma por Python, nenhuma por
  // script. Uma CLI nova que instale de outro jeito quebra este teste de propósito: quem a
  // acrescenta precisa declarar a rota (`install.runtime`) e cobrir cancelamento, prazo, rede e
  // permissão dela em `install-routes-process-tree.test.cjs`, em vez de herdar o silêncio.
  it('cada CLI instala por uma rota declarada: npm ou um runtime próprio (hoje, só Python)', () => {
    const rotas = Object.fromEntries(
      listOfficialAiClis().map((cli) => [
        cli.id,
        cli.install.runtime ? cli.install.runtime.kind : cli.install.npmPackage ? 'npm' : 'sem-rota',
      ]),
    )

    assert.deepEqual(rotas, { codex: 'npm', claude: 'npm', gemini: 'npm', openia: 'python' })
  })

  it('o Openia exige o Python que o pyproject do commit pinado declara (>=3.10)', () => {
    assert.deepEqual(getOfficialAiCli('openia').install.runtime, { kind: 'python', minVersion: '3.10' })
  })

  it('o runtime declarado também é clonado: mudar a cópia não muda o catálogo', () => {
    const cli = getOfficialAiCli('openia')
    cli.install.runtime.minVersion = '9.9'

    assert.equal(getOfficialAiCli('openia').install.runtime.minVersion, '3.10')
  })
})

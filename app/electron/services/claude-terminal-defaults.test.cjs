'use strict'
require('../../scripts/test-support/pasta-do-teste.cjs') // isola o temporário deste arquivo (ver pasta-do-teste.cjs)

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { createClaudeStatuslineService } = require('./claude-statusline-service.cjs')
const { createClaudeTerminalDefaults } = require('./claude-terminal-defaults.cjs')
const { describeOptions, READ_ONLY_NOTE } = require('./claude-config-catalog.cjs')

// Tudo em pasta temporária: nenhum teste lê nem grava o ~/.claude da máquina.
function createEnvironment() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-claude-defaults-'))
  const homeDir = path.join(root, 'home')
  fs.mkdirSync(path.join(homeDir, '.claude'), { recursive: true })
  const settingsFile = path.join(homeDir, '.claude', 'settings.json')
  const claudeJson = path.join(homeDir, '.claude.json')
  fs.writeFileSync(settingsFile, '{"model":"sonnet"}', 'utf8')
  fs.writeFileSync(claudeJson, '{"theme":"light"}', 'utf8')
  const terminalDefaults = createClaudeTerminalDefaults({ baseDir: path.join(root, 'userData', 'defaults') })
  const statusline = createClaudeStatuslineService({
    homeDir,
    baseDir: path.join(root, 'userData', 'statusline'),
    terminalDefaults,
  })
  return {
    root,
    terminalDefaults,
    statusline,
    arquivosDaPessoa: () => [fs.readFileSync(settingsFile, 'utf8'), fs.readFileSync(claudeJson, 'utf8')],
    limpar: () => fs.rmSync(root, { recursive: true, force: true }),
  }
}

test('sem padrão salvo, o terminal recebe só a status line e nada de flag ou variável', () => {
  const env = createEnvironment()
  try {
    const launch = env.statusline.sessionLaunch({ accountId: null })
    assert.equal(path.basename(launch.settingsPath), 'session-settings.json')
    assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(launch.settingsPath, 'utf8'))), ['statusLine'])
    assert.deepEqual(launch.args, ['--chrome'])
    assert.deepEqual(launch.env, {})
  } finally {
    env.limpar()
  }
})

test('o padrão global vai no --settings; a exceção da conta vence e fica em arquivo próprio', () => {
  const env = createEnvironment()
  try {
    assert.equal(env.terminalDefaults.set({ key: 'theme', value: 'light' }).ok, true)
    assert.equal(env.terminalDefaults.set({ key: 'verbose', value: true }).ok, true)
    assert.equal(env.terminalDefaults.set({ key: 'theme', accountId: 'conta-b', value: 'dark-ansi' }).ok, true)
    // `null` na conta: ignora o global e deixa o Claude decidir.
    assert.equal(env.terminalDefaults.set({ key: 'verbose', accountId: 'conta-c', value: null }).ok, true)

    const sistema = env.statusline.sessionLaunch({ accountId: null })
    const contaB = env.statusline.sessionLaunch({ accountId: 'conta-b' })
    const contaC = env.statusline.sessionLaunch({ accountId: 'conta-c' })
    const ler = (launch) => JSON.parse(fs.readFileSync(launch.settingsPath, 'utf8'))

    assert.equal(ler(sistema).theme, 'light')
    assert.equal(ler(sistema).verbose, true)
    assert.equal(ler(contaB).theme, 'dark-ansi')
    assert.equal(ler(contaB).verbose, true)
    assert.equal(ler(contaC).theme, 'light')
    assert.equal('verbose' in ler(contaC), false)
    // Terminais de contas diferentes não dividem (nem sobrescrevem) o arquivo um do outro.
    assert.equal(new Set([sistema.settingsPath, contaB.settingsPath, contaC.settingsPath]).size, 3)
    assert.equal(ler(sistema).statusLine.type, 'command')
    assert.deepEqual(env.terminalDefaults.resolve('conta-b').origins, { claudeInChromeDefaultEnabled: 'global', theme: 'account', verbose: 'global' })
  } finally {
    env.limpar()
  }
})

test('opção do .claude.json com flag ou variável da CLI vira argumento e ambiente, nunca chave do --settings', () => {
  const env = createEnvironment()
  try {
    env.terminalDefaults.set({ key: 'claudeInChromeDefaultEnabled', value: true })
    env.terminalDefaults.set({ key: 'autoConnectIde', value: false })
    env.terminalDefaults.set({ key: 'autoInstallIdeExtension', value: false })
    env.terminalDefaults.set({ key: 'claudeInChromeDefaultEnabled', accountId: 'conta-b', value: false })

    const sistema = env.statusline.sessionLaunch({ accountId: null })
    assert.deepEqual(sistema.args, ['--chrome'])
    assert.deepEqual(sistema.env, { CLAUDE_CODE_AUTO_CONNECT_IDE: '0', CLAUDE_CODE_IDE_SKIP_AUTO_INSTALL: '1' })
    assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(sistema.settingsPath, 'utf8'))), ['statusLine'])
    assert.deepEqual(env.statusline.sessionLaunch({ accountId: 'conta-b' }).args, ['--no-chrome'])
  } finally {
    env.limpar()
  }
})

test('opção sem caminho na CLI é só leitura e o valor é recusado; opção desconhecida também', () => {
  const env = createEnvironment()
  try {
    const catalogo = describeOptions()
    const copiar = catalogo.find((opcao) => opcao.key === 'copyOnSelect')
    assert.equal(copiar.editable, false)
    assert.equal(copiar.note, READ_ONLY_NOTE)
    assert.equal(READ_ONLY_NOTE, 'vale para todo o Claude desta máquina; mude no próprio Claude')
    // A CLI só tem como PULAR a instalação da extensão: ligar não é oferecido.
    assert.deepEqual(catalogo.find((opcao) => opcao.key === 'autoInstallIdeExtension').options.map((o) => o.value), [false])

    assert.equal(env.terminalDefaults.set({ key: 'copyOnSelect', value: false }).ok, false)
    assert.equal(env.terminalDefaults.set({ key: 'autoInstallIdeExtension', value: true }).ok, false)
    assert.equal(env.terminalDefaults.set({ key: 'theme', value: 'roxo' }).ok, false)
    assert.equal(env.terminalDefaults.set({ key: 'apiKeyHelper', value: 'x' }).ok, false)
    assert.equal(env.terminalDefaults.set({ key: 'theme', value: 'dark', accountId: '../fora' }).ok, false)
    assert.equal(fs.existsSync(env.terminalDefaults.filePath), false)
  } finally {
    env.limpar()
  }
})

test('limpar volta ao padrão do Claude (global) ou a seguir o global (conta)', () => {
  const env = createEnvironment()
  try {
    env.terminalDefaults.set({ key: 'editorMode', value: 'vim' })
    env.terminalDefaults.set({ key: 'editorMode', accountId: 'conta-b', value: 'normal' })
    env.terminalDefaults.set({ key: 'editorMode', accountId: 'conta-b', clear: true })
    assert.deepEqual(Object.keys(env.terminalDefaults.read().accounts), [])
    assert.equal(env.terminalDefaults.resolve('conta-b').settings.editorMode, 'vim')
    env.terminalDefaults.set({ key: 'editorMode', clear: true })
    assert.deepEqual(env.terminalDefaults.resolve(null).settings, {})
  } finally {
    env.limpar()
  }
})

test('arquivo corrompido ou editado à mão: ignora o lixo, não derruba o terminal e não polui o protótipo', () => {
  const env = createEnvironment()
  try {
    fs.mkdirSync(path.dirname(env.terminalDefaults.filePath), { recursive: true })
    fs.writeFileSync(env.terminalDefaults.filePath, '{ não é json', 'utf8')
    assert.deepEqual(env.terminalDefaults.resolve(null).settings, {})
    assert.ok(env.statusline.sessionLaunch({ accountId: null }))

    fs.writeFileSync(
      env.terminalDefaults.filePath,
      JSON.stringify({
        global: { theme: 'light', apiKeyHelper: 'rm -rf', verbose: 'sim' },
        accounts: { '__proto__': { theme: 'light' }, 'conta-b': { editorMode: 'vim', model: 'x' } },
      }),
      'utf8',
    )
    assert.deepEqual(env.terminalDefaults.read().global, { theme: 'light' })
    assert.deepEqual(env.terminalDefaults.read().accounts['conta-b'], { editorMode: 'vim' })

    env.terminalDefaults.set({ key: 'verbose', accountId: '__proto__', value: true })
    assert.equal({}.verbose, undefined)
  } finally {
    env.limpar()
  }
})

test('gravar o padrão e abrir terminais não toca o settings.json nem o .claude.json da pessoa', () => {
  const env = createEnvironment()
  try {
    const antes = env.arquivosDaPessoa()
    env.terminalDefaults.set({ key: 'theme', value: 'dark' })
    env.terminalDefaults.set({ key: 'copyOnSelect', value: false })
    env.statusline.sessionLaunch({ accountId: null })
    assert.deepEqual(env.arquivosDaPessoa(), antes)
    assert.equal(fs.existsSync(path.join(env.root, 'userData', 'defaults', 'terminal-defaults.json')), true)
  } finally {
    env.limpar()
  }
})

test('modo fast: sem confirmação do terminal não entra no arquivo; confirmado, entra no MESMO arquivo da status line', () => {
  const env = createEnvironment()
  try {
    env.terminalDefaults.set({ key: 'fastMode', value: true })
    env.terminalDefaults.set({ key: 'theme', value: 'light' })
    const ler = (launch) => JSON.parse(fs.readFileSync(launch.settingsPath, 'utf8'))

    assert.equal(env.terminalDefaults.resolve(null).fastModeRequested, true)
    const semConfirmar = env.statusline.sessionLaunch({ accountId: null })
    assert.equal('fastMode' in ler(semConfirmar), false)
    assert.equal(ler(semConfirmar).theme, 'light')

    const confirmado = env.statusline.sessionLaunch({ accountId: null, fastModeConfirmed: true })
    const conteudo = ler(confirmado)
    assert.equal(conteudo.fastMode, true)
    // A captura de uso mora no mesmo arquivo: um --settings separado a desligaria.
    assert.equal(conteudo.statusLine.type, 'command')
    assert.match(conteudo.statusLine.command, /felixo-session-statusline\.cjs/)
    assert.notEqual(confirmado.settingsPath, semConfirmar.settingsPath)

    // Exceção da conta pode desligar; "padrão do Claude" também não liga nem pergunta.
    env.terminalDefaults.set({ key: 'fastMode', accountId: 'conta-b', value: false })
    env.terminalDefaults.set({ key: 'fastMode', accountId: 'conta-c', value: null })
    for (const conta of ['conta-b', 'conta-c']) {
      assert.equal(env.terminalDefaults.resolve(conta).fastModeRequested, false)
      assert.equal(ler(env.statusline.sessionLaunch({ accountId: conta, fastModeConfirmed: true })).fastMode, conta === 'conta-b' ? false : undefined)
    }
    assert.equal(describeOptions().find((opcao) => opcao.key === 'fastMode').warning.includes('crédito de uso pago'), true)
  } finally {
    env.limpar()
  }
})

test('Claude in Chrome nasce ligado; a conta desliga e limpar o global volta a ligado', () => {
  const env = createEnvironment()
  try {
    assert.deepEqual(env.statusline.sessionLaunch({ accountId: null }).args, ['--chrome'])
    env.terminalDefaults.set({ key: 'claudeInChromeDefaultEnabled', accountId: 'conta-b', value: false })
    assert.deepEqual(env.statusline.sessionLaunch({ accountId: 'conta-b' }).args, ['--no-chrome'])
    env.terminalDefaults.set({ key: 'claudeInChromeDefaultEnabled', accountId: 'conta-c', value: null })
    assert.deepEqual(env.statusline.sessionLaunch({ accountId: 'conta-c' }).args, [])
    env.terminalDefaults.set({ key: 'claudeInChromeDefaultEnabled', value: false })
    assert.deepEqual(env.statusline.sessionLaunch({ accountId: null }).args, ['--no-chrome'])
    env.terminalDefaults.set({ key: 'claudeInChromeDefaultEnabled', clear: true })
    assert.deepEqual(env.statusline.sessionLaunch({ accountId: null }).args, ['--chrome'])
  } finally {
    env.limpar()
  }
})

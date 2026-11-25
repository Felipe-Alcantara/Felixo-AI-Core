'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const {
  classifyExecutable,
  discoverExternalInstalls,
  findExternalExecutables,
  readClaudeUpdateLock,
  updateExternalInstall,
} = require('./external-cli-update.cjs')
const { createFakeExternalClis, tempDir } = require('../__fixtures__/fake-external-clis.cjs')

const CLAUDE = { id: 'claude', command: 'claude', windowsAliases: [] }
const PACKAGE = '@anthropic-ai/claude-code'

/** O ambiente da máquina, com o PATH trocado pelas pastas falsas. */
function envWith(...dirs) {
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    // A máquina que roda a suíte pode ter a atualização do Claude desligada: não vaza para o teste.
    if (key.toLowerCase() === 'path' || /^(?:DISABLE_UPDATES|DISABLE_AUTOUPDATER|CLAUDE_CONFIG_DIR)$/.test(key)) delete env[key]
  }
  return { ...env, PATH: [...dirs, ...(process.platform === 'win32' ? [] : ['/usr/bin', '/bin'])].join(path.delimiter) }
}

async function withDir(fn) {
  const dir = tempDir()
  try {
    return await fn(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

/** Uma instalação do Claude falsa, descoberta como o app descobre. */
async function install(dir, { claudeDir, ...options }) {
  const fake = createFakeExternalClis({ dir, claudeDir, ...options })
  const env = envWith(fake.binDir, fake.toolsDir)
  const [found] = await discoverExternalInstalls({ cli: CLAUDE, env, homeDir: dir })
  return { fake, env, found }
}

const realCalls = (fake) => fake.calls().filter((call) => !call.endsWith('--version'))

test('a origem vem só do caminho: nativo, Homebrew, pnpm e Volta; npm e o resto ficam de fora', () => {
  const home = path.join(path.parse(process.cwd()).root, 'home', 'ana')
  const options = (command = 'claude') => ({ command, platformName: process.platform, homeDir: home, env: {} })
  const at = (...parts) => path.join(home, ...parts, 'claude')

  assert.equal(classifyExecutable(at('.local', 'bin'), options()).origin, 'native')
  assert.equal(classifyExecutable(at('.local', 'bin'), options('codex')), null, 'o nativo só existe para o Claude')
  assert.equal(classifyExecutable(at('.volta', 'bin'), options()).origin, 'volta')
  assert.equal(classifyExecutable(at('.local', 'share', 'pnpm'), options()).origin, 'pnpm')
  assert.equal(classifyExecutable(at('AppData', 'Roaming', 'npm'), options()), null)
  assert.equal(classifyExecutable(at('AppData', 'Roaming', 'felixo-ai-core', 'clis'), options()), null)
  const cask = classifyExecutable(path.join(home, 'brew', 'bin', 'claude'), {
    ...options(),
    realPath: path.join(home, 'brew', 'Caskroom', 'claude-code@latest', '2.1.0', 'claude'),
  })
  assert.deepEqual(cask, { origin: 'homebrew', cask: 'claude-code@latest' })
})

test('acha só as instalações de gerenciador, na ordem do PATH', () =>
  withDir(async (dir) => {
    const home = path.join(dir, 'home')
    const native = createFakeExternalClis({ dir: path.join(dir, 'a'), version: '1.0.0', claudeDir: path.join(home, '.local', 'bin') })
    const volta = createFakeExternalClis({ dir: path.join(dir, 'b'), version: '1.0.0', claudeDir: path.join(home, '.volta', 'bin') })
    const npm = createFakeExternalClis({ dir: path.join(dir, 'c'), version: '1.0.0', claudeDir: path.join(dir, 'npm') })

    const found = findExternalExecutables({
      command: 'claude',
      env: envWith(npm.binDir, volta.binDir, native.binDir),
      homeDir: home,
    })

    assert.deepEqual(found.map((item) => item.origin), ['volta', 'native'])
  }))

test('quem desligou a atualização do Claude é reconhecido pelo ambiente e pelo settings', () =>
  withDir((dir) => {
    const settings = (content, file = 'settings.json') => {
      fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
      fs.writeFileSync(path.join(dir, '.claude', file), JSON.stringify(content))
    }
    const read = (env = {}) => readClaudeUpdateLock({ env, homeDir: dir })

    assert.equal(read(), null)
    settings({ autoUpdatesChannel: 'stable' })
    assert.equal(read(), null, 'o canal escolhido não é trava')
    assert.match(read({ DISABLE_UPDATES: '1' }), /DISABLE_UPDATES/)
    assert.equal(read({ DISABLE_UPDATES: '0' }), null)
    settings({ env: { DISABLE_AUTOUPDATER: '1' } })
    assert.match(read(), /DISABLE_AUTOUPDATER esta ligado em settings\.json/)
    settings({ minimumVersion: '2.1.0' }, 'settings.local.json')
    settings({})
    assert.match(read(), /minimumVersion \(2\.1\.0\) esta definido em settings\.local\.json/)
  }))

test('descobre a versão e a trava, sem executar nada além de --version', () =>
  withDir(async (dir) => {
    fs.mkdirSync(path.join(dir, '.claude'))
    fs.writeFileSync(path.join(dir, '.claude', 'settings.json'), JSON.stringify({ env: { DISABLE_UPDATES: '1' } }))
    const { fake, found } = await install(dir, { version: '2.1.5', claudeDir: path.join(dir, '.local', 'bin') })

    assert.equal(found.origin, 'native')
    assert.equal(found.version, '2.1.5')
    assert.match(found.locked, /DISABLE_UPDATES/)
    assert.deepEqual(fake.calls(), ['claude --version'])
  }))

test('nativo: a atualização estável usa o claude update e confere a versão no disco', () =>
  withDir(async (dir) => {
    const { fake, env, found } = await install(dir, {
      version: '2.1.5',
      channelVersion: '2.1.9',
      claudeDir: path.join(dir, '.local', 'bin'),
    })
    const result = await updateExternalInstall({ install: found, npmPackage: PACKAGE, to: '2.1.9', env, homeDir: dir })

    assert.equal(result.ok, true)
    assert.equal(result.version, '2.1.9')
    assert.equal(result.note, undefined)
    assert.deepEqual(realCalls(fake), ['claude update'])
  }))

test('nativo: o pré-lançamento é forçado com claude install quando o canal nativo tem a versão', () =>
  withDir(async (dir) => {
    const { fake, env, found } = await install(dir, {
      version: '2.1.5',
      channelVersion: '2.1.9',
      installable: ['2.2.0-next.1'],
      claudeDir: path.join(dir, '.local', 'bin'),
    })
    const result = await updateExternalInstall({ install: found, npmPackage: PACKAGE, to: '2.2.0-next.1', env, homeDir: dir })

    assert.equal(result.ok, true)
    assert.equal(result.version, '2.2.0-next.1')
    assert.deepEqual(realCalls(fake), ['claude install 2.2.0-next.1'])
  }))

test('nativo: sem o pré-lançamento no canal nativo, cai no claude update e diz isso', () =>
  withDir(async (dir) => {
    const { fake, env, found } = await install(dir, {
      version: '2.1.5',
      channelVersion: '2.1.9',
      claudeDir: path.join(dir, '.local', 'bin'),
    })
    const result = await updateExternalInstall({ install: found, npmPackage: PACKAGE, to: '2.2.0-next.1', env, homeDir: dir })

    assert.equal(result.ok, true)
    assert.equal(result.version, '2.1.9')
    assert.match(result.note, /canal nativo nao tem a 2\.2\.0-next\.1/)
    assert.deepEqual(realCalls(fake), ['claude install 2.2.0-next.1', 'claude update'])
  }))

test('nativo: o claude update que não troca a versão é falha, não sucesso', () =>
  withDir(async (dir) => {
    const { env, found } = await install(dir, { version: '2.1.5', claudeDir: path.join(dir, '.local', 'bin') })
    const result = await updateExternalInstall({ install: found, npmPackage: PACKAGE, to: '2.1.9', env, homeDir: dir })

    assert.equal(result.ok, false)
    assert.equal(result.version, '2.1.5')
    assert.match(result.message, /nao trouxe versao nova/)
  }))

test('Homebrew: usa o cask instalado e aceita o canal dele abaixo do alvo, dizendo isso', () =>
  withDir(async (dir) => {
    const { fake, env, found } = await install(dir, {
      version: '2.1.0',
      channelVersion: '2.1.4',
      tools: ['brew'],
      claudeDir: path.join(dir, 'Caskroom', 'claude-code@latest', '2.1.0'),
    })
    assert.equal(found.origin, 'homebrew')
    const result = await updateExternalInstall({ install: found, npmPackage: PACKAGE, to: '2.2.0-next.1', env, homeDir: dir })

    assert.equal(result.ok, true)
    assert.equal(result.version, '2.1.4')
    assert.match(result.note, /canal do Homebrew esta na 2\.1\.4/)
    assert.deepEqual(realCalls(fake), ['brew upgrade --cask claude-code@latest'])
  }))

test('pnpm e Volta instalam a versão exata do pacote e conferem no executável', () =>
  withDir(async (dir) => {
    const cases = [
      ['pnpm', path.join('pnpm'), `pnpm add --global ${PACKAGE}@2.2.0-next.1`],
      ['volta', path.join('.volta', 'bin'), `volta install ${PACKAGE}@2.2.0-next.1`],
    ]
    for (const [origin, folder, command] of cases) {
      const base = path.join(dir, origin)
      const { fake, env, found } = await install(base, { version: '2.1.0', tools: [origin], claudeDir: path.join(base, folder) })
      assert.equal(found.origin, origin)
      const result = await updateExternalInstall({ install: found, npmPackage: PACKAGE, to: '2.2.0-next.1', env, homeDir: base })

      assert.equal(result.ok, true, result.message)
      assert.equal(result.version, '2.2.0-next.1')
      assert.deepEqual(realCalls(fake), [command])
    }
  }))

test('gerenciador que terminou sem trocar a versão no disco é falha', () =>
  withDir(async (dir) => {
    const { fake, found } = await install(dir, { version: '2.1.0', tools: ['pnpm'], claudeDir: path.join(dir, 'pnpm') })
    // Sem o `pnpm` no PATH o comando nem sai; com ele o executável não mudaria. Aqui o
    // gerenciador falso some do PATH e o executável fica na versão antiga.
    const result = await updateExternalInstall({
      install: found,
      npmPackage: PACKAGE,
      to: '2.2.0',
      env: envWith(fake.binDir),
      homeDir: dir,
    })

    assert.equal(result.ok, false)
    assert.equal(result.version, '2.1.0')
  }))

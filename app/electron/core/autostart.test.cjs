'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const {
  buildDesktopFileContent,
  getAutoStartStatus,
  getLinuxAutostartDesktopPath,
  setAutoStartEnabled,
} = require('./autostart.cjs')

/** Fake filesystem em memória, isolado por teste. */
function fakeFileSystem() {
  const files = new Map()
  return {
    files,
    mkdirSync: () => {},
    writeFileSync: (filePath, content) => files.set(filePath, content),
    accessSync: (filePath) => {
      if (!files.has(filePath)) {
        const error = new Error('ENOENT')
        error.code = 'ENOENT'
        throw error
      }
    },
    rmSync: (filePath) => {
      files.delete(filePath)
    },
  }
}

test('getAutoStartStatus: Windows/macOS refletem o que a API do Electron devolve', () => {
  const win32Ligado = getAutoStartStatus({ platformName: 'win32', getLoginItemSettings: () => ({ openAtLogin: true }) })
  assert.deepEqual(win32Ligado, { supported: true, enabled: true })

  const darwinDesligado = getAutoStartStatus({ platformName: 'darwin', getLoginItemSettings: () => ({ openAtLogin: false }) })
  assert.deepEqual(darwinDesligado, { supported: true, enabled: false })
})

test('getAutoStartStatus: sem getLoginItemSettings injetada, devolve suportado mas desligado (não quebra)', () => {
  const resultado = getAutoStartStatus({ platformName: 'win32' })
  assert.deepEqual(resultado, { supported: true, enabled: false })
})

test('setAutoStartEnabled: Windows/macOS chamam a API real com o valor certo', () => {
  const chamadas = []
  const resultadoLigar = setAutoStartEnabled({
    enabled: true,
    platformName: 'win32',
    setLoginItemSettings: (settings) => chamadas.push(settings),
  })
  assert.deepEqual(resultadoLigar, { ok: true, supported: true, enabled: true })
  assert.deepEqual(chamadas, [{ openAtLogin: true }])

  const resultadoDesligar = setAutoStartEnabled({
    enabled: false,
    platformName: 'darwin',
    setLoginItemSettings: (settings) => chamadas.push(settings),
  })
  assert.deepEqual(resultadoDesligar, { ok: true, supported: true, enabled: false })
  assert.deepEqual(chamadas[1], { openAtLogin: false })
})

test('setAutoStartEnabled: erro da API do Electron não derruba o app, devolve mensagem', () => {
  const resultado = setAutoStartEnabled({
    enabled: true,
    platformName: 'win32',
    setLoginItemSettings: () => {
      throw new Error('permissão negada pelo SO')
    },
  })
  assert.equal(resultado.ok, false)
  assert.equal(resultado.supported, true)
  assert.match(resultado.message, /permissão negada/)
})

test('setAutoStartEnabled: sem setLoginItemSettings injetada, devolve erro claro em vez de lançar', () => {
  const resultado = setAutoStartEnabled({ enabled: true, platformName: 'win32' })
  assert.equal(resultado.ok, false)
  assert.equal(resultado.supported, true)
})

test('plataforma desconhecida (nem darwin/win32/linux): não suportado, sem quebrar', () => {
  assert.deepEqual(getAutoStartStatus({ platformName: 'freebsd' }), { supported: false, enabled: false })
  const resultado = setAutoStartEnabled({ enabled: true, platformName: 'freebsd' })
  assert.equal(resultado.ok, false)
  assert.equal(resultado.supported, false)
})

test('getLinuxAutostartDesktopPath respeita XDG_CONFIG_HOME, cai pra ~/.config sem ele', () => {
  const comXdg = getLinuxAutostartDesktopPath({ homeDir: '/home/pessoa', environment: { XDG_CONFIG_HOME: '/dados/config' } })
  assert.equal(comXdg, '/dados/config/autostart/felixo-ai-core.desktop')

  const semXdg = getLinuxAutostartDesktopPath({ homeDir: '/home/pessoa', environment: {} })
  assert.equal(semXdg, '/home/pessoa/.config/autostart/felixo-ai-core.desktop')
})

test('buildDesktopFileContent gera um Desktop Entry válido, com o Exec entre aspas', () => {
  const conteudo = buildDesktopFileContent('/opt/Felixo AI Core/felixo-ai-core')
  assert.match(conteudo, /^\[Desktop Entry\]/)
  assert.match(conteudo, /Type=Application/)
  assert.match(conteudo, /Name=Felixo AI Core/)
  assert.match(conteudo, /Exec="\/opt\/Felixo AI Core\/felixo-ai-core"/)
  assert.match(conteudo, /Terminal=false/)
})

test('Linux: getAutoStartStatus lê se o .desktop existe, sem tocar na API do Electron', () => {
  const fileSystem = fakeFileSystem()
  const desligado = getAutoStartStatus({ platformName: 'linux', homeDir: '/home/pessoa', environment: {}, fileSystem })
  assert.deepEqual(desligado, { supported: true, enabled: false })

  fileSystem.files.set('/home/pessoa/.config/autostart/felixo-ai-core.desktop', 'conteudo qualquer')
  const ligado = getAutoStartStatus({ platformName: 'linux', homeDir: '/home/pessoa', environment: {}, fileSystem })
  assert.deepEqual(ligado, { supported: true, enabled: true })
})

test('Linux: setAutoStartEnabled(true) escreve o .desktop com o Exec certo; (false) apaga', () => {
  const fileSystem = fakeFileSystem()

  const ligar = setAutoStartEnabled({
    enabled: true,
    platformName: 'linux',
    execPath: '/opt/Felixo AI Core/felixo-ai-core',
    homeDir: '/home/pessoa',
    environment: {},
    fileSystem,
  })
  assert.deepEqual(ligar, { ok: true, supported: true, enabled: true })
  const caminho = '/home/pessoa/.config/autostart/felixo-ai-core.desktop'
  assert.equal(fileSystem.files.has(caminho), true)
  assert.match(fileSystem.files.get(caminho), /Exec="\/opt\/Felixo AI Core\/felixo-ai-core"/)

  const desligar = setAutoStartEnabled({
    enabled: false,
    platformName: 'linux',
    homeDir: '/home/pessoa',
    environment: {},
    fileSystem,
  })
  assert.deepEqual(desligar, { ok: true, supported: true, enabled: false })
  assert.equal(fileSystem.files.has(caminho), false)
})

test('Linux: ligar sem execPath recusa com mensagem clara, não escreve arquivo nenhum', () => {
  const fileSystem = fakeFileSystem()
  const resultado = setAutoStartEnabled({
    enabled: true,
    platformName: 'linux',
    homeDir: '/home/pessoa',
    environment: {},
    fileSystem,
  })
  assert.equal(resultado.ok, false)
  assert.equal(resultado.supported, true)
  assert.equal(fileSystem.files.size, 0)
})

test('Linux: erro de I/O (ex.: permissão) não derruba o app, devolve mensagem', () => {
  const fileSystem = fakeFileSystem()
  fileSystem.writeFileSync = () => {
    throw new Error('EACCES: permissão negada')
  }
  const resultado = setAutoStartEnabled({
    enabled: true,
    platformName: 'linux',
    execPath: '/opt/felixo-ai-core',
    homeDir: '/home/pessoa',
    environment: {},
    fileSystem,
  })
  assert.equal(resultado.ok, false)
  assert.match(resultado.message, /EACCES/)
})

'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { resolveNativeClaude } = require('./cloud-session-executable.cjs')

const NPM = 'C:\\Users\\Pessoa Teste\\AppData\\Roaming\\npm'
const EXE = `${NPM}\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe`
// Conteúdo real do shim que o npm gera no Windows.
const SHIM = [
  '@ECHO off',
  'GOTO start',
  ':find_dp0',
  'SET dp0=%~dp0',
  'EXIT /b',
  ':start',
  'SETLOCAL',
  'CALL :find_dp0',
  '"%dp0%\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe"   %*',
  '',
].join('\r\n')

/** `fs` falso com um mapa caminho → conteúdo. */
function fakeFs(files) {
  return {
    existsSync: (target) => Object.hasOwn(files, target),
    readFileSync: (target) => {
      if (!Object.hasOwn(files, target)) throw new Error('ENOENT')
      return files[target]
    },
  }
}

test('no Windows, o shim claude.cmd do npm resolve para o claude.exe nativo, sem shell', () => {
  const fsApi = fakeFs({ [`${NPM}\\claude.cmd`]: SHIM, [EXE]: '' })

  const result = resolveNativeClaude({ platformName: 'win32', env: { Path: `C:\\Windows;${NPM}` }, fsApi })

  assert.deepEqual(result, { command: EXE, viaShell: false })
})

test('no Windows, claude.exe direto no PATH vale como está', () => {
  const direto = 'C:\\Ferramentas\\claude.exe'
  const fsApi = fakeFs({ [direto]: '' })

  const result = resolveNativeClaude({ platformName: 'win32', env: { PATH: 'C:\\Ferramentas' }, fsApi })

  assert.deepEqual(result, { command: direto, viaShell: false })
})

test('no Windows, shim sem o exe por trás cai no shell', () => {
  const fsApi = fakeFs({ [`${NPM}\\claude.cmd`]: SHIM })

  const result = resolveNativeClaude({ platformName: 'win32', env: { Path: NPM }, fsApi })

  assert.deepEqual(result, { command: 'claude', viaShell: true })
})

test('no Windows, shim de formato desconhecido cai no shell', () => {
  const fsApi = fakeFs({ [`${NPM}\\claude.cmd`]: '@echo off\r\nnode algo.js %*\r\n' })

  const result = resolveNativeClaude({ platformName: 'win32', env: { Path: NPM }, fsApi })

  assert.deepEqual(result, { command: 'claude', viaShell: true })
})

test('no Windows, sem claude no PATH cai no shell', () => {
  const result = resolveNativeClaude({ platformName: 'win32', env: { Path: 'C:\\Windows' }, fsApi: fakeFs({}) })

  assert.deepEqual(result, { command: 'claude', viaShell: true })
})

test('no Linux e no macOS devolve o comando claude, sem shell próprio', () => {
  for (const platformName of ['linux', 'darwin']) {
    const result = resolveNativeClaude({ platformName, env: { PATH: '/usr/bin' }, fsApi: fakeFs({}) })

    assert.deepEqual(result, { command: 'claude', viaShell: false })
  }
})

test('no Windows, um shim sem o exe por trás não impede de achar o claude.exe mais adiante no PATH', () => {
  const quebrado = 'C:\\Velho\\npm'
  const bom = 'C:\\Novo\\bin'
  const exe = `${bom}\\claude.exe`
  const fsApi = fakeFs({ [`${quebrado}\\claude.cmd`]: SHIM, [exe]: '' })

  const result = resolveNativeClaude({ platformName: 'win32', env: { Path: `${quebrado};${bom}` }, fsApi })

  assert.deepEqual(result, { command: exe, viaShell: false })
})

test('no Windows, só shims sem exe por trás caem no shell depois de olhar o PATH inteiro', () => {
  const a = 'C:\\A\\npm'
  const b = 'C:\\B\\npm'
  const fsApi = fakeFs({ [`${a}\\claude.cmd`]: SHIM, [`${b}\\claude.cmd`]: SHIM })

  const result = resolveNativeClaude({ platformName: 'win32', env: { Path: `${a};${b}` }, fsApi })

  assert.deepEqual(result, { command: 'claude', viaShell: true })
})

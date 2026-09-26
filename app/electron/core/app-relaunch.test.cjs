'use strict'

const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const test = require('node:test')

const { relaunchApp, resolveRunningAppImage } = require('./app-relaunch.cjs')

// Formato medido em 26/09/2026 num AppImage do electron-builder 26.15.3.
const MOUNT = '/tmp/.mount_FelixoAbc123'
const APPIMAGE_ENV = Object.freeze({
  APPIMAGE: '/home/pessoa/Aplicativos/Felixo-AI-Core-x64.AppImage',
  APPDIR: MOUNT,
  FELIXO_GPU_ENV_SANITIZED: '1',
})
const APPIMAGE_ARGV = Object.freeze([`${MOUNT}/felixo-ai-core`, '--no-sandbox', '/home/pessoa/projeto.fxai'])

function fakeApp({ isPackaged = true, relaunchResult = true } = {}) {
  const calls = []
  return {
    calls,
    isPackaged,
    relaunch: (...args) => {
      calls.push(args)
      return relaunchResult
    },
  }
}

function fakeSpawn(behavior = {}) {
  const calls = []
  const spawnProcess = (command, args, options) => {
    if (behavior.throwError) throw behavior.throwError
    const child = new EventEmitter()
    // O Node deixa `pid` undefined quando o filho não nasce.
    child.pid = 'pid' in behavior ? behavior.pid : 4242
    child.unrefCalled = false
    child.unref = () => {
      child.unrefCalled = true
    }
    calls.push({ command, args, options, child })
    return child
  }
  return { calls, spawnProcess }
}

test('no AppImage reabre o próprio .AppImage, destacado, com os mesmos argumentos e o ambiente limpo', () => {
  const app = fakeApp()
  const { calls, spawnProcess } = fakeSpawn()
  const environment = { ...APPIMAGE_ENV }

  const result = relaunchApp({
    app,
    environment,
    argv: [...APPIMAGE_ARGV],
    execPath: APPIMAGE_ARGV[0],
    platformName: 'linux',
    spawnProcess,
  })

  assert.deepEqual(result, { ok: true, method: 'appimage', detail: null })
  assert.equal(app.calls.length, 0, 'app.relaunch() não traz o app de volta no AppImage')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].command, APPIMAGE_ENV.APPIMAGE)
  assert.deepEqual(calls[0].args, ['--no-sandbox', '/home/pessoa/projeto.fxai'])
  assert.equal(calls[0].options.detached, true)
  assert.equal(calls[0].options.stdio, 'ignore')
  assert.equal(calls[0].options.env, environment)
  assert.equal(calls[0].child.unrefCalled, true)
  // Um erro tardio do filho não pode derrubar este processo.
  assert.equal(calls[0].child.listenerCount('error'), 1)
})

test('.AppImage que não abre (sem pid ou exceção) é relançamento falho, sem cair para o app.relaunch()', () => {
  const app = fakeApp()
  const options = {
    app,
    environment: { ...APPIMAGE_ENV },
    argv: [...APPIMAGE_ARGV],
    execPath: APPIMAGE_ARGV[0],
    platformName: 'linux',
  }

  const withoutPid = relaunchApp({ ...options, spawnProcess: fakeSpawn({ pid: undefined }).spawnProcess })
  assert.equal(withoutPid.ok, false)
  assert.equal(withoutPid.method, 'appimage')
  assert.match(withoutPid.detail, /Felixo-AI-Core-x64\.AppImage não abriu/)

  const thrown = relaunchApp({ ...options, spawnProcess: fakeSpawn({ throwError: new Error('EACCES') }).spawnProcess })
  assert.deepEqual(thrown, { ok: false, method: 'appimage', detail: 'EACCES' })
  assert.equal(app.calls.length, 0)
})

test('fora do AppImage usa o app.relaunch(); false ou exceção viram falha', () => {
  const unpacked = { environment: {}, argv: ['/opt/Felixo AI Core/felixo-ai-core'], execPath: '/opt/Felixo AI Core/felixo-ai-core', platformName: 'linux' }
  const { calls, spawnProcess } = fakeSpawn()

  const app = fakeApp()
  assert.deepEqual(relaunchApp({ app, ...unpacked, spawnProcess }), { ok: true, method: 'app-relaunch', detail: null })
  assert.equal(app.calls.length, 1)
  assert.equal(calls.length, 0)

  // A tipagem diz void: undefined é sucesso.
  assert.equal(relaunchApp({ app: fakeApp({ relaunchResult: undefined }), ...unpacked, spawnProcess }).ok, true)
  assert.equal(relaunchApp({ app: fakeApp({ relaunchResult: false }), ...unpacked, spawnProcess }).ok, false)

  const throwing = { isPackaged: true, relaunch: () => { throw new Error('boom') } }
  assert.deepEqual(relaunchApp({ app: throwing, ...unpacked, spawnProcess }), { ok: false, method: 'app-relaunch', detail: 'boom' })
})

test('só é AppImage o executável que roda dentro do APPDIR, empacotado e no Linux', () => {
  const base = { environment: { ...APPIMAGE_ENV }, execPath: APPIMAGE_ARGV[0], platformName: 'linux', isPackaged: true }
  assert.equal(resolveRunningAppImage(base), APPIMAGE_ENV.APPIMAGE)

  // APPIMAGE herdado de outro programa (ex.: um editor em AppImage): o app instalado pelo .deb não é ele.
  assert.equal(resolveRunningAppImage({ ...base, execPath: '/opt/Felixo AI Core/felixo-ai-core' }), null)
  assert.equal(resolveRunningAppImage({ ...base, execPath: '/tmp/.mount_FelixoAbc1234/felixo-ai-core' }), null)
  assert.equal(resolveRunningAppImage({ ...base, isPackaged: false }), null)
  assert.equal(resolveRunningAppImage({ ...base, platformName: 'win32' }), null)
  assert.equal(resolveRunningAppImage({ ...base, environment: { APPDIR: MOUNT } }), null)
  assert.equal(resolveRunningAppImage({ ...base, environment: { ...APPIMAGE_ENV, APPIMAGE: 'relativo.AppImage' } }), null)
  assert.equal(resolveRunningAppImage({ ...base, environment: { APPIMAGE: APPIMAGE_ENV.APPIMAGE } }), null)
})

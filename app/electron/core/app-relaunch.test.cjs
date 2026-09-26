'use strict'

const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { relaunchApp, resolveRunningAppImage } = require('./app-relaunch.cjs')

// A montagem de AppImage destes testes usa caminhos, links e o separador de PATH
// do POSIX; o AppImage só existe no Linux (no macOS eles também valem).
const SO_EM_POSIX = process.platform === 'win32' && 'montagem de AppImage com caminhos POSIX'

/**
 * Um AppImage montado de verdade no disco: a montagem `.mount_*` dentro de um
 * TMPDIR real, o executável dentro dela, o `.AppImage` fora e um TMPDIR que é
 * link simbólico para o real (como `/home` → `/var/home` no Silverblue).
 * Formato medido em 26/09/2026 num AppImage do electron-builder 26.15.3.
 */
function appImageFixture() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-relaunch-')))
  const realTmp = path.join(root, 'realtmp')
  const linkTmp = path.join(root, 'linktmp')
  const mount = path.join(realTmp, '.mount_FelixoAbc123')
  const extracted = path.join(realTmp, 'appimage_extracted_0123456789abcdef')
  const appImage = path.join(root, 'Aplicativos', 'Felixo-AI-Core-x64.AppImage')
  for (const directory of [mount, extracted, path.dirname(appImage)]) fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(path.join(mount, 'felixo-ai-core'), '')
  fs.writeFileSync(path.join(extracted, 'felixo-ai-core'), '')
  fs.writeFileSync(appImage, '')
  fs.symlinkSync(realTmp, linkTmp)
  return { root, realTmp, linkTmp, mount, extracted, appImage, execPath: path.join(mount, 'felixo-ai-core') }
}

const fixture = appImageFixture()
test.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }))

/** O ambiente que o `AppRun` do electron-builder exporta para o app (prefixos antes do que já existia). */
function appRunEnvironment(appDir, extra = {}) {
  return {
    APPIMAGE: fixture.appImage,
    APPDIR: appDir,
    PATH: `${appDir}:${appDir}/usr/sbin:/usr/local/bin:/usr/bin`,
    LD_LIBRARY_PATH: `${appDir}/usr/lib`,
    XDG_DATA_DIRS: `${appDir}/usr/share/:/usr/share/gnome:/usr/local/share/:/usr/share/`,
    GSETTINGS_SCHEMA_DIR: `${appDir}/usr/share/glib-2.0/schemas`,
    HOME: '/home/pessoa',
    FELIXO_GPU_ENV_SANITIZED: '1',
    ...extra,
  }
}

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

function relaunchFromAppImage({ environment, execPath = fixture.execPath, spawn = fakeSpawn(), app = fakeApp() }) {
  const argv = [execPath, '--no-sandbox', '/home/pessoa/projeto.fxai']
  const result = relaunchApp({ app, environment, argv, execPath, platformName: 'linux', spawnProcess: spawn.spawnProcess })
  return { app, result, calls: spawn.calls }
}

test('no AppImage reabre o próprio .AppImage, destacado, com os mesmos argumentos', () => {
  const environment = appRunEnvironment(fixture.mount)
  const { app, result, calls } = relaunchFromAppImage({ environment })

  // O pid do .AppImage reaberto: ele vira o processo do app relançado.
  assert.deepEqual(result, { ok: true, method: 'appimage', detail: null, pid: 4242 })
  assert.equal(app.calls.length, 0, 'app.relaunch() não traz o app de volta no AppImage')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].command, fixture.appImage)
  assert.deepEqual(calls[0].args, ['--no-sandbox', '/home/pessoa/projeto.fxai'])
  assert.equal(calls[0].options.detached, true)
  assert.equal(calls[0].options.stdio, 'ignore')
  assert.equal(calls[0].child.unrefCalled, true)
  // Um erro tardio do filho não pode derrubar este processo.
  assert.equal(calls[0].child.listenerCount('error'), 1)
})

test('o relançado não herda os caminhos da montagem antiga, e o resto do ambiente chega igual', { skip: SO_EM_POSIX }, () => {
  // Medido em 26/09/2026: sem isso o PATH do relançado ficava com a montagem
  // nova, depois a antiga, e só então /usr/bin; e cada variável acumulava.
  const environment = appRunEnvironment(fixture.mount)
  const before = { ...environment }
  const { calls } = relaunchFromAppImage({ environment })

  assert.deepEqual(calls[0].options.env, {
    APPIMAGE: fixture.appImage,
    APPDIR: fixture.mount,
    PATH: '/usr/local/bin:/usr/bin',
    XDG_DATA_DIRS: '/usr/share/gnome:/usr/local/share/:/usr/share/',
    HOME: '/home/pessoa',
    FELIXO_GPU_ENV_SANITIZED: '1',
  })
  // O ambiente deste processo (os terminais dele) não muda.
  assert.deepEqual(environment, before)
})

test('TMPDIR por link simbólico (ex.: Silverblue) ainda é reconhecido como AppImage', { skip: SO_EM_POSIX }, () => {
  // O runtime exporta o APPDIR pelo caminho do link; o execPath vem resolvido.
  const linkedMount = path.join(fixture.linkTmp, '.mount_FelixoAbc123')
  const environment = appRunEnvironment(linkedMount)
  const { app, result, calls } = relaunchFromAppImage({ environment })

  assert.equal(result.method, 'appimage')
  assert.equal(app.calls.length, 0)
  assert.equal(calls[0].options.env.PATH, '/usr/local/bin:/usr/bin')
  assert.equal('LD_LIBRARY_PATH' in calls[0].options.env, false)
})

test('com o AppImage extraído (--appimage-extract-and-run) o relançado também extrai, sem FUSE', { skip: SO_EM_POSIX }, () => {
  // O runtime consome a flag e não a repassa: sem a variável o relançado
  // tentaria montar por FUSE, que é justamente o que falta nessa máquina.
  const environment = appRunEnvironment(fixture.extracted)
  const { result, calls } = relaunchFromAppImage({ environment, execPath: path.join(fixture.extracted, 'felixo-ai-core') })
  assert.equal(result.ok, true)
  assert.equal(calls[0].options.env.APPIMAGE_EXTRACT_AND_RUN, '1')
  assert.equal(calls[0].options.env.PATH, '/usr/local/bin:/usr/bin')

  // Montado por FUSE, a variável não é posta.
  const mounted = relaunchFromAppImage({ environment: appRunEnvironment(fixture.mount) })
  assert.equal('APPIMAGE_EXTRACT_AND_RUN' in mounted.calls[0].options.env, false)
})

test('.AppImage que não abre (sem pid ou exceção) é relançamento falho, sem cair para o app.relaunch()', () => {
  const environment = appRunEnvironment(fixture.mount)
  const withoutPid = relaunchFromAppImage({ environment, spawn: fakeSpawn({ pid: undefined }) })
  assert.equal(withoutPid.result.ok, false)
  assert.equal(withoutPid.result.method, 'appimage')
  assert.match(withoutPid.result.detail, /Felixo-AI-Core-x64\.AppImage não abriu/)

  const thrown = relaunchFromAppImage({ environment, spawn: fakeSpawn({ throwError: new Error('EACCES') }) })
  assert.deepEqual(thrown.result, { ok: false, method: 'appimage', detail: 'EACCES', pid: null })
  assert.equal(thrown.app.calls.length, 0)
})

test('fora do AppImage usa o app.relaunch(); false ou exceção viram falha', () => {
  const unpacked = { environment: {}, argv: ['/opt/Felixo AI Core/felixo-ai-core'], execPath: '/opt/Felixo AI Core/felixo-ai-core', platformName: 'linux' }
  const { calls, spawnProcess } = fakeSpawn()

  const app = fakeApp()
  // O relauncher do Electron não expõe o pid do processo novo.
  assert.deepEqual(relaunchApp({ app, ...unpacked, spawnProcess }), { ok: true, method: 'app-relaunch', detail: null, pid: null })
  assert.equal(app.calls.length, 1)
  assert.equal(calls.length, 0)

  // A tipagem diz void: undefined é sucesso.
  assert.equal(relaunchApp({ app: fakeApp({ relaunchResult: undefined }), ...unpacked, spawnProcess }).ok, true)
  assert.equal(relaunchApp({ app: fakeApp({ relaunchResult: false }), ...unpacked, spawnProcess }).ok, false)

  const throwing = { isPackaged: true, relaunch: () => { throw new Error('boom') } }
  assert.deepEqual(relaunchApp({ app: throwing, ...unpacked, spawnProcess }), { ok: false, method: 'app-relaunch', detail: 'boom', pid: null })
})

test('só é AppImage o executável que roda dentro do APPDIR, empacotado e no Linux', () => {
  const base = { environment: appRunEnvironment(fixture.mount), execPath: fixture.execPath, platformName: 'linux', isPackaged: true }
  assert.equal(resolveRunningAppImage(base), fixture.appImage)

  // APPIMAGE herdado de outro programa (ex.: um editor em AppImage): o app instalado pelo .deb não é ele.
  assert.equal(resolveRunningAppImage({ ...base, execPath: '/opt/Felixo AI Core/felixo-ai-core' }), null)
  // Uma montagem vizinha com o mesmo prefixo no nome não é esta.
  const sibling = `${fixture.mount}4`
  fs.mkdirSync(sibling, { recursive: true })
  fs.writeFileSync(path.join(sibling, 'felixo-ai-core'), '')
  assert.equal(resolveRunningAppImage({ ...base, execPath: path.join(sibling, 'felixo-ai-core') }), null)
  assert.equal(resolveRunningAppImage({ ...base, isPackaged: false }), null)
  assert.equal(resolveRunningAppImage({ ...base, platformName: 'win32' }), null)
  assert.equal(resolveRunningAppImage({ ...base, environment: { APPDIR: fixture.mount } }), null)
  assert.equal(resolveRunningAppImage({ ...base, environment: { APPIMAGE: fixture.appImage } }), null)
})

test('APPDIR e APPIMAGE forjados ou quebrados não viram relançamento de um binário qualquer', { skip: SO_EM_POSIX }, () => {
  const base = { execPath: fixture.execPath, platformName: 'linux', isPackaged: true }
  const env = (overrides) => ({ environment: appRunEnvironment(fixture.mount, overrides) })

  // APPDIR raiz (ou relativo) conteria qualquer executável.
  assert.equal(resolveRunningAppImage({ ...base, ...env({ APPDIR: '/' }) }), null)
  assert.equal(resolveRunningAppImage({ ...base, ...env({ APPDIR: '.' }) }), null)
  assert.equal(resolveRunningAppImage({ ...base, ...env({ APPDIR: path.relative(process.cwd(), fixture.mount) }) }), null)
  assert.equal(resolveRunningAppImage({ ...base, ...env({ APPDIR: path.join(fixture.root, 'nao-existe') }) }), null)
  // APPIMAGE precisa ser um arquivo que existe, com caminho absoluto.
  assert.equal(resolveRunningAppImage({ ...base, ...env({ APPIMAGE: 'relativo.AppImage' }) }), null)
  assert.equal(resolveRunningAppImage({ ...base, ...env({ APPIMAGE: path.join(fixture.root, 'sumiu.AppImage') }) }), null)
  assert.equal(resolveRunningAppImage({ ...base, ...env({ APPIMAGE: fixture.realTmp }) }), null)
})

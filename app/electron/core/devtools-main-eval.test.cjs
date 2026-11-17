const test = require('node:test')
const assert = require('node:assert/strict')
const vm = require('node:vm')

const { createMainEvaluator, registerDevtoolsMainEval } = require('./devtools-main-eval.cjs')

class FakeApp {
  getName() {
    return 'Felixo'
  }
  getAppMetrics() {
    return [{ pid: 1, memory: { workingSetSize: 10 } }]
  }
  later() {
    return Promise.resolve({ ok: true })
  }
  boom() {
    throw new RangeError('falhou')
  }
  each(callback) {
    callback({ canal: 'x' })
  }
}

function setup() {
  const handlers = new Map()
  const ipc = { handle: (canal, fn) => handlers.set(canal, fn) }
  const mainWindow = { webContents: { ipc, setZoomLevel: () => 'ok' } }
  const probe = Object.freeze({ snapshot: () => ({ calls: 3 }) })
  const evaluate = createMainEvaluator({
    vm,
    getScope: () => ({ app: new FakeApp(), mainWindow, ipcProbe: probe, BrowserWindow: class {} }),
  })
  return { evaluate, handlers }
}

test('uso legítimo continua funcionando', async () => {
  const { evaluate, handlers } = setup()
  assert.equal(evaluate('app.getName()'), 'Felixo')
  assert.equal(JSON.stringify(evaluate('ipcProbe.snapshot()')), '{"calls":3}')
  assert.equal(evaluate('mainWindow.webContents.setZoomLevel(0)'), 'ok')
  assert.equal(evaluate('JSON.stringify(app.getAppMetrics())'), '[{"pid":1,"memory":{"workingSetSize":10}}]')
  assert.equal(Array.isArray(evaluate('app.getAppMetrics()')), true)
  assert.equal(JSON.stringify(await evaluate('app.later()')), '{"ok":true}')
  // Handlers IPC com callback do contexto, como o fixture do smoke do Notion.
  evaluate("mainWindow.webContents.ipc.handle('c', async (_e, input) => ({ id: input.id }))")
  assert.equal(JSON.stringify(await handlers.get('c')({}, { id: 7 })), '{"id":7}')
})

const ESCAPES = [
  "app.constructor.constructor('return process')()",
  "app.getName.constructor('return process')()",
  "Object.getPrototypeOf(app).constructor.constructor('return process')()",
  "app['constr' + 'uctor']['constr' + 'uctor']('return process')()",
  "app.__proto__.constructor",
  "Reflect.get(app, 'constructor')",
  "Object.getOwnPropertyDescriptor(app, 'constructor')",
  "Reflect.getPrototypeOf(app)",
  "ipcProbe.snapshot.constructor('return process')()",
  "mainWindow.webContents.constructor.constructor('return process')()",
  "app.getAppMetrics().constructor.constructor('return process')()",
  "app.getAppMetrics()[0].constructor.constructor('return process')()",
  "try { app.boom() } catch (e) { e.constructor.constructor('return process')() }",
  "let r; app.each((x) => { r = x.constructor.constructor('return process')() }); r",
  "mainWindow.webContents.ipc.handle('d', (e) => e.constructor.constructor('return process')())",
  "app.later().then((v) => v.constructor.constructor('return process')())",
  "(function () { return arguments.callee.caller })()",
  "(function () { return (function f() { return f.caller })() })()",
  "typeof process === 'undefined' ? undefined : process",
  "typeof require === 'undefined' ? undefined : require('fs')",
]

test('nada alcança process/require pelos construtores do host', async () => {
  const { evaluate, handlers } = setup()
  for (const expression of ESCAPES) {
    let value
    try {
      value = await evaluate(expression)
    } catch {
      value = undefined
    }
    assert.ok(value !== process && value !== Function && !value?.mainModule, expression)
  }
  // Callback registrado: o host chama com argumento cru; tentar escapar por ele falha.
  await assert.rejects(async () => handlers.get('d')({}), (error) => error.name === 'TypeError')
})

test('a expressão é validada', () => {
  const { evaluate } = setup()
  assert.throws(() => evaluate(42), /inválida/)
  assert.throws(() => evaluate('1'.repeat(20_001)), /inválida/)
})

test('o app normal (sem porta de depuração) não registra o canal', () => {
  for (const devtoolsPort of [undefined, NaN, 0, -1, '9222', null]) {
    const channels = []
    const registered = registerDevtoolsMainEval({
      ipcMain: { handle: (canal) => channels.push(canal) },
      devtoolsPort,
      vm,
      getScope: () => ({}),
    })
    assert.equal(registered, false, String(devtoolsPort))
    assert.deepEqual(channels, [])
  }
  const channels = []
  assert.equal(
    registerDevtoolsMainEval({ ipcMain: { handle: (c) => channels.push(c) }, devtoolsPort: 9222, vm, getScope: () => ({}) }),
    true,
  )
  assert.deepEqual(channels, ['devtools:main-eval'])
})

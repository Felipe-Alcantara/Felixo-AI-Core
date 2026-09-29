const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')

const { openWithXdgOpen, platformShell } = require('./linux-xdg-open.cjs')

/** `spawn` falso: grava a chamada e devolve um processo que o teste controla. */
function fakeSpawn() {
  const calls = []
  let child = null
  const spawn = (command, args, options) => {
    child = new EventEmitter()
    child.unrefCalls = 0
    child.unref = () => {
      child.unrefCalls += 1
    }
    calls.push({ command, args, options })
    return child
  }
  return { spawn, calls, child: () => child }
}

test('o endereço vai como argumento único, sem shell, destacado e com MM_NOTTTY', async () => {
  const fake = fakeSpawn()
  const url = 'https://example.com/a?x=$(touch /tmp/x)&y=;id;'
  const aberto = openWithXdgOpen(url, { spawn: fake.spawn, windowMs: 50, env: { PATH: '/usr/bin' } })
  fake.child().emit('exit', 0, null)
  await aberto
  assert.equal(fake.calls.length, 1)
  assert.equal(fake.calls[0].command, 'xdg-open')
  assert.deepEqual(fake.calls[0].args, [url])
  assert.equal(fake.calls[0].options.shell, undefined)
  assert.equal(fake.calls[0].options.detached, true)
  assert.equal(fake.calls[0].options.stdio, 'ignore')
  assert.equal(fake.calls[0].options.env.MM_NOTTTY, '1')
  assert.equal(fake.calls[0].options.env.PATH, '/usr/bin')
})

test('saída com erro dentro da janela é falha (3: nenhum navegador; 4: ação falhou)', async () => {
  for (const code of [1, 3, 4]) {
    const fake = fakeSpawn()
    const aberto = openWithXdgOpen('https://example.com/', { spawn: fake.spawn, windowMs: 1_000 })
    fake.child().emit('exit', code, null)
    await assert.rejects(aberto, new RegExp(`saída ${code}`))
  }
})

test('sem xdg-open no sistema (ENOENT) é falha', async () => {
  const fake = fakeSpawn()
  const aberto = openWithXdgOpen('https://example.com/', { spawn: fake.spawn, windowMs: 1_000 })
  fake.child().emit('error', Object.assign(new Error('spawn xdg-open ENOENT'), { code: 'ENOENT' }))
  await assert.rejects(aberto, /ENOENT/)
})

test('processo ainda vivo quando a janela fecha é sucesso, e fica solto do app', async () => {
  const fake = fakeSpawn()
  await openWithXdgOpen('https://example.com/', { spawn: fake.spawn, windowMs: 20 })
  assert.equal(fake.child().unrefCalls, 1)
  // Uma saída tardia (o navegador fechou depois) não muda nada nem lança.
  fake.child().emit('exit', 3, null)
})

test('spawn que lança na hora vira rejeição', async () => {
  const aberto = openWithXdgOpen('https://example.com/', {
    spawn: () => {
      throw new Error('EAGAIN')
    },
    windowMs: 20,
  })
  await assert.rejects(aberto, /EAGAIN/)
})

test('platformShell: só o Linux troca o shell do Electron', () => {
  const electronShell = { openExternal: async () => {} }
  assert.equal(platformShell(electronShell, 'darwin'), electronShell)
  assert.equal(platformShell(electronShell, 'win32'), electronShell)
  const linux = platformShell(electronShell, 'linux')
  assert.notEqual(linux, electronShell)
  assert.equal(typeof linux.openExternal, 'function')
})

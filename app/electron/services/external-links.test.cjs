const test = require('node:test')
const assert = require('node:assert/strict')

const Module = require('node:module')
const originalLoad = Module._load
const defaultShellCalls = []
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') {
    return { shell: { openExternal: async (url) => defaultShellCalls.push(url) } }
  }
  return originalLoad.call(this, request, parent, isMain)
}
const { denyExternalWindowOpen, openExternalUrl } = require('./external-links.cjs')
Module._load = originalLoad

function fakeShell() {
  const opened = []
  return { opened, openExternal: async (url) => opened.push(url) }
}

function fakeLogger() {
  const lines = []
  return { lines, warn: (line) => lines.push(line) }
}

test('abre pelo shell a forma serializada da URL aprovada', async () => {
  const shell = fakeShell()
  await openExternalUrl('  HTTPS://Example.com/Caminho  ', shell, fakeLogger())
  await openExternalUrl('mailto:pessoa@example.com', shell, fakeLogger())
  assert.deepEqual(shell.opened, ['https://example.com/Caminho', 'mailto:pessoa@example.com'])
})

test('esquema fora da allowlist nunca chega ao shell', async () => {
  const shell = fakeShell()
  const perigosas = [
    'javascript:alert(1)',
    'file:///C:/Users/pessoa/.ssh/id_ed25519',
    'vscode://file/C:/projeto/arquivo.ts',
    'data:text/html,<script>alert(1)</script>',
    'blob:https://example.com/1b4e28ba',
    'ms-msdt:/id',
    'search-ms:query=x',
    'C:\\Windows\\System32\\calc.exe',
    '\\\\servidor\\compartilhamento',
    'java\nscript:alert(1)',
    'https://exa\u200Bmple.com/',
    'about:blank',
    '',
    undefined,
  ]

  for (const url of perigosas) {
    await assert.rejects(openExternalUrl(url, shell, fakeLogger()), /Link externo recusado/)
  }
  assert.deepEqual(shell.opened, [])
})

test('a recusa não grava a URL inteira em log nem na mensagem de erro', async () => {
  const logger = fakeLogger()
  const secret = 'file:///C:/Users/pessoa/SEGREDO.txt?token=SEGREDO'

  await assert.rejects(openExternalUrl(secret, fakeShell(), logger), (error) => {
    assert.doesNotMatch(error.message, /SEGREDO/)
    return true
  })
  assert.equal(logger.lines.length, 1)
  assert.doesNotMatch(logger.lines[0], /SEGREDO/)
  assert.match(logger.lines[0], /esquema/)
})

test('o handler da janela principal nega a janela e só repassa URL aprovada ao shell', async () => {
  const originalWarn = console.warn
  console.warn = () => {}
  try {
    defaultShellCalls.length = 0
    assert.deepEqual(denyExternalWindowOpen({ url: 'https://example.com' }), { action: 'deny' })
    assert.deepEqual(denyExternalWindowOpen({ url: 'javascript:alert(1)' }), { action: 'deny' })
    assert.deepEqual(denyExternalWindowOpen({ url: 'about:blank' }), { action: 'deny' })
    assert.deepEqual(denyExternalWindowOpen(undefined), { action: 'deny' })
    // A abertura é assíncrona; uma volta no loop basta para o shell falso.
    await new Promise((resolve) => setImmediate(resolve))
    assert.deepEqual(defaultShellCalls, ['https://example.com/'])
  } finally {
    console.warn = originalWarn
  }
})

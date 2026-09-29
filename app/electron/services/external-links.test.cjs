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
const {
  EXTERNAL_URL_REFUSED,
  createExternalWindowOpenHandler,
  denyExternalWindowOpen,
  describeExternalOpenFailure,
  openExternalUrl,
} = require('./external-links.cjs')
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

/** Uma volta no loop: a abertura roda depois que o handler já respondeu. */
const nextTurn = () => new Promise((resolve) => setImmediate(resolve))

test('o handler avisa a janela quando o sistema não entrega o link a um navegador', async () => {
  const avisos = []
  const logger = fakeLogger()
  const semNavegador = { openExternal: async () => { throw new Error('Falhou: https://example.com/?token=SEGREDO') } }
  const handler = createExternalWindowOpenHandler({
    open: (url) => openExternalUrl(url, semNavegador, logger),
    notify: (falha) => avisos.push(falha),
  })

  assert.deepEqual(handler({ url: 'https://example.com/?token=SEGREDO' }), { action: 'deny' })
  // A resposta vem na hora; o aviso, depois da tentativa.
  assert.deepEqual(avisos, [])
  await nextTurn()

  assert.deepEqual(avisos, [{ url: 'https://example.com/?token=SEGREDO', kind: 'falhou' }])
  // O log da falha leva só esquema e host, nunca a URL nem a mensagem do sistema.
  assert.equal(logger.lines.length, 1)
  assert.doesNotMatch(logger.lines[0], /SEGREDO/)
  assert.match(logger.lines[0], /O sistema não abriu o link/)
})

test('o handler avisa a recusa da política com o motivo, e o shell nunca é chamado', async () => {
  const avisos = []
  const shell = fakeShell()
  const handler = createExternalWindowOpenHandler({
    open: (url) => openExternalUrl(url, shell, fakeLogger()),
    notify: (falha) => avisos.push(falha),
  })

  handler({ url: 'file:///etc/passwd' })
  await nextTurn()

  assert.equal(avisos.length, 1)
  assert.equal(avisos[0].kind, 'recusado')
  assert.equal(avisos[0].url, 'file:///etc/passwd')
  assert.ok(avisos[0].reason)
  assert.deepEqual(shell.opened, [])
})

test('link que abre não gera aviso, e um aviso que lança não vira rejeição solta', async () => {
  const avisos = []
  const shell = fakeShell()
  const aberto = createExternalWindowOpenHandler({
    open: (url) => openExternalUrl(url, shell, fakeLogger()),
    notify: (falha) => avisos.push(falha),
  })
  aberto({ url: 'https://example.com/a' })

  const rejeicoes = []
  const onRejection = (reason) => rejeicoes.push(reason)
  process.on('unhandledRejection', onRejection)
  try {
    const janelaFechada = createExternalWindowOpenHandler({
      open: async () => { throw new Error('sem navegador') },
      notify: () => { throw new Error('a janela já fechou') },
    })
    janelaFechada({ url: 'https://example.com/b' })
    await nextTurn()
    await nextTurn()
  } finally {
    process.off('unhandledRejection', onRejection)
  }

  assert.deepEqual(shell.opened, ['https://example.com/a'])
  assert.deepEqual(avisos, [])
  assert.deepEqual(rejeicoes, [])
})

test('describeExternalOpenFailure separa a recusa da política da falha do sistema', () => {
  const recusa = Object.assign(new Error('recusado'), { code: EXTERNAL_URL_REFUSED, reason: 'esquema' })
  assert.deepEqual(describeExternalOpenFailure('javascript:x', recusa), {
    url: 'javascript:x',
    kind: 'recusado',
    reason: 'esquema',
  })
  assert.deepEqual(describeExternalOpenFailure('https://example.com/', new Error('boom')), {
    url: 'https://example.com/',
    kind: 'falhou',
  })
  // O que não é texto não vai para a janela.
  assert.deepEqual(describeExternalOpenFailure(undefined, new Error('boom')), { url: '', kind: 'falhou' })
})

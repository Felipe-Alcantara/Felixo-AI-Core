const test = require('node:test')
const assert = require('node:assert/strict')
const { parseEditorSetting, resolveEditorCommand } = require('./editor-command.cjs')

/** Dubla o PATH: so os comandos listados existem. */
function fakeResolvePath(available) {
  return (command) => (available.includes(command) ? `/usr/bin/${command}` : null)
}

test('VISUAL tem preferencia sobre EDITOR', () => {
  const result = resolveEditorCommand({
    env: { VISUAL: 'micro', EDITOR: 'nano' },
    platform: 'linux',
    resolvePath: fakeResolvePath([]),
  })

  assert.deepEqual(result, { ok: true, editor: { command: 'micro', args: [] } })
})

test('EDITOR vale quando VISUAL nao esta definido', () => {
  const result = resolveEditorCommand({
    env: { EDITOR: 'vim' },
    platform: 'linux',
    resolvePath: fakeResolvePath([]),
  })

  assert.deepEqual(result.editor, { command: 'vim', args: [] })
})

test('editor configurado com opcao junto e separado em comando e argumentos', () => {
  const result = resolveEditorCommand({
    env: { EDITOR: 'code -w' },
    platform: 'linux',
    resolvePath: fakeResolvePath([]),
  })

  assert.deepEqual(result.editor, { command: 'code', args: ['-w'] })
})

test('caminho com espaco entre aspas continua sendo um comando so', () => {
  const result = resolveEditorCommand({
    env: { EDITOR: '"C:\\Program Files\\Editor\\ed.exe" -n' },
    platform: 'win32',
    resolvePath: fakeResolvePath([]),
  })

  assert.deepEqual(result.editor, {
    command: 'C:\\Program Files\\Editor\\ed.exe',
    args: ['-n'],
  })
})

test('sem configuracao, usa o primeiro candidato que existe no PATH', () => {
  const result = resolveEditorCommand({
    env: {},
    platform: 'linux',
    // `nano` ausente: nao pode ser oferecido so por ser o preferido.
    resolvePath: fakeResolvePath(['vim', 'vi']),
  })

  assert.deepEqual(result.editor, { command: 'vim', args: [] })
})

test('respeita a ordem de preferencia quando varios existem', () => {
  const result = resolveEditorCommand({
    env: {},
    platform: 'linux',
    resolvePath: fakeResolvePath(['vi', 'vim', 'nano', 'micro']),
  })

  assert.deepEqual(result.editor, { command: 'nano', args: [] })
})

test('no Windows cai no notepad', () => {
  const result = resolveEditorCommand({
    env: {},
    platform: 'win32',
    resolvePath: fakeResolvePath(['notepad']),
  })

  assert.deepEqual(result.editor, { command: 'notepad', args: [] })
})

test('sem nenhum editor no PATH, avisa em vez de oferecer um que nao existe', () => {
  const result = resolveEditorCommand({
    env: {},
    platform: 'linux',
    resolvePath: fakeResolvePath([]),
  })

  assert.equal(result.ok, false)
  assert.match(result.message, /Nenhum editor/)
  assert.match(result.message, /EDITOR/)
})

test('variavel vazia ou so espaco nao conta como configuracao', () => {
  const result = resolveEditorCommand({
    env: { VISUAL: '   ', EDITOR: '' },
    platform: 'linux',
    resolvePath: fakeResolvePath(['nano']),
  })

  assert.deepEqual(result.editor, { command: 'nano', args: [] })
})

test('parseEditorSetting devolve null para o que nao e configuracao', () => {
  assert.equal(parseEditorSetting(''), null)
  assert.equal(parseEditorSetting('   '), null)
  assert.equal(parseEditorSetting(undefined), null)
  assert.equal(parseEditorSetting(null), null)
  assert.equal(parseEditorSetting(42), null)
})

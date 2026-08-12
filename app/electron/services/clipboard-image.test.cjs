const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const {
  parseClipboardFilePath,
  readClipboardFilePaths,
  readClipboardImage,
} = require('./clipboard-image.cjs')

/** Minimal stand-in for Electron's clipboard, so tests need no Electron. */
function fakeClipboard({ image = null, formats = {}, text = '' } = {}) {
  return {
    readImage: () => ({
      isEmpty: () => !image,
      toPNG: () => image ?? Buffer.alloc(0),
    }),
    read: (format) =>
      typeof formats[format] === 'string' ? formats[format] : '',
    readBuffer: (format) => {
      if (Buffer.isBuffer(formats[format])) {
        return formats[format]
      }
      throw new Error(`format not available: ${format}`)
    },
    readText: () => text,
  }
}

test('a bitmap on the clipboard is read as PNG without touching the disk', async () => {
  const result = await readClipboardImage({
    clipboard: fakeClipboard({ image: Buffer.from('fake-png-bytes') }),
    readFile: () => assert.fail('should not read files when a bitmap is present'),
  })

  assert.equal(result.ok, true)
  assert.equal(result.type, 'image/png')
  assert.equal(result.name, 'clipboard-image.png')
  assert.equal(result.data.toString(), 'fake-png-bytes')
})

test('an empty bitmap falls through to the file references', async () => {
  const filePath = path.resolve('/tmp/captura.png')
  const result = await readClipboardImage({
    clipboard: fakeClipboard({
      formats: { 'text/uri-list': `${pathToFileURL(filePath).href}\n` },
    }),
    readFile: async (requested) => {
      assert.equal(requested, filePath)
      return Buffer.from('png-from-disk')
    },
  })

  assert.equal(result.ok, true)
  assert.equal(result.type, 'image/png')
  assert.equal(result.name, 'captura.png')
  assert.equal(result.data.toString(), 'png-from-disk')
})

test('the GNOME file list is read from raw bytes and its operation prefix ignored', async () => {
  const filePath = path.resolve('/home/user/Imagens/foto.jpg')
  const result = await readClipboardImage({
    clipboard: fakeClipboard({
      formats: {
        'x-special/gnome-copied-files': Buffer.from(
          `copy\n${pathToFileURL(filePath).href}`,
          'utf8',
        ),
      },
    }),
    readFile: async () => Buffer.from('jpeg-bytes'),
  })

  assert.equal(result.ok, true)
  assert.equal(result.type, 'image/jpeg')
  assert.equal(result.name, 'foto.jpg')
})

test('a dangling reference is skipped so a later entry can still resolve', async () => {
  const missing = path.resolve('/tmp/apagada.png')
  const present = path.resolve('/tmp/existe.png')
  const result = await readClipboardImage({
    clipboard: fakeClipboard({
      formats: {
        'text/uri-list': [
          pathToFileURL(missing).href,
          pathToFileURL(present).href,
        ].join('\n'),
      },
    }),
    readFile: async (requested) => {
      if (requested === missing) {
        throw new Error('ENOENT')
      }
      return Buffer.from('ok')
    },
  })

  assert.equal(result.ok, true)
  assert.equal(result.name, 'existe.png')
})

test('a clipboard holding no image reports it instead of throwing', async () => {
  const result = await readClipboardImage({
    clipboard: fakeClipboard({ text: 'apenas um texto qualquer' }),
    readFile: async () => assert.fail('no image reference to read'),
  })

  assert.equal(result.ok, false)
  assert.match(result.message, /Nenhuma imagem/)
})

test('a non-image file on the clipboard is not offered as an image', async () => {
  const filePath = path.resolve('/tmp/relatorio.pdf')
  const result = await readClipboardImage({
    clipboard: fakeClipboard({
      formats: { 'text/uri-list': pathToFileURL(filePath).href },
    }),
    readFile: async () => assert.fail('pdf should never be read as an image'),
  })

  assert.equal(result.ok, false)
})

test('parseClipboardFilePath keeps only absolute paths and real file URIs', () => {
  const absolute = path.resolve('/tmp/a.png')

  assert.equal(parseClipboardFilePath(pathToFileURL(absolute).href), absolute)
  assert.equal(parseClipboardFilePath(absolute), absolute)
  assert.equal(parseClipboardFilePath('copy'), '')
  assert.equal(parseClipboardFilePath('cut'), '')
  assert.equal(parseClipboardFilePath('# comentario'), '')
  assert.equal(parseClipboardFilePath('imagens/a.png'), '')
  assert.equal(parseClipboardFilePath('   '), '')
  assert.equal(parseClipboardFilePath(null), '')
  assert.equal(parseClipboardFilePath('https://exemplo.org/a.png'), '')
})

test('readClipboardFilePaths reports each path once, in clipboard order', () => {
  const first = path.resolve('/tmp/um.png')
  const second = path.resolve('/tmp/dois.png')
  const paths = readClipboardFilePaths(
    fakeClipboard({
      formats: {
        'text/uri-list': [
          pathToFileURL(first).href,
          pathToFileURL(second).href,
        ].join('\n'),
      },
      // Same file again through the plain-text route.
      text: first,
    }),
  )

  assert.deepEqual(paths, [first, second])
})

test('a clipboard missing every format is handled as simply having no image', async () => {
  const result = await readClipboardImage({
    clipboard: {},
    readFile: async () => assert.fail('nothing to read'),
  })

  assert.equal(result.ok, false)
})

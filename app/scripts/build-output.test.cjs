'use strict'
require('./test-support/pasta-do-teste.cjs') // isola o temporário deste arquivo (ver pasta-do-teste.cjs)

const { test, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { findStaleOutputFiles, listFiles, removeStaleOutput, removeTreeSync } = require('./build-output.cjs')

const pastas = []
after(() => {
  for (const pasta of pastas) removeTreeSync(pasta)
})
function pasta() {
  // Com acento: é o caminho em que o rmSync do Node 25 não apagava.
  const criada = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-build-output-')), 'Programação')
  fs.mkdirSync(criada)
  pastas.push(path.dirname(criada))
  return criada
}
function escrever(base, relativo, conteudo = 'x') {
  const alvo = path.join(base, ...relativo.split('/'))
  fs.mkdirSync(path.dirname(alvo), { recursive: true })
  fs.writeFileSync(alvo, conteudo)
}

test('removeTreeSync apaga uma árvore num caminho com acento e não reclama do que já não existe', () => {
  const base = pasta()
  escrever(base, 'npm-runtime/npm/lib/a.js')
  escrever(base, 'npm-runtime/npm/bin/npm-cli.js')
  removeTreeSync(path.join(base, 'npm-runtime'))
  assert.equal(fs.existsSync(path.join(base, 'npm-runtime')), false)
  assert.doesNotThrow(() => removeTreeSync(path.join(base, 'nunca-existiu')))
})

test('removeTreeSync apaga o link e não o que ele aponta', (t) => {
  const base = pasta()
  escrever(base, 'alvo/importante.txt')
  try {
    fs.symlinkSync(path.join(base, 'alvo'), path.join(base, 'link'), 'junction')
  } catch (error) {
    t.skip(`sem permissão para criar link: ${error.code}`)
    return
  }
  removeTreeSync(path.join(base, 'link'))
  assert.equal(fs.existsSync(path.join(base, 'link')), false)
  assert.ok(fs.existsSync(path.join(base, 'alvo', 'importante.txt')))
})

test('removeTreeSync lança quando o arquivo continua lá (o rmSync mudo não passa despercebido)', () => {
  const base = pasta()
  escrever(base, 'teimoso.txt')
  const fsMudo = { ...fs, unlinkSync: () => {}, existsSync: fs.existsSync, lstatSync: fs.lstatSync }
  assert.throws(() => removeTreeSync(path.join(base, 'teimoso.txt'), fsMudo), /não consegui apagar/)
})

test('removeTreeSync tenta de novo quando o Windows segura o arquivo por instantes (EBUSY)', () => {
  const base = pasta()
  escrever(base, 'preso.txt')
  let falhas = 2
  const fsOcupado = {
    ...fs,
    unlinkSync: (alvo) => {
      if (falhas-- > 0) throw Object.assign(new Error('busy'), { code: 'EBUSY' })
      fs.unlinkSync(alvo)
    },
  }
  removeTreeSync(path.join(base, 'preso.txt'), fsOcupado)
  assert.equal(fs.existsSync(path.join(base, 'preso.txt')), false)
  assert.equal(falhas, -1, 'deveria ter falhado duas vezes e passado na terceira')
})

test('removeTreeSync desiste e relança se o arquivo nunca solta', () => {
  const base = pasta()
  escrever(base, 'preso.txt')
  const fsPreso = { ...fs, unlinkSync: () => { throw Object.assign(new Error('busy'), { code: 'EBUSY' }) } }
  assert.throws(() => removeTreeSync(path.join(base, 'preso.txt'), fsPreso), /busy/)
})

test('o que não saiu deste build é sobra; o emitido e o da pasta public ficam', () => {
  const base = pasta()
  const dist = path.join(base, 'dist')
  const publico = path.join(base, 'public')
  escrever(publico, 'sounds/notification.mp3')
  escrever(publico, 'icons.svg')
  for (const arquivo of ['index.html', 'assets/index-NOVO.js', 'assets/index-NOVO.css', 'excalidraw-assets/fonts/Excalifont/a.woff2']) {
    escrever(dist, arquivo)
  }
  escrever(dist, 'sounds/notification.mp3')
  escrever(dist, 'icons.svg')
  escrever(dist, 'assets/index-VELHO.js')
  escrever(dist, 'assets/ExcalidrawCanvas-VELHO.js')
  escrever(dist, 'pasta-que-saiu/antigo.txt')
  const emitted = ['index.html', 'assets/index-NOVO.js', 'assets/index-NOVO.css', 'excalidraw-assets/fonts/Excalifont/a.woff2']

  assert.deepEqual(findStaleOutputFiles({ outDir: dist, emitted, publicDir: publico }).sort(), [
    'assets/ExcalidrawCanvas-VELHO.js',
    'assets/index-VELHO.js',
    'pasta-que-saiu/antigo.txt',
  ])

  const removidos = removeStaleOutput({ outDir: dist, emitted, publicDir: publico })
  assert.equal(removidos.length, 3)
  assert.deepEqual(listFiles(dist).sort(), [...emitted, 'icons.svg', 'sounds/notification.mp3'].sort())
  // A pasta que só tinha sobra some junto.
  assert.equal(fs.existsSync(path.join(dist, 'pasta-que-saiu')), false)
})

test('dist que ainda não existe não tem sobra', () => {
  assert.deepEqual(findStaleOutputFiles({ outDir: path.join(pasta(), 'dist'), emitted: [] }), [])
})

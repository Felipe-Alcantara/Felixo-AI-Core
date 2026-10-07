'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test } = require('node:test')

const {
  caminhoParaRelatorio,
  contemSegredo,
  extrairVersao,
  redigirSegredo,
  varrerSegredo,
} = require('./openia-windows-limpo.cjs')

// Valor fictício no formato de uma chave OpenRouter (nunca uma chave real).
const SEGREDO = 'sk-or-v1-0123456789abcdef0123456789abcdef0123456789abcdef0123456789ab'

test('redige a chave inteira e também o sufixo que basta para identificá-la', () => {
  const texto = `inteira=${SEGREDO} sufixo=${SEGREDO.slice(-24)} fim`

  const redigido = redigirSegredo(texto, SEGREDO)

  assert.equal(redigido.includes(SEGREDO.slice(-24)), false)
  assert.equal(redigido, 'inteira=<CHAVE> sufixo=<CHAVE> fim')
  assert.equal(contemSegredo(redigido, SEGREDO), false)
})

test('sem chave definida, nada é redigido nem acusado', () => {
  assert.equal(redigirSegredo('texto', ''), 'texto')
  assert.equal(contemSegredo('texto', ''), false)
})

test('a varredura acha a chave em texto, em UTF-16 e dentro de binário, e ignora o resto', () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo varredura '))
  try {
    fs.mkdirSync(path.join(raiz, 'sub'))
    fs.writeFileSync(path.join(raiz, 'limpo.json'), '{"nada":"aqui"}')
    fs.writeFileSync(path.join(raiz, 'texto.log'), `linha\n${SEGREDO}\n`)
    fs.writeFileSync(path.join(raiz, 'sub', 'utf16.txt'), Buffer.from(`x ${SEGREDO} y`, 'utf16le'))
    fs.writeFileSync(path.join(raiz, 'sub', 'banco.sqlite'), Buffer.concat([Buffer.from([0, 1, 2, 255]), Buffer.from(SEGREDO.slice(-24), 'latin1'), Buffer.from([0])]))

    const resultado = varrerSegredo([raiz, path.join(raiz, 'nao-existe')], SEGREDO)

    assert.equal(resultado.arquivos, 4)
    assert.deepEqual(
      resultado.comSegredo.map((arquivo) => path.relative(raiz, arquivo)).sort(),
      [path.join('sub', 'banco.sqlite'), path.join('sub', 'utf16.txt'), 'texto.log'].sort(),
    )
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true })
  }
})

test('extrai a versão x.y.z da saída de uma CLI', () => {
  assert.equal(extrairVersao('openia 0.1.0\r\n'), '0.1.0')
  assert.equal(extrairVersao('Python 3.12.10'), '3.12.10')
  assert.equal(extrairVersao('sem versão'), null)
})

test('o relatório troca a pasta pessoal por ~ sem perder o resto do caminho', () => {
  const home = 'C:\\Users\\Felixo Teste'

  assert.equal(caminhoParaRelatorio('C:\\Users\\Felixo Teste\\AppData\\Roaming\\Python\\Scripts\\openia.exe', home), '~\\AppData\\Roaming\\Python\\Scripts\\openia.exe')
  assert.equal(caminhoParaRelatorio('C:\\Felixo Aliases\\so cmd\\openia.cmd', home), 'C:\\Felixo Aliases\\so cmd\\openia.cmd')
  assert.equal(caminhoParaRelatorio(null, home), null)
})

'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const {
  capacidadesDeLink,
  criarCaminhoDeArquivoQueEscapa,
  criarLinkDeDiretorio,
} = require('./link-fixtures.cjs')

/**
 * O helper existe para que uma mesma regra de seguranca seja exercida no
 * Windows, no macOS e no Linux, ainda que o mecanismo de link disponivel
 * mude. Por isso os testes aqui nao afirmam qual mecanismo foi usado: eles
 * afirmam as duas propriedades que o produto de fato consulta. Se um dia
 * junction, symlink ou o proprio Node deixarem de oferece-las, e aqui que
 * quebra — antes de virar um teste de seguranca passando em falso.
 */

function comDiretoriosTemporarios(executar) {
  const dentro = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-link-dentro-'))
  const fora = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-link-fora-'))
  try {
    return executar({ dentro, fora })
  } finally {
    fs.rmSync(dentro, { recursive: true, force: true })
    fs.rmSync(fora, { recursive: true, force: true })
  }
}

test('capacidadesDeLink descreve a plataforma e responde igual ao ser chamada de novo', () => {
  const primeira = capacidadesDeLink()
  const segunda = capacidadesDeLink()

  for (const chave of ['symlinkDeDiretorio', 'symlinkDeArquivo', 'junction']) {
    assert.equal(typeof primeira[chave], 'boolean', `${chave} deveria ser booleano`)
  }
  assert.deepEqual(primeira, segunda)

  // Toda plataforma suportada precisa de pelo menos uma forma de ligar um
  // diretorio; sem isso os testes de containment nao teriam como existir.
  assert.equal(
    primeira.symlinkDeDiretorio || primeira.junction,
    true,
    'nenhuma forma de link de diretorio disponivel nesta plataforma',
  )
})

test('junction so aparece como capacidade no Windows', () => {
  if (process.platform === 'win32') return
  assert.equal(
    capacidadesDeLink().junction,
    false,
    'junction e um conceito do NTFS e nao deveria ser reportada fora do Windows',
  )
})

test('criarLinkDeDiretorio produz um reparse point que sai da raiz', () => {
  comDiretoriosTemporarios(({ dentro, fora }) => {
    fs.mkdirSync(path.join(fora, 'segredo'))
    fs.writeFileSync(path.join(fora, 'segredo', 'a.txt'), 'x', 'utf8')
    const caminhoDoLink = path.join(dentro, 'ligado')

    const { tipo } = criarLinkDeDiretorio(path.join(fora, 'segredo'), caminhoDoLink)
    assert.equal(['dir', 'junction'].includes(tipo), true, `tipo inesperado: ${tipo}`)

    const estado = fs.lstatSync(caminhoDoLink)
    // Propriedade 1: measureTree/isDirectory decidem por aqui.
    assert.equal(estado.isSymbolicLink(), true)
    assert.equal(estado.isDirectory(), false)

    // Propriedade 2: resolvePathInside/resolveAuthorizedImagePath decidem por aqui.
    const resolvido = fs.realpathSync(caminhoDoLink)
    assert.equal(resolvido, fs.realpathSync(path.join(fora, 'segredo')))
    assert.equal(resolvido.startsWith(fs.realpathSync(dentro) + path.sep), false)
  })
})

test('criarCaminhoDeArquivoQueEscapa devolve um caminho que resolve para fora', () => {
  comDiretoriosTemporarios(({ dentro, fora }) => {
    const arquivoExterno = path.join(fora, 'privado.png')
    fs.writeFileSync(arquivoExterno, Buffer.from([1, 2, 3]))

    const { caminho } = criarCaminhoDeArquivoQueEscapa({
      dentro,
      arquivoExterno,
      nome: 'permitido.png',
    })

    // O caminho parte de dentro da raiz — e essa e a armadilha que o produto
    // precisa recusar: parecer interno e resolver para fora.
    assert.equal(caminho.startsWith(dentro + path.sep), true)
    assert.equal(fs.realpathSync(caminho), fs.realpathSync(arquivoExterno))
    assert.equal(
      fs.realpathSync(caminho).startsWith(fs.realpathSync(dentro) + path.sep),
      false,
    )
    assert.deepEqual(fs.readFileSync(caminho), Buffer.from([1, 2, 3]))
  })
})

test('um diretorio comum nao e confundido com link, para o controle negativo valer', () => {
  comDiretoriosTemporarios(({ dentro }) => {
    const comum = path.join(dentro, 'comum')
    fs.mkdirSync(comum)
    const estado = fs.lstatSync(comum)
    assert.equal(estado.isSymbolicLink(), false)
    assert.equal(estado.isDirectory(), true)
  })
})

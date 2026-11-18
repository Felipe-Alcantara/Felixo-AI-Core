'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { criarRepositorioDeRevisoes } = require('../services/agent-review-store.cjs')
const { executarRevisao } = require('./review-command.cjs')

function cenario() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-revisao-'))
  const pasta = path.join(base, 'revisoes')
  const arquivo = path.join(base, 'resultado.md')
  fs.writeFileSync(arquivo, '# resultado')
  const revisoes = criarRepositorioDeRevisoes({ pasta })
  /** `esperar` falso: o checador age no lugar da espera do produtor. */
  const produtor = (argumentos, checador) =>
    executarRevisao(argumentos, {
      criarRevisoes: () => revisoes,
      diretorioAtual: () => '/proj',
      esperar: async () => checador?.(),
    })
  const checador = (argumentos) => executarRevisao(argumentos, { criarRevisoes: () => revisoes })
  return { pasta, arquivo, revisoes, produtor, checador }
}

test('aprovação libera o resultado; antes dela não existe caminho liberado', async () => {
  const { arquivo, revisoes, produtor, checador } = cenario()
  const resultado = await produtor(['enviar', arquivo], async () => {
    assert.equal(revisoes.pendentes()[0].liberado, undefined)
    assert.equal((await checador(['aprovar'])).codigo, 0)
  })
  assert.equal(resultado.codigo, 0)
  const liberado = resultado.saida.split('em: ')[1]
  assert.equal(fs.readFileSync(liberado, 'utf8'), '# resultado')
})

test('recusa não libera, devolve o motivo e o grava em recusas.md', async () => {
  const { pasta, arquivo, produtor, checador } = cenario()
  const resultado = await produtor(['enviar', arquivo], () => checador(['recusar', '--motivo', 'faltou teste']))
  assert.equal(resultado.codigo, 3)
  assert.match(resultado.saida, /RECUSADO \(rodada 1\/3\): faltou teste/)
  assert.doesNotMatch(resultado.saida, /liberado em/)
  assert.match(fs.readFileSync(path.join(pasta, 'recusas.md'), 'utf8'), /rodada 1\/3.*faltou teste/)
})

test('recusar sem motivo é erro e não muda nada', async () => {
  const { arquivo, revisoes, produtor, checador } = cenario()
  await produtor(['enviar', arquivo, '--esperar', '0'])
  assert.equal((await checador(['recusar'])).codigo, 2)
  assert.equal(revisoes.pendentes().length, 1)
})

test('três recusas seguidas escalam para a pessoa e bloqueiam novo envio', async () => {
  const { arquivo, produtor, checador } = cenario()
  let ultimo
  for (let i = 0; i < 3; i += 1) {
    ultimo = await produtor(['enviar', arquivo], () => checador(['recusar', '--motivo=ruim']))
  }
  assert.match(ultimo.saida, /rodada 3\/3/)
  assert.match(ultimo.saida, /avise a pessoa/)
  const quarto = await produtor(['enviar', arquivo, '--esperar', '0'])
  assert.equal(quarto.codigo, 4)
})

test('sem decisão dentro da espera, o resultado continua retido', async () => {
  const { arquivo, produtor } = cenario()
  const resultado = await produtor(['enviar', arquivo, '--esperar', '2'])
  assert.equal(resultado.codigo, 1)
  assert.match(resultado.saida, /continua retido/)
})

test('rejeita arquivo que não é .md e id fora do formato', async () => {
  const { pasta, produtor, revisoes } = cenario()
  const txt = path.join(path.dirname(pasta), 'a.txt')
  fs.writeFileSync(txt, 'x')
  assert.equal((await produtor(['enviar', txt])).codigo, 4)
  assert.equal(revisoes.ler('../../etc'), null)
})

test('recusas no mesmo milissegundo continuam contando as rodadas em ordem', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-revisao-'))
  const arquivo = path.join(base, 'resultado.md')
  fs.writeFileSync(arquivo, '# resultado')
  // Relógio parado: o CI rápido cria revisões no mesmo milissegundo e só a sequência desempata.
  const revisoes = criarRepositorioDeRevisoes({ pasta: path.join(base, 'revisoes'), agora: () => new Date(0) })
  for (let rodada = 1; rodada <= 3; rodada += 1) {
    const enviada = revisoes.enviar({ arquivo, produtor: 'p' })
    assert.equal(enviada.ok, true)
    assert.equal(enviada.revisao.rodada, rodada)
    revisoes.recusar(enviada.revisao.id, 'ruim')
  }
})

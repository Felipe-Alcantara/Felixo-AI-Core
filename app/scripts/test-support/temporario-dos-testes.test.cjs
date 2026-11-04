'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  criarTemporario,
  descartarTemporario,
  descreverSobras,
  removerAbandonadas,
  resumirSobras,
} = require('./temporario-dos-testes.cjs')

function baseDeTeste(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-tt-'))
  t.after(() => fs.rmSync(base, { recursive: true, force: true }))
  return base
}

function criarPasta(base, nome, conteudo = {}) {
  const pasta = path.join(base, nome)
  fs.mkdirSync(pasta, { recursive: true })
  for (const [arquivo, texto] of Object.entries(conteudo)) fs.writeFileSync(path.join(pasta, arquivo), texto)
  return pasta
}

test('criarTemporario cria uma pasta com o pid no nome, dentro da base', (t) => {
  const base = baseDeTeste(t)
  const pasta = criarTemporario({ base, pid: 4321 })
  assert.equal(path.dirname(pasta), base)
  assert.match(path.basename(pasta), /^felixo-testes-4321-[A-Za-z0-9]{6}$/)
  assert.ok(fs.statSync(pasta).isDirectory())
})

test('o que os testes deixam é contado por prefixo, do maior para o menor, e some com a pasta', (t) => {
  const base = baseDeTeste(t)
  const pasta = criarTemporario({ base })
  for (const nome of ['felixo-cli-AAAAAA', 'felixo-cli-BBBBBB', 'felixo-cli-CCCCCC', 'felixo-paths-DDDDDD', 'node-compile-cache']) {
    criarPasta(pasta, nome, { 'dado.txt': 'x' })
  }
  fs.writeFileSync(path.join(pasta, 'felixo-solto-EEEEEE'), 'um arquivo, não uma pasta')

  assert.deepEqual(resumirSobras(pasta), {
    total: 6,
    porPrefixo: [['felixo-cli-', 3], ['felixo-paths-', 1], ['felixo-solto-', 1], ['node-compile-cache', 1]],
  })

  const resultado = descartarTemporario(pasta)
  assert.equal(resultado.removida, true)
  assert.equal(resultado.total, 6)
  assert.equal(fs.existsSync(pasta), false)
})

test('uma suíte que limpou tudo não gera linha nenhuma', (t) => {
  const base = baseDeTeste(t)
  const pasta = criarTemporario({ base })
  assert.equal(descreverSobras(descartarTemporario(pasta), pasta), null)
})

test('a linha final traz o total e as maiores origens', () => {
  const resumo = {
    total: 203,
    porPrefixo: [['felixo-openia-image-', 63], ['felixo-cli-', 35], ['felixo-devtools-test-', 20], ['felixo-pedidos-', 12], ['felixo-paths-', 11]],
    removida: true,
    erro: null,
  }
  assert.equal(
    descreverSobras(resumo, '/tmp/x'),
    '[test] os testes deixaram 203 entradas no diretório temporário, já removidas (as maiores: felixo-openia-image- 63, felixo-cli- 35, felixo-devtools-test- 20, felixo-pedidos- 12)',
  )
  assert.equal(
    descreverSobras({ ...resumo, removida: false, erro: 'EBUSY' }, '/tmp/x'),
    '[test] não foi possível remover /tmp/x (EBUSY); os testes deixaram 203 entradas (as maiores: felixo-openia-image- 63, felixo-cli- 35, felixo-devtools-test- 20, felixo-pedidos- 12)',
  )
})

test('execução interrompida: a próxima apaga a pasta de pid morto e deixa as outras', (t) => {
  const base = baseDeTeste(t)
  const morta = criarPasta(base, 'felixo-testes-111-AAAAAA', { 'sobra.txt': 'x' })
  const viva = criarPasta(base, 'felixo-testes-222-BBBBBB')
  const propria = criarPasta(base, 'felixo-testes-333-CCCCCC')
  const alheia = criarPasta(base, 'felixo-cli-DDDDDD')
  const parecida = criarPasta(base, 'felixo-testes-abc-EEEEEE')

  const removidas = removerAbandonadas({ base, pid: 333, vivo: (pid) => pid === 222 })

  assert.deepEqual(removidas, ['felixo-testes-111-AAAAAA'])
  assert.equal(fs.existsSync(morta), false)
  for (const pasta of [viva, propria, alheia, parecida]) assert.ok(fs.existsSync(pasta), `${pasta} não podia ser apagada`)
})

test('criarTemporario limpa as abandonadas antes de criar a nova', (t) => {
  const base = baseDeTeste(t)
  const morta = criarPasta(base, 'felixo-testes-111-AAAAAA')
  const nova = criarTemporario({ base, pid: 999, vivo: () => false })
  assert.equal(fs.existsSync(morta), false)
  assert.ok(fs.existsSync(nova))
})

test('base ilegível não derruba a suíte', () => {
  assert.deepEqual(removerAbandonadas({ base: path.join(os.tmpdir(), 'felixo-nao-existe-zzzzzz') }), [])
})

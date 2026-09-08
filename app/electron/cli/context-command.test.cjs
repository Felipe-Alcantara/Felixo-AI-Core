'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fsp = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

const {
  executarContexto,
  resolverCaminhoDoArtefato,
  validarNomeDoArtefato,
} = require('./context-command.cjs')

test('lê um artefato pelo nome no diretório do perfil ativo', async () => {
  const contextDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'felixo-context-cli-'))
  const name = 'felixo-context-123-abc-handoff.txt'
  const body = '# contexto local\nconteúdo preservado'

  try {
    await fsp.writeFile(path.join(contextDir, name), body, 'utf8')
    const result = await executarContexto(['read', name], {
      getContextDir: () => contextDir,
    })

    assert.equal(result.codigo, 0)
    assert.equal(result.saida, body)
    assert.equal(result.erro, undefined)
  } finally {
    await fsp.rm(contextDir, { recursive: true, force: true })
  }
})

test('aceita o alias em português sem transportar caminho do sistema', async () => {
  const contextDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'felixo-context-cli-'))
  const name = 'felixo-context-123-abc-catalog-prompt.txt'

  try {
    await fsp.writeFile(path.join(contextDir, name), 'catalogo', 'utf8')
    const result = await executarContexto(['ler', name], {
      getContextDir: () => contextDir,
    })

    assert.equal(result.codigo, 0)
    assert.equal(result.saida, 'catalogo')
  } finally {
    await fsp.rm(contextDir, { recursive: true, force: true })
  }
})

test('recusa caminho absoluto, traversal e arquivo que não é do Felixo', () => {
  for (const name of [
    '/Users/outra-maquina/felixo-context-123.txt',
    'C:\\Users\\outra-maquina\\felixo-context-123.txt',
    '../felixo-context-123.txt',
    'segredo.txt',
  ]) {
    assert.throws(() => validarNomeDoArtefato(name), /sem caminho/)
  }
})

test('artefato ausente falha sem sugerir um caminho de outro perfil', async () => {
  const contextDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'felixo-context-cli-'))
  const name = 'felixo-context-inexistente-handoff.txt'

  try {
    const result = await executarContexto(['read', name], {
      getContextDir: () => contextDir,
    })

    assert.equal(result.codigo, 1)
    assert.match(result.erro, /Artefato de contexto não encontrado/)
    assert.doesNotMatch(result.erro, new RegExp(contextDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  } finally {
    await fsp.rm(contextDir, { recursive: true, force: true })
  }
})

test('o resolvedor mantém o nome dentro da pasta do perfil', () => {
  assert.equal(
    path.basename(resolverCaminhoDoArtefato('/tmp/perfil/context-deliveries', 'felixo-context-1-x.txt')),
    'felixo-context-1-x.txt',
  )
})

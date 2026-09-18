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

test('registra a leitura do agente no QA JSONL persistido', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'felixo-context-cli-log-'))
  const contextDir = path.join(root, 'context-deliveries')
  const deliveryLogDirectory = path.join(root, 'logs', 'qa')
  const name = 'felixo-context-123-log.txt'

  try {
    await fsp.mkdir(contextDir, { recursive: true })
    await fsp.writeFile(path.join(contextDir, name), 'corpo lido pelo agente', 'utf8')
    const result = await executarContexto(['read', name], {
      getContextDir: () => contextDir,
      deliveryLogDirectory,
    })

    assert.equal(result.codigo, 0)
    const logFile = path.join(deliveryLogDirectory, `qa-${new Date().toISOString().slice(0, 10)}.jsonl`)
    const entries = (await fsp.readFile(logFile, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    assert.equal(entries.at(-1).scope, 'context-delivery')
    assert.equal(entries.at(-1).details.artifactId, name)
    assert.equal(entries.at(-1).details.state, 'read')
  } finally {
    await fsp.rm(root, { recursive: true, force: true })
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

test('persiste um diagnóstico quando a leitura do agente falha', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'felixo-context-cli-failure-'))
  const contextDir = path.join(root, 'context-deliveries')
  const deliveryLogDirectory = path.join(root, 'logs', 'qa')
  const name = 'felixo-context-inexistente-diagnostico.txt'

  try {
    const result = await executarContexto(['read', name], {
      getContextDir: () => contextDir,
      deliveryLogDirectory,
    })

    assert.equal(result.codigo, 1)
    const logFile = path.join(deliveryLogDirectory, `qa-${new Date().toISOString().slice(0, 10)}.jsonl`)
    const entries = (await fsp.readFile(logFile, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    assert.equal(entries.at(-1).scope, 'context-delivery')
    assert.equal(entries.at(-1).details.artifactId, name)
    assert.equal(entries.at(-1).details.state, 'failed')
  } finally {
    await fsp.rm(root, { recursive: true, force: true })
  }
})

test('o resolvedor mantém o nome dentro da pasta do perfil', () => {
  assert.equal(
    path.basename(resolverCaminhoDoArtefato('/tmp/perfil/context-deliveries', 'felixo-context-1-x.txt')),
    'felixo-context-1-x.txt',
  )
})

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

test('artefato expirado explica o ciclo de vida e não trava a conversa retomada', async () => {
  // O Felixo apaga estes arquivos quando o terminal do agente termina (fechar o
  // app, auto-atualização do Codex, reiniciar o bloco) e os de mais de 24 h na
  // abertura. A conversa do agente, porém, é retomada com a instrução original
  // ("leia antes de agir") ainda no histórico. Relato real, Windows + Codex:
  // o agente tentou ler três artefatos de uma execução anterior, recebeu só
  // "não encontrado... informe o erro" e parou, sem fazer o pedido da pessoa,
  // pedindo que ela "disponibilizasse novamente" arquivos que ela não controla.
  const contextDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'felixo-context-cli-'))
  const name = 'felixo-context-1791213063512-93a7b9e2-05b2-4f4e-bdd4-c52f2752d8d1-initial-context.txt'

  try {
    const result = await executarContexto(['read', name], {
      getContextDir: () => contextDir,
    })

    assert.equal(result.codigo, 1)
    // Continua identificando o artefato e proibindo troca silenciosa (a razão
    // original desta mensagem: um agente já leu o arquivo errado "equivalente").
    assert.ok(result.erro.includes(`Artefato de contexto não encontrado: ${name}`))
    assert.match(result.erro, /Não substitua por outro artefato/)
    // Diz que a ausência é esperada, em vez de parecer uma falha a reportar.
    assert.match(result.erro, /temporári/i)
    assert.match(result.erro, /encerrad|reiniciad/i)
    // Dá o caminho de saída: o conteúdo já está no histórico da conversa
    // retomada, então o pedido atual segue sem esperar o arquivo reaparecer.
    assert.match(result.erro, /histórico/i)
    assert.match(result.erro, /continue/i)
    // E não abre brecha para inventar o conteúdo que o histórico não tiver.
    assert.match(result.erro, /não invente/i)
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

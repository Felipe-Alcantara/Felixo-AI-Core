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
const { CONTEXT_EXPIRED_DIRNAME } = require('../core/context-file-contract.cjs')

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

/** Erro de arquivo ausente, como o `fs` devolve. */
function ausente() {
  return Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' })
}

test('recupera sozinho o artefato de uma sessão encerrada e avisa que é de uma execução anterior', async () => {
  // Regressão: a conversa do agente é retomada dias depois e ainda manda ler
  // estes nomes. Com o arquivo apagado na saída do processo, o agente travava.
  const contextDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'felixo-context-cli-'))
  const name = 'felixo-context-1791213063512-93a7b9e2-05b2-4f4e-bdd4-c52f2752d8d1-initial-context.txt'
  const body = '# CONTEXTO ENTREGUE PELO FELIXO AI CORE\npadrão de qualidade'

  try {
    await fsp.mkdir(path.join(contextDir, CONTEXT_EXPIRED_DIRNAME))
    await fsp.writeFile(path.join(contextDir, CONTEXT_EXPIRED_DIRNAME, name), body, 'utf8')

    const result = await executarContexto(['read', name], { getContextDir: () => contextDir })

    assert.equal(result.codigo, 0)
    assert.equal(result.erro, undefined)
    assert.match(result.saida, /^AVISO DO FELIXO AI CORE: este artefato é de uma execução anterior/)
    assert.ok(result.saida.endsWith(body), 'o conteúdo entregue na época vem inteiro depois do aviso')
  } finally {
    await fsp.rm(contextDir, { recursive: true, force: true })
  }
})

test('a leitura normal não ganha aviso nem espera', async () => {
  const contextDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'felixo-context-cli-'))
  const name = 'felixo-context-123-abc-agent-identity.txt'
  const esperas = []

  try {
    await fsp.writeFile(path.join(contextDir, name), 'identidade', 'utf8')

    const result = await executarContexto(['read', name], {
      getContextDir: () => contextDir,
      esperar: async (ms) => esperas.push(ms),
    })

    assert.equal(result.saida, 'identidade')
    assert.deepEqual(esperas, [])
  } finally {
    await fsp.rm(contextDir, { recursive: true, force: true })
  }
})

test('tenta de novo antes de desistir: o artefato que aparece na segunda tentativa é lido', async () => {
  const name = 'felixo-context-123-abc-skills-manifest.txt'
  const esperas = []
  let leituras = 0
  // Primeira rodada: nem o vivo nem a cópia guardada. Segunda rodada: o vivo aparece.
  const readFile = async () => {
    leituras += 1
    if (leituras <= 2) throw ausente()
    return 'skills'
  }

  const result = await executarContexto(['read', name], {
    getContextDir: () => path.join(os.tmpdir(), 'felixo-context-cli-inexistente'),
    readFile,
    esperar: async (ms) => esperas.push(ms),
    recordDeliveryRead: async () => {},
  })

  assert.equal(result.codigo, 0)
  assert.equal(result.saida, 'skills')
  assert.equal(esperas.length, 1)
})

test('sem artefato vivo nem cópia guardada, desiste depois de três tentativas e libera o agente a seguir', async () => {
  const contextDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'felixo-context-cli-'))
  const name = 'felixo-context-1791213063512-93a7b9e2-05b2-4f4e-bdd4-c52f2752d8d1-initial-context.txt'
  const esperas = []

  try {
    const result = await executarContexto(['read', name], {
      getContextDir: () => contextDir,
      esperar: async (ms) => esperas.push(ms),
    })

    assert.equal(result.codigo, 1)
    assert.equal(result.saida, '')
    assert.ok(result.erro.startsWith(`Artefato de contexto não encontrado: ${name}.`))
    assert.match(result.erro, /gerado em 2026-10-05/)
    assert.match(result.erro, /Isso não impede o trabalho/)
    assert.match(result.erro, /continue com o que tem/)
    assert.match(result.erro, /Não substitua por outro artefato e não repita esta leitura/)
    assert.equal(esperas.length, 2)
  } finally {
    await fsp.rm(contextDir, { recursive: true, force: true })
  }
})

test('nome sem data reconhecível não ganha uma data inventada', async () => {
  const contextDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'felixo-context-cli-'))

  try {
    const result = await executarContexto(['read', 'felixo-context-0-abc-catalog-prompt.txt'], {
      getContextDir: () => contextDir,
      esperar: async () => {},
    })

    assert.equal(result.codigo, 1)
    assert.doesNotMatch(result.erro, /gerado em/)
  } finally {
    await fsp.rm(contextDir, { recursive: true, force: true })
  }
})

test('erro que não é de arquivo ausente não vira nova tentativa nem leitura da cópia guardada', async () => {
  const esperas = []
  let leituras = 0
  const readFile = async () => {
    leituras += 1
    throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })
  }

  const result = await executarContexto(['read', 'felixo-context-123-abc-handoff.txt'], {
    getContextDir: () => path.join(os.tmpdir(), 'felixo-context-cli-negado'),
    readFile,
    esperar: async (ms) => esperas.push(ms),
  })

  assert.equal(result.codigo, 2)
  assert.match(result.erro, /EACCES/)
  assert.equal(leituras, 1)
  assert.deepEqual(esperas, [])
})

test('a recuperação fica registrada no QA como leitura da cópia guardada', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'felixo-context-cli-recovered-'))
  const contextDir = path.join(root, 'context-deliveries')
  const deliveryLogDirectory = path.join(root, 'logs', 'qa')
  const name = 'felixo-context-123-recuperado.txt'

  try {
    await fsp.mkdir(path.join(contextDir, CONTEXT_EXPIRED_DIRNAME), { recursive: true })
    await fsp.writeFile(path.join(contextDir, CONTEXT_EXPIRED_DIRNAME, name), 'corpo guardado', 'utf8')

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
    assert.equal(entries.at(-1).details.artifactId, name)
    assert.equal(entries.at(-1).details.state, 'recovered')
    assert.equal(entries.at(-1).level, 'info')
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

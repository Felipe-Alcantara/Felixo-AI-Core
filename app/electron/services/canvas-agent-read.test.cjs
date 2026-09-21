'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const {
  descreverElemento,
  lerElemento,
  listarElementos,
  resolverCaminhoDoArquivo,
  ultimasLinhasDaSessao,
} = require('./canvas-agent-read.cjs')

const semRedacao = (texto) => texto
const readFileInexistente = async () => { throw new Error('ENOENT: arquivo não encontrado') }

test('descreverElemento usa data.label quando existe', () => {
  assert.equal(descreverElemento({ id: '1', type: 'terminal', data: { label: 'Claude · local' } }), 'Claude · local')
})

test('descreverElemento de nota usa a primeira linha não vazia do texto', () => {
  assert.equal(descreverElemento({ id: '1', type: 'note', data: { text: '\n\n# Título da nota\ncorpo' } }), '# Título da nota')
})

test('descreverElemento de nota vazia devolve um rótulo padrão', () => {
  assert.equal(descreverElemento({ id: '1', type: 'note', data: { text: '' } }), 'Nota sem título')
})

test('descreverElemento de arquivo usa fileLabel, senão o basename do caminho', () => {
  assert.equal(descreverElemento({ id: '1', type: 'file', data: { fileLabel: 'README' } }), 'README')
  assert.equal(descreverElemento({ id: '1', type: 'file', data: { filePath: '/home/felipe/projeto/README.md' } }), 'README.md')
})

test('descreverElemento de página usa a URL', () => {
  assert.equal(descreverElemento({ id: '1', type: 'webpage', data: { url: 'https://example.com' } }), 'https://example.com')
})

test('descreverElemento cai pro nome do tipo quando não há nada melhor', () => {
  assert.equal(descreverElemento({ id: '1', type: 'group', data: {} }), 'group')
})

test('listarElementos marca leituraSuportada por tipo', () => {
  const nodes = [
    { id: '1', type: 'terminal', data: {} },
    { id: '2', type: 'note', data: {} },
    { id: '3', type: 'file', data: {} },
    { id: '4', type: 'webpage', data: {} },
    { id: '5', type: 'group', data: {} },
  ]
  const listados = listarElementos(nodes)
  assert.deepEqual(listados.map((item) => [item.id, item.leituraSuportada]), [
    ['1', true],
    ['2', true],
    ['3', true],
    ['4', false],
    ['5', false],
  ])
})

test('ultimasLinhasDaSessao concatena os chunks e corta pras últimas N linhas', () => {
  const session = { chunks: [{ chunk: 'linha1\nlinha2\n' }, { chunk: 'linha3\nlinha4\n' }] }
  assert.equal(ultimasLinhasDaSessao(session, 2), 'linha3\nlinha4')
  assert.equal(ultimasLinhasDaSessao(session, 100), 'linha1\nlinha2\nlinha3\nlinha4')
})

test('ultimasLinhasDaSessao devolve string vazia quando não há saída nenhuma', () => {
  assert.equal(ultimasLinhasDaSessao({ chunks: [] }, 10), '')
  assert.equal(ultimasLinhasDaSessao({}, 10), '')
})

test('resolverCaminhoDoArquivo prioriza filePath (absoluto) sobre fileName (relativo à pasta do app)', () => {
  assert.equal(resolverCaminhoDoArquivo({ filePath: '/tmp/x.md', fileName: 'y.md' }, '/canvas-files'), '/tmp/x.md')
  assert.equal(resolverCaminhoDoArquivo({ fileName: 'y.md' }, '/canvas-files'), path.join('/canvas-files', 'y.md'))
  assert.equal(resolverCaminhoDoArquivo({}, '/canvas-files'), '')
})

test('lerElemento: id inexistente devolve ok:false com mensagem clara', async () => {
  const resultado = await lerElemento({
    id: 'nao-existe', nodes: [], terminalSessions: [], readFile: readFileInexistente, redact: semRedacao, canvasFilesDir: '/x',
  })
  assert.equal(resultado.ok, false)
  assert.match(resultado.message, /Nenhum elemento com id/)
})

test('lerElemento: terminal lê a sessão correspondente ao id do nó e aplica a redação', async () => {
  const nodes = [{ id: 'terminal-1', type: 'terminal', data: { label: 'Shell' } }]
  const terminalSessions = [{ sessionId: 'terminal-1', chunks: [{ chunk: 'token=abc123\n' }] }]
  const redatado = []
  const redact = (texto) => { redatado.push(texto); return 'REDIGIDO' }

  const resultado = await lerElemento({
    id: 'terminal-1', nodes, terminalSessions, readFile: readFileInexistente, redact, canvasFilesDir: '/x',
  })

  assert.equal(resultado.ok, true)
  assert.equal(resultado.content, 'REDIGIDO')
  assert.deepEqual(redatado, ['token=abc123'])
})

test('lerElemento: terminal com várias linhas mantém a quebra sem uma linha vazia extra no fim', async () => {
  const nodes = [{ id: 'terminal-1', type: 'terminal', data: {} }]
  const terminalSessions = [{ sessionId: 'terminal-1', chunks: [{ chunk: 'linha1\nlinha2\n' }] }]

  const resultado = await lerElemento({
    id: 'terminal-1', nodes, terminalSessions, readFile: readFileInexistente, redact: semRedacao, canvasFilesDir: '/x',
  })

  assert.equal(resultado.content, 'linha1\nlinha2')
})

test('lerElemento: terminal sem sessão registrada devolve ok:true com aviso, não erro', async () => {
  const nodes = [{ id: 'terminal-1', type: 'terminal', data: {} }]
  const resultado = await lerElemento({
    id: 'terminal-1', nodes, terminalSessions: [], readFile: readFileInexistente, redact: semRedacao, canvasFilesDir: '/x',
  })
  assert.equal(resultado.ok, true)
  assert.equal(resultado.content, '')
  assert.match(resultado.message, /sem saída registrada/)
})

test('lerElemento: nota devolve data.text redigido', async () => {
  const nodes = [{ id: 'note-1', type: 'note', data: { text: 'segredo: xyz' } }]
  const resultado = await lerElemento({
    id: 'note-1', nodes, terminalSessions: [], readFile: readFileInexistente, redact: (t) => t.replace('xyz', '***'), canvasFilesDir: '/x',
  })
  assert.equal(resultado.content, 'segredo: ***')
})

test('lerElemento: arquivo lê via readFile injetado e redige', async () => {
  const nodes = [{ id: 'file-1', type: 'file', data: { filePath: '/tmp/notas.md' } }]
  const lidos = []
  const readFile = async (caminho) => { lidos.push(caminho); return '# conteúdo' }

  const resultado = await lerElemento({
    id: 'file-1', nodes, terminalSessions: [], readFile, redact: semRedacao, canvasFilesDir: '/x',
  })

  assert.equal(resultado.ok, true)
  assert.equal(resultado.content, '# conteúdo')
  assert.deepEqual(lidos, ['/tmp/notas.md'])
})

test('lerElemento: imagem não tenta interpretar bytes binários como texto', async () => {
  const nodes = [{
    id: 'image-1',
    type: 'file',
    data: {
      filePath: '/tmp/generated.png',
      fileKind: 'image',
      image: { kind: 'generated-image', mimeType: 'image/png' },
    },
  }]
  let chamou = false
  const resultado = await lerElemento({
    id: 'image-1',
    nodes,
    terminalSessions: [],
    readFile: async () => {
      chamou = true
      return 'bytes'
    },
    redact: semRedacao,
    canvasFilesDir: '/x',
  })

  assert.equal(resultado.ok, true)
  assert.equal(resultado.content, '')
  assert.equal(chamou, false)
  assert.match(resultado.message, /preview/)
})

test('lerElemento: arquivo sem caminho configurado devolve ok:false sem tentar ler', async () => {
  const nodes = [{ id: 'file-1', type: 'file', data: {} }]
  let chamou = false
  const resultado = await lerElemento({
    id: 'file-1', nodes, terminalSessions: [], readFile: async () => { chamou = true; return '' }, redact: semRedacao, canvasFilesDir: '/x',
  })
  assert.equal(resultado.ok, false)
  assert.equal(chamou, false)
})

test('lerElemento: erro de leitura do arquivo vira ok:false com a mensagem, não lança', async () => {
  const nodes = [{ id: 'file-1', type: 'file', data: { filePath: '/tmp/nao-existe.md' } }]
  const resultado = await lerElemento({
    id: 'file-1', nodes, terminalSessions: [], readFile: readFileInexistente, redact: semRedacao, canvasFilesDir: '/x',
  })
  assert.equal(resultado.ok, false)
  assert.match(resultado.message, /ENOENT/)
})

test('lerElemento: tipo sem leitura suportada (ex.: webpage) devolve ok:false explicando o motivo, não trava', async () => {
  const nodes = [{ id: 'page-1', type: 'webpage', data: { url: 'https://example.com' } }]
  const resultado = await lerElemento({
    id: 'page-1', nodes, terminalSessions: [], readFile: readFileInexistente, redact: semRedacao, canvasFilesDir: '/x',
  })
  assert.equal(resultado.ok, false)
  assert.match(resultado.message, /ainda não tem leitura/)
})

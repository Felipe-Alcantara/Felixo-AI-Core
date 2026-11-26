'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  duracaoWav,
  listarPares,
  main,
  mediana,
  medirPares,
  parseArgs,
  tabela,
  transcrever,
  validarBaseUrl,
  wer,
} = require('./medir-transcricao-nuvem.cjs')

/** WAV mono de 16 bits a 16 kHz; `listaExtra` põe um chunk LIST de tamanho ímpar antes de data. */
function wavDeTeste(segundos, { listaExtra = false } = {}) {
  const bytesPorSegundo = 16000 * 2
  const dados = Buffer.alloc(Math.round(segundos * bytesPorSegundo))
  const fmt = Buffer.alloc(24)
  fmt.write('fmt ', 0, 'ascii')
  fmt.writeUInt32LE(16, 4)
  fmt.writeUInt16LE(1, 8)
  fmt.writeUInt16LE(1, 10)
  fmt.writeUInt32LE(16000, 12)
  fmt.writeUInt32LE(bytesPorSegundo, 16)
  fmt.writeUInt16LE(2, 20)
  fmt.writeUInt16LE(16, 22)
  const lista = listaExtra
    ? Buffer.concat([Buffer.from('LIST', 'ascii'), Buffer.from([5, 0, 0, 0]), Buffer.from('abcde', 'ascii'), Buffer.alloc(1)])
    : Buffer.alloc(0)
  const cabecalhoData = Buffer.alloc(8)
  cabecalhoData.write('data', 0, 'ascii')
  cabecalhoData.writeUInt32LE(dados.length, 4)
  const corpo = Buffer.concat([Buffer.from('WAVE', 'ascii'), fmt, lista, cabecalhoData, dados])
  const riff = Buffer.alloc(8)
  riff.write('RIFF', 0, 'ascii')
  riff.writeUInt32LE(corpo.length, 4)
  return Buffer.concat([riff, corpo])
}

function respostaFalsa(status, corpo) {
  return { ok: status >= 200 && status < 300, status, text: async () => corpo }
}

function pastaTemporaria() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'medir-nuvem-'))
}

test('wer ignora maiúsculas e pontuação e conta palavras trocadas, sobrando e faltando', () => {
  assert.equal(wer('Bom dia, pessoal!', 'bom dia pessoal'), 0)
  assert.equal(wer('Eu quero um café.', 'eu quero café'), 0.25)
  assert.equal(wer('um dois três quatro', 'um dois cinco quatro'), 0.25)
  assert.equal(wer('um dois três', 'um dois três quatro'), 1 / 3)
  assert.equal(wer('um dois três', ''), 1)
})

test('mediana de quantidade ímpar, par e vazia', () => {
  assert.equal(mediana([3, 1, 2]), 2)
  assert.equal(mediana([4, 1, 3, 2]), 2.5)
  assert.equal(mediana([]), null)
})

test('duracaoWav lê o cabeçalho e pula chunks extras', () => {
  assert.equal(duracaoWav(wavDeTeste(2)), 2)
  assert.equal(duracaoWav(wavDeTeste(1.5, { listaExtra: true })), 1.5)
  assert.throws(() => duracaoWav(Buffer.from('não é um wav')), /não é WAV/)
})

test('validarBaseUrl aceita https e localhost, e recusa http externo ou com senha', () => {
  assert.equal(validarBaseUrl('https://api.openai.com/v1/'), 'https://api.openai.com/v1')
  assert.equal(validarBaseUrl('http://127.0.0.1:8765/v1'), 'http://127.0.0.1:8765/v1')
  assert.throws(() => validarBaseUrl('http://exemplo.com/v1'), /https/)
  assert.throws(() => validarBaseUrl('https://usuario:senha@exemplo.com/v1'), /usuário/)
})

test('parseArgs lê a pasta e as opções, e recusa preço inválido ou pasta ausente', () => {
  const opcoes = parseArgs(['pasta', '--saida', 'r.json', '--preco-min', '0.002'])
  assert.equal(opcoes.pasta, 'pasta')
  assert.equal(opcoes.saida, 'r.json')
  assert.equal(opcoes.preco, 0.002)
  assert.equal(opcoes.modelo, 'whisper-1')
  assert.throws(() => parseArgs(['pasta', '--preco-min', 'abc']), /--preco-min/)
  assert.throws(() => parseArgs(['--saida', 'r.json']), /pasta/)
})

test('transcrever manda o pedido do ditado e devolve o texto sem espaços sobrando', async () => {
  let pedido = null
  const fetchFalso = async (url, init) => {
    pedido = { url, init }
    return respostaFalsa(200, JSON.stringify({ text: ' Olá, mundo. ' }))
  }
  const resultado = await transcrever({
    baseUrl: 'https://api.exemplo.com/v1',
    modelo: 'whisper-1',
    chave: 'chave-falsa-do-teste-0000',
    audio: Buffer.alloc(8),
    nome: '01.wav',
    fetchImpl: fetchFalso,
  })
  assert.equal(pedido.url, 'https://api.exemplo.com/v1/audio/transcriptions')
  assert.equal(pedido.init.method, 'POST')
  assert.equal(pedido.init.headers.Authorization, 'Bearer chave-falsa-do-teste-0000')
  assert.equal(pedido.init.body.get('model'), 'whisper-1')
  assert.equal(pedido.init.body.get('language'), 'pt')
  assert.equal(pedido.init.body.get('response_format'), 'json')
  assert.equal(pedido.init.body.get('file').type, 'audio/wav')
  assert.equal(resultado.ok, true)
  assert.equal(resultado.texto, 'Olá, mundo.')
  assert.ok(resultado.latenciaS >= 0)
})

test('transcrever não expõe a chave, nem quando a API a ecoa no erro', async () => {
  const chave = 'chave-falsa-do-teste-0001'
  const fetchFalso = async () =>
    respostaFalsa(401, JSON.stringify({ error: { message: `Incorrect API key provided: ${chave}` } }))
  const resultado = await transcrever({
    baseUrl: 'https://api.exemplo.com/v1',
    modelo: 'whisper-1',
    chave,
    audio: Buffer.alloc(8),
    nome: '01.wav',
    fetchImpl: fetchFalso,
  })
  assert.equal(resultado.ok, false)
  assert.match(resultado.erro, /^HTTP 401/)
  assert.ok(!resultado.erro.includes(chave))
  assert.ok(resultado.erro.includes('[chave]'))
})

test('transcrever esconde também o pedaço da chave que a API devolve mascarado', async () => {
  for (const eco of ['sk-proj-ab************0000', 'gsk_abcd********wxyz']) {
    const resultado = await transcrever({
      baseUrl: 'https://api.exemplo.com/v1',
      modelo: 'whisper-1',
      chave: 'chave-falsa-do-teste-0003',
      audio: Buffer.alloc(8),
      nome: '01.wav',
      fetchImpl: async () => respostaFalsa(401, JSON.stringify({ error: { message: `Incorrect API key provided: ${eco}.` } })),
    })
    assert.ok(!resultado.erro.includes(eco.slice(0, 8)), resultado.erro)
    assert.ok(resultado.erro.includes('[chave]'))
  }
})

test('com mínimo por pedido, o custo usa o tempo cobrado e o áudio continua o real', async () => {
  const pares = [1, 2].map((s) => ({ nome: `0${s}`, wav: Buffer.alloc(8), referencia: 'oi', duracaoS: s * 3 }))
  const { itens, resumo } = await medirPares({
    pares, baseUrl: 'https://api.exemplo.com/v1', modelo: 'm', chave: 'chave-falsa', preco: 0.6, minimoS: 10,
    fetchImpl: async () => respostaFalsa(200, JSON.stringify({ text: 'oi' })),
  })
  assert.ok(Math.abs(itens[0].custoUsd - 0.1) < 1e-12)
  assert.ok(Math.abs(resumo.custoUsd - 0.2) < 1e-12)
  assert.equal(resumo.minutos, 9 / 60)
})

test('tabela sai com vírgula decimal, marca a falha e troca a barra vertical do erro', () => {
  const texto = tabela({
    itens: [
      { arquivo: '01', duracaoS: 3.25, latenciaS: 1.8, wer: 0.125, texto: 'x' },
      { arquivo: '02', duracaoS: 2, latenciaS: 0.5, erro: 'HTTP 500: falhou | aqui' },
    ],
    resumo: {
      pedidos: 2,
      falhas: 1,
      medianaLatenciaS: 1.8,
      werMedio: 0.125,
      minutos: 0.054,
      precoUsdPorMinuto: 0.006,
      custoUsd: 0.00032,
    },
  })
  assert.match(texto, /\| 01 \| 3,3 s \| 1,80 s \| 12,5% \|/)
  assert.match(texto, /\| 02 \| 2,0 s \| 0,50 s \| — \| HTTP 500: falhou \/ aqui \|/)
  assert.match(texto, /Mediana de latência: 1,80 s/)
})

test('listarPares recusa uma pasta com WAV sem transcrição oficial', () => {
  const pasta = pastaTemporaria()
  try {
    fs.writeFileSync(path.join(pasta, '01.wav'), wavDeTeste(1))
    assert.throws(() => listarPares(pasta), /01\.txt/)
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true })
  }
})

test('main mede a pasta, grava o JSON e nunca imprime a chave', async () => {
  const pasta = pastaTemporaria()
  try {
    fs.writeFileSync(path.join(pasta, '01.wav'), wavDeTeste(1))
    fs.writeFileSync(path.join(pasta, '01.txt'), 'Bom dia a todos.\n')
    fs.writeFileSync(path.join(pasta, '02.wav'), wavDeTeste(2))
    fs.writeFileSync(path.join(pasta, '02.txt'), 'Obrigado')
    const chave = 'chave-falsa-do-teste-0002'
    const saida = path.join(pasta, 'resultado.json')
    const textos = ['Bom dia a todos', 'Obrigada']
    const cabecalhos = []
    const fetchFalso = async (url, init) => {
      cabecalhos.push(init.headers.Authorization)
      return respostaFalsa(200, JSON.stringify({ text: textos[cabecalhos.length - 1] }))
    }
    const saidas = []
    const codigo = await main(
      ['--saida', saida, '--base-url', 'https://api.exemplo.com/v1', '--preco-min', '0.006', pasta],
      { ambiente: { FELIXO_CHAVE_TRANSCRICAO: chave }, fetchImpl: fetchFalso, imprimir: (texto) => saidas.push(texto) },
    )
    const json = fs.readFileSync(saida, 'utf8')
    const registro = JSON.parse(json)
    assert.equal(codigo, 0)
    assert.deepEqual(cabecalhos, [`Bearer ${chave}`, `Bearer ${chave}`])
    assert.equal(registro.resumo.pedidos, 2)
    assert.equal(registro.resumo.falhas, 0)
    assert.equal(registro.itens[0].wer, 0)
    assert.equal(registro.itens[1].wer, 1)
    assert.ok(Math.abs(registro.resumo.custoUsd - 0.0003) < 1e-12)
    assert.ok(!json.includes(chave))
    assert.ok(!saidas.join('\n').includes(chave))
    assert.match(saidas.join('\n'), /Mediana de latência/)
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true })
  }
})

test('main recusa rodar sem a variável de chave, sem chamar a API', async () => {
  const erros = []
  const codigo = await main(['pasta-qualquer'], {
    ambiente: {},
    fetchImpl: async () => {
      throw new Error('a API não deveria ser chamada sem chave')
    },
    imprimirErro: (texto) => erros.push(texto),
  })
  assert.equal(codigo, 2)
  assert.match(erros.join('\n'), /FELIXO_CHAVE_TRANSCRICAO/)
})

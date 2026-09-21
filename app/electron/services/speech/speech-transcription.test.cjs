const test = require('node:test')
const assert = require('node:assert/strict')
const { MAX_AUDIO_BYTES, baseMimeType, transcribeAudio } = require('./speech-transcription.cjs')

const CONFIG = { baseUrl: 'https://api.exemplo.com/v1', model: 'whisper-1', language: 'pt' }
const AUDIO = new Uint8Array(4096).fill(7)

function respostaFalsa({ status = 200, body = { text: 'olá mundo' } } = {}) {
  const chamadas = []
  const fetchImpl = async (url, init) => {
    chamadas.push({ url, init })
    return { ok: status >= 200 && status < 300, status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) }
  }
  return { fetchImpl, chamadas }
}

test('envia multipart para /audio/transcriptions com a chave só no cabeçalho', async () => {
  const { fetchImpl, chamadas } = respostaFalsa()
  const result = await transcribeAudio({ audio: AUDIO, mimeType: 'audio/webm;codecs=opus', config: CONFIG, apiKey: 'sk-abc', fetchImpl })
  assert.deepEqual(result, { ok: true, text: 'olá mundo' })
  assert.equal(chamadas[0].url, 'https://api.exemplo.com/v1/audio/transcriptions')
  assert.equal(chamadas[0].init.headers.Authorization, 'Bearer sk-abc')
  const form = chamadas[0].init.body
  assert.equal(form.get('model'), 'whisper-1')
  assert.equal(form.get('language'), 'pt')
  assert.equal(form.get('file').name, 'ditado.webm')
  // A chave nunca vai no corpo (que poderia ser logado por um proxy).
  assert.equal([...form.values()].some((v) => typeof v === 'string' && v.includes('sk-abc')), false)
})

test('sem chave, formato estranho, áudio curto ou grande demais: recusa antes de qualquer rede', async () => {
  const { fetchImpl, chamadas } = respostaFalsa()
  const base = { config: CONFIG, apiKey: 'sk', fetchImpl }
  assert.match((await transcribeAudio({ ...base, audio: AUDIO, mimeType: 'audio/webm', apiKey: '' })).message, /Cadastre a chave/)
  assert.match((await transcribeAudio({ ...base, audio: AUDIO, mimeType: 'video/mp4' })).message, /não suportado/)
  assert.match((await transcribeAudio({ ...base, audio: new Uint8Array(10), mimeType: 'audio/webm' })).message, /curta demais/)
  assert.match((await transcribeAudio({ ...base, audio: new Uint8Array(MAX_AUDIO_BYTES + 1), mimeType: 'audio/webm' })).message, /10 MB/)
  assert.equal(chamadas.length, 0)
})

test('mapeia os erros da API em mensagens claras (401, 404, 413, 429)', async () => {
  const mensagem = async (status) =>
    (await transcribeAudio({ audio: AUDIO, mimeType: 'audio/webm', config: CONFIG, apiKey: 'sk', fetchImpl: respostaFalsa({ status, body: {} }).fetchImpl })).message
  assert.match(await mensagem(401), /chave.*recusada/)
  assert.match(await mensagem(403), /chave.*recusada/)
  assert.match(await mensagem(404), /não foi encontrado/)
  assert.match(await mensagem(413), /grande demais/)
  assert.match(await mensagem(429), /limite/)
})

test('mensagem de erro da API que ecoa a chave passa pela redação', async () => {
  const segredo = 'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789'
  const { fetchImpl } = respostaFalsa({ status: 400, body: { error: { message: `Incorrect API key provided: ${segredo}` } } })
  const result = await transcribeAudio({ audio: AUDIO, mimeType: 'audio/webm', config: CONFIG, apiKey: segredo, fetchImpl })
  assert.equal(result.ok, false)
  assert.equal(result.message.includes(segredo), false)
})

test('resposta sem texto, resposta ilegível e falha de rede viram mensagens, não exceções', async () => {
  const chama = (fetchImpl) => transcribeAudio({ audio: AUDIO, mimeType: 'audio/webm', config: CONFIG, apiKey: 'sk', fetchImpl })
  assert.match((await chama(respostaFalsa({ body: { text: '   ' } }).fetchImpl)).message, /Não entendi nada/)
  assert.match((await chama(respostaFalsa({ body: '<html>' }).fetchImpl)).message, /resposta que não entendi/)
  assert.match((await chama(async () => { throw new Error('ECONNREFUSED') })).message, /Não foi possível falar/)
  const abort = async () => { const e = new Error('x'); e.name = 'AbortError'; throw e }
  assert.match((await chama(abort)).message, /demorou demais/)
})

test('baseMimeType tira os parâmetros do tipo', () => {
  assert.equal(baseMimeType('audio/webm;codecs=opus'), 'audio/webm')
  assert.equal(baseMimeType('AUDIO/OGG'), 'audio/ogg')
  assert.equal(baseMimeType(undefined), '')
})

// ── Servidor HTTP de verdade (loopback), sem `fetch` falso ─────────────────

const http = require('node:http')
const { Readable } = require('node:stream')

/** Sobe um servidor que se comporta como uma API compatível: lê o multipart de verdade. */
function servidorLocal(responder) {
  const recebidos = []
  const server = http.createServer(async (req, res) => {
    const request = new Request(`http://127.0.0.1${req.url}`, {
      method: req.method,
      headers: req.headers,
      body: Readable.toWeb(req),
      duplex: 'half',
    })
    let form
    try {
      form = await request.formData()
    } catch {
      res.writeHead(400).end('multipart inválido')
      return
    }
    const arquivo = form.get('file')
    recebidos.push({
      method: req.method,
      url: req.url,
      authorization: req.headers.authorization,
      model: form.get('model'),
      language: form.get('language'),
      responseFormat: form.get('response_format'),
      filename: arquivo?.name,
      type: arquivo?.type,
      size: arquivo?.size,
    })
    const { status = 200, body = { text: 'texto do servidor local' } } = responder?.(recebidos.length) ?? {}
    res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      resolve({ port, recebidos, fechar: () => new Promise((done) => server.close(done)) })
    })
  })
}

const LOCAL = (port) => ({ baseUrl: `http://127.0.0.1:${port}/v1`, model: 'base', language: 'pt' })

test('servidor local (loopback): funciona SEM chave e não manda cabeçalho de autorização', async () => {
  const servidor = await servidorLocal()
  try {
    const result = await transcribeAudio({ audio: AUDIO, mimeType: 'audio/webm;codecs=opus', config: LOCAL(servidor.port), apiKey: '' })
    assert.deepEqual(result, { ok: true, text: 'texto do servidor local' })
    assert.equal(servidor.recebidos[0].authorization, undefined)
  } finally {
    await servidor.fechar()
  }
})

test('o pedido chega a um servidor HTTP real como multipart válido, no caminho e com os campos que a API espera', async () => {
  const servidor = await servidorLocal()
  try {
    await transcribeAudio({ audio: AUDIO, mimeType: 'audio/webm;codecs=opus', config: LOCAL(servidor.port), apiKey: '' })
    assert.deepEqual(servidor.recebidos[0], {
      method: 'POST',
      url: '/v1/audio/transcriptions',
      authorization: undefined,
      model: 'base',
      language: 'pt',
      responseFormat: 'json',
      filename: 'ditado.webm',
      type: 'audio/webm',
      size: AUDIO.byteLength,
    })
  } finally {
    await servidor.fechar()
  }
})

test('servidor local COM chave configurada ainda manda o Bearer (a chave, se existe, é usada)', async () => {
  const servidor = await servidorLocal()
  try {
    await transcribeAudio({ audio: AUDIO, mimeType: 'audio/webm', config: LOCAL(servidor.port), apiKey: 'sk-local' })
    assert.equal(servidor.recebidos[0].authorization, 'Bearer sk-local')
  } finally {
    await servidor.fechar()
  }
})

test('nuvem (não-loopback) SEM chave continua recusada antes de qualquer rede', async () => {
  const { fetchImpl, chamadas } = respostaFalsa()
  const result = await transcribeAudio({ audio: AUDIO, mimeType: 'audio/webm', config: CONFIG, apiKey: '', fetchImpl })
  assert.equal(result.ok, false)
  assert.match(result.message, /Cadastre a chave/)
  assert.equal(chamadas.length, 0)
})

test('erro do servidor local vira mensagem, e servidor local DESLIGADO diz para conferir se está rodando (rede real)', async () => {
  const quebrado = await servidorLocal(() => ({ status: 500, body: { error: { message: 'modelo não carregado' } } }))
  try {
    const result = await transcribeAudio({ audio: AUDIO, mimeType: 'audio/webm', config: LOCAL(quebrado.port), apiKey: '' })
    assert.equal(result.ok, false)
    assert.match(result.message, /500.*modelo não carregado/)
  } finally {
    await quebrado.fechar()
  }

  // Porta que acabou de ser fechada: a conexão é recusada de verdade.
  const desligado = await servidorLocal()
  const port = desligado.port
  await desligado.fechar()
  const result = await transcribeAudio({ audio: AUDIO, mimeType: 'audio/webm', config: LOCAL(port), apiKey: '' })
  assert.equal(result.ok, false)
  assert.match(result.message, /servidor local de transcrição.*rodando/)
})

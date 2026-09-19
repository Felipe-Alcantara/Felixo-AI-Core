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

'use strict'

const { redactSensitiveText } = require('../git-secret-redaction.cjs')
const { isLoopbackBaseUrl } = require('./speech-settings-store.cjs')

const MIN_AUDIO_BYTES = 1024
const MAX_AUDIO_BYTES = 10 * 1024 * 1024
const REQUEST_TIMEOUT_MS = 60_000
const AUDIO_TYPES = new Map([
  ['audio/webm', 'webm'],
  ['audio/ogg', 'ogg'],
  ['audio/mp4', 'mp4'],
  ['audio/mpeg', 'mp3'],
  ['audio/wav', 'wav'],
])

/** Tipo de áudio sem os parâmetros ("audio/webm;codecs=opus" → "audio/webm"). */
function baseMimeType(value) {
  return typeof value === 'string' ? value.split(';')[0].trim().toLowerCase() : ''
}

function apiErrorMessage(status, bodyText) {
  if (status === 401 || status === 403) return 'A chave da API de transcrição foi recusada. Confira a chave nas configurações.'
  if (status === 404) return 'O modelo ou o endereço de transcrição não foi encontrado. Confira as configurações.'
  if (status === 413) return 'O áudio é grande demais para a API. Grave um trecho menor.'
  if (status === 429) return 'O limite da API de transcrição foi atingido. Tente de novo em instantes.'
  let detail = ''
  try {
    const parsed = JSON.parse(bodyText)
    detail = parsed?.error?.message ?? parsed?.message ?? ''
  } catch {
    // Corpo que não é JSON não vira mensagem.
  }
  // Mensagens de erro de API costumam ecoar parte da chave ("Incorrect API key
  // provided: sk-…"): passa pela redação antes de chegar a qualquer tela.
  const safe = redactSensitiveText(String(detail)).slice(0, 200)
  return `A API de transcrição respondeu ${status}${safe ? `: ${safe}` : '.'}`
}

/**
 * Envia um áudio a uma API de transcrição compatível com a da OpenAI
 * (`POST {baseUrl}/audio/transcriptions`) e devolve o texto.
 *
 * `fetchImpl` é injetável: o teste não faz rede. O áudio e a chave só passam
 * por aqui, no processo principal.
 *
 * @returns {Promise<{ ok: true, text: string } | { ok: false, message: string }>}
 */
async function transcribeAudio({ audio, mimeType, config, apiKey, fetchImpl = globalThis.fetch }) {
  // Servidor local (loopback) não pede chave: o áudio não sai da máquina. Já a
  // nuvem exige, e nunca se manda uma requisição sem credencial para fora.
  const local = isLoopbackBaseUrl(config.baseUrl)
  if (!apiKey && !local) {
    return { ok: false, message: 'Cadastre a chave da API de transcrição nas configurações do ditado.' }
  }
  const type = baseMimeType(mimeType)
  const extension = AUDIO_TYPES.get(type)
  if (!extension) return { ok: false, message: `Formato de áudio não suportado: ${type || 'desconhecido'}.` }

  const bytes = audio instanceof Uint8Array ? audio : audio ? new Uint8Array(audio) : new Uint8Array(0)
  if (bytes.byteLength < MIN_AUDIO_BYTES) return { ok: false, message: 'A gravação ficou curta demais. Tente de novo.' }
  if (bytes.byteLength > MAX_AUDIO_BYTES) return { ok: false, message: 'A gravação passou do limite de 10 MB. Grave um trecho menor.' }

  const form = new FormData()
  form.append('file', new Blob([bytes], { type }), `ditado.${extension}`)
  form.append('model', config.model)
  form.append('language', config.language)
  form.append('response_format', 'json')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetchImpl(`${config.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      // Sem chave (servidor local) não há cabeçalho de autorização.
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      body: form,
      signal: controller.signal,
    })
    const bodyText = await response.text()
    if (!response.ok) return { ok: false, message: apiErrorMessage(response.status, bodyText) }
    let text = ''
    try {
      text = String(JSON.parse(bodyText)?.text ?? '')
    } catch {
      return { ok: false, message: 'A API de transcrição devolveu uma resposta que não entendi.' }
    }
    const trimmed = text.trim()
    return trimmed
      ? { ok: true, text: trimmed }
      : { ok: false, message: 'Não entendi nada nessa gravação. Tente falar mais perto do microfone.' }
  } catch (error) {
    if (error?.name === 'AbortError') return { ok: false, message: 'A transcrição demorou demais e foi cancelada.' }
    return {
      ok: false,
      message: local
        ? 'Não consegui falar com o servidor local de transcrição. Confira se ele está rodando no endereço configurado.'
        : 'Não foi possível falar com a API de transcrição. Confira a conexão e o endereço.',
    }
  } finally {
    clearTimeout(timer)
  }
}

module.exports = { MAX_AUDIO_BYTES, MIN_AUDIO_BYTES, baseMimeType, transcribeAudio }

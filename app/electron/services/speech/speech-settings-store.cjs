'use strict'

const fs = require('node:fs')
const path = require('node:path')

const CONFIG_FILE = 'speech-config.json'
const SECRET_FILE = 'speech-key.bin'

const DEFAULT_CONFIG = Object.freeze({
  baseUrl: 'https://api.openai.com/v1',
  // whisper-1 é aceito por praticamente toda API compatível com a da OpenAI;
  // quem usar Groq/outro troca o modelo no campo.
  model: 'whisper-1',
  language: 'pt',
})

const MODEL_MAX = 80
const LANGUAGE_PATTERN = /^[a-z]{2,3}$/

/**
 * Só endereço seguro recebe a chave: https, ou http em loopback (servidor
 * local de transcrição). Qualquer outro esquema/host em texto puro mandaria a
 * chave e o áudio pela rede sem cifra.
 */
function normalizeBaseUrl(value) {
  if (typeof value !== 'string') return null
  let url
  try {
    url = new URL(value.trim())
  } catch {
    return null
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) return null
  if (url.username || url.password) return null
  return url.toString().replace(/\/+$/, '')
}

function normalizeConfig(value) {
  const raw = value && typeof value === 'object' ? value : {}
  const baseUrl = normalizeBaseUrl(raw.baseUrl) ?? DEFAULT_CONFIG.baseUrl
  const model = typeof raw.model === 'string' && raw.model.trim() ? raw.model.trim().slice(0, MODEL_MAX) : DEFAULT_CONFIG.model
  // "pt-BR" vira "pt": a API pede o código ISO-639-1.
  const language = typeof raw.language === 'string' ? raw.language.trim().toLowerCase().slice(0, 2) : ''
  return { baseUrl, model, language: LANGUAGE_PATTERN.test(language) ? language : DEFAULT_CONFIG.language }
}

/**
 * Configuração do ditado por voz. A chave da API de transcrição fica cifrada
 * pelo `safeStorage` do sistema, em arquivo próprio: o renderer só descobre se
 * ela existe (`keyConfigured`) e nunca a recebe de volta. Sem cifra disponível
 * (ex.: Linux sem keyring) a chave NÃO é gravada em texto puro — o erro diz
 * por quê, em vez de guardar em silêncio algo inseguro.
 */
function createSpeechSettingsStore({ userData, safeStorage, fileSystem = fs } = {}) {
  if (typeof userData !== 'string' || !userData.trim()) {
    throw new Error('createSpeechSettingsStore requer userData.')
  }
  const dir = path.join(userData, 'config')
  const configPath = path.join(dir, CONFIG_FILE)
  const secretPath = path.join(dir, SECRET_FILE)

  function readConfig() {
    try {
      return normalizeConfig(JSON.parse(fileSystem.readFileSync(configPath, 'utf8')))
    } catch {
      return { ...DEFAULT_CONFIG }
    }
  }

  function chmodPrivate(file) {
    try {
      fileSystem.chmodSync(file, 0o600)
    } catch {
      // Windows e alguns sistemas de arquivos não têm modo POSIX.
    }
  }

  function readKey() {
    if (!safeStorage?.isEncryptionAvailable?.()) return ''
    try {
      return safeStorage.decryptString(fileSystem.readFileSync(secretPath))
    } catch {
      return ''
    }
  }

  return {
    getConfig() {
      return { ...readConfig(), keyConfigured: Boolean(readKey()) }
    },
    saveConfig(next) {
      const config = normalizeConfig(next)
      fileSystem.mkdirSync(dir, { recursive: true })
      fileSystem.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
      chmodPrivate(configPath)
      return config
    },
    setKey(key) {
      const value = typeof key === 'string' ? key.trim() : ''
      if (!value) throw new Error('Informe a chave da API de transcrição.')
      if (!safeStorage?.isEncryptionAvailable?.()) {
        throw new Error(
          'Este sistema não oferece armazenamento cifrado (no Linux, um keyring como o GNOME Keyring ou o KWallet). Por segurança a chave não é gravada sem cifra.',
        )
      }
      fileSystem.mkdirSync(dir, { recursive: true })
      fileSystem.writeFileSync(secretPath, safeStorage.encryptString(value), { mode: 0o600 })
      chmodPrivate(secretPath)
    },
    clearKey() {
      try {
        fileSystem.rmSync(secretPath, { force: true })
      } catch {
        // Nada a limpar.
      }
    },
    /** Só o processo principal chama isto, imediatamente antes da requisição. */
    readKeyForRequest: readKey,
    readConfig,
  }
}

module.exports = { DEFAULT_CONFIG, createSpeechSettingsStore, normalizeBaseUrl, normalizeConfig }

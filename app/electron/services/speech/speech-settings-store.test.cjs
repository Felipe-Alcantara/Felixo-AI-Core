const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  DEFAULT_CONFIG,
  createSpeechSettingsStore,
  isLoopbackBaseUrl,
  normalizeBaseUrl,
  normalizeConfig,
} = require('./speech-settings-store.cjs')

// "Cifra" de brinquedo, só para provar que o arquivo NÃO guarda a chave em texto puro.
const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (text) => Buffer.from(`ENC:${Buffer.from(text).toString('base64')}`),
  decryptString: (buffer) => Buffer.from(buffer.toString().replace(/^ENC:/, ''), 'base64').toString(),
}

function comPasta(run) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-speech-'))
  try {
    return run(userData)
  } finally {
    fs.rmSync(userData, { recursive: true, force: true })
  }
}

test('só https (ou http em loopback) recebe a chave; o resto cai no padrão', () => {
  assert.equal(normalizeBaseUrl('https://api.groq.com/openai/v1/'), 'https://api.groq.com/openai/v1')
  assert.equal(normalizeBaseUrl('http://localhost:8080/v1'), 'http://localhost:8080/v1')
  assert.equal(normalizeBaseUrl('http://127.0.0.1:9000'), 'http://127.0.0.1:9000')
  for (const ruim of ['http://api.exemplo.com/v1', 'ftp://x', 'file:///etc', 'javascript:1', 'https://user:pass@x.com', '', null, 3]) {
    assert.equal(normalizeBaseUrl(ruim), null, String(ruim))
  }
  assert.equal(normalizeConfig({ baseUrl: 'http://api.exemplo.com' }).baseUrl, DEFAULT_CONFIG.baseUrl)
})

test('normalizeConfig: idioma vira o código de 2 letras, modelo vazio volta ao padrão', () => {
  assert.equal(normalizeConfig({ language: 'pt-BR' }).language, 'pt')
  assert.equal(normalizeConfig({ language: 'EN' }).language, 'en')
  assert.equal(normalizeConfig({ language: '12' }).language, 'pt')
  assert.equal(normalizeConfig({ model: '  ' }).model, 'whisper-1')
  assert.equal(normalizeConfig(undefined).baseUrl, DEFAULT_CONFIG.baseUrl)
})

test('a chave é gravada cifrada, nunca em texto puro, e o renderer só vê "configurada"', () => {
  comPasta((userData) => {
    const store = createSpeechSettingsStore({ userData, safeStorage })
    assert.equal(store.getConfig().keyConfigured, false)
    store.setKey('  sk-segredo-123  ')
    assert.equal(store.getConfig().keyConfigured, true)
    assert.equal('key' in store.getConfig(), false)
    assert.equal(store.readKeyForRequest(), 'sk-segredo-123')
    for (const arquivo of fs.readdirSync(path.join(userData, 'config'))) {
      const conteudo = fs.readFileSync(path.join(userData, 'config', arquivo), 'latin1')
      assert.equal(conteudo.includes('sk-segredo-123'), false, `${arquivo} vazou a chave`)
    }
  })
})

test('sem cifra disponível a chave NÃO é gravada, e o erro explica o porquê', () => {
  comPasta((userData) => {
    const semCifra = { ...safeStorage, isEncryptionAvailable: () => false }
    const store = createSpeechSettingsStore({ userData, safeStorage: semCifra })
    assert.throws(() => store.setKey('sk-x'), /armazenamento cifrado/)
    assert.equal(fs.existsSync(path.join(userData, 'config', 'speech-key.bin')), false)
    assert.equal(store.getConfig().keyConfigured, false)
  })
})

test('chave vazia é recusada; apagar a chave a remove', () => {
  comPasta((userData) => {
    const store = createSpeechSettingsStore({ userData, safeStorage })
    assert.throws(() => store.setKey('   '), /Informe a chave/)
    store.setKey('sk-x')
    store.clearKey()
    assert.equal(store.getConfig().keyConfigured, false)
  })
})

test('a config persiste e um arquivo corrompido volta ao padrão sem quebrar', () => {
  comPasta((userData) => {
    const store = createSpeechSettingsStore({ userData, safeStorage })
    store.saveConfig({ baseUrl: 'https://api.groq.com/openai/v1', model: 'whisper-large-v3-turbo', language: 'pt-BR' })
    assert.deepEqual(store.readConfig(), { baseUrl: 'https://api.groq.com/openai/v1', model: 'whisper-large-v3-turbo', language: 'pt' })
    fs.writeFileSync(path.join(userData, 'config', 'speech-config.json'), '{ nao json')
    assert.deepEqual(store.readConfig(), { ...DEFAULT_CONFIG })
  })
})

test('isLoopbackBaseUrl: só endereços desta máquina contam como servidor local', () => {
  for (const local of ['http://localhost:8080/v1', 'http://127.0.0.1:9000', 'https://localhost/v1']) {
    assert.equal(isLoopbackBaseUrl(local), true, local)
  }
  for (const remoto of ['https://api.openai.com/v1', 'http://192.168.0.5:8080', 'https://localhost.evil.com/v1', 'http://x', '', null]) {
    assert.equal(isLoopbackBaseUrl(remoto), false, String(remoto))
  }
})

test('a config diz se a chave é exigida: nuvem sim, servidor local não', () => {
  comPasta((userData) => {
    const store = createSpeechSettingsStore({ userData, safeStorage })
    assert.equal(store.getConfig().keyRequired, true)
    store.saveConfig({ baseUrl: 'http://127.0.0.1:8080/v1', model: 'base', language: 'pt' })
    assert.equal(store.getConfig().keyRequired, false)
    store.saveConfig({ baseUrl: 'https://api.groq.com/openai/v1', model: 'm', language: 'pt' })
    assert.equal(store.getConfig().keyRequired, true)
  })
})

require('../../../scripts/test-support/pasta-do-teste.cjs') // isola o temporário deste arquivo (ver pasta-do-teste.cjs)
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { createMcpRegistry } = require('./mcp-registry.cjs')

function fakeSafeStorage(backend = 'os_crypt', available = true) {
  return {
    isEncryptionAvailable: () => available,
    getSelectedStorageBackend: () => backend,
    encryptString: (value) => Buffer.from(value, 'utf8').toString('base64'),
    decryptString: (value) => Buffer.from(Buffer.isBuffer(value) ? value.toString('utf8') : value, 'base64').toString('utf8'),
  }
}

function withRegistry(run, safeStorage = fakeSafeStorage()) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-mcp-registry-'))
  try {
    run(createMcpRegistry({ userData, safeStorage }), userData)
  } finally {
    fs.rmSync(userData, { recursive: true, force: true })
  }
}

const obs = {
  id: 'obs',
  nome: 'OBS',
  transporte: 'stdio',
  comando: 'obs-mcp.exe',
  args: ['--porta', '4455'],
  env: { OBS_HOST: 'localhost', OBS_PASSWORD: 'nao-pode-ir-para-o-json' },
  segredos: ['OBS_PASSWORD'],
}

test('o segredo fica so no cofre: a definicao e a lista publica nao o carregam', () => {
  withRegistry((registry, userData) => {
    const saved = registry.save(obs, { OBS_PASSWORD: 's3gredo' })
    assert.deepEqual(saved.segredosConfigurados, ['OBS_PASSWORD'])
    assert.equal(saved.env.OBS_PASSWORD, undefined)
    for (const file of ['servers.json', 'secrets.bin']) {
      assert.equal(fs.readFileSync(path.join(userData, 'mcp', file), 'utf8').includes('s3gredo'), false)
    }
    assert.equal(fs.readFileSync(path.join(userData, 'mcp', 'servers.json'), 'utf8').includes('nao-pode-ir'), false)
    assert.equal(JSON.stringify(registry.list()).includes('s3gredo'), false)
    assert.deepEqual(registry.resolve(['obs'])[0].secretValues, { OBS_PASSWORD: 's3gredo' })
  })
})

test('salvar de novo sem o valor mantem o segredo; string vazia remove; remover apaga tudo', () => {
  withRegistry((registry) => {
    registry.save(obs, { OBS_PASSWORD: 's3gredo' })
    registry.save({ ...obs, nome: 'OBS Studio' })
    assert.equal(registry.resolve(['obs'])[0].secretValues.OBS_PASSWORD, 's3gredo')
    assert.deepEqual(registry.save(obs, { OBS_PASSWORD: '' }).segredosConfigurados, [])
    registry.save(obs, { OBS_PASSWORD: 'outro' })
    assert.equal(registry.remove('obs'), true)
    assert.deepEqual(registry.list(), [])
    assert.deepEqual(registry.resolve(['obs']), [])
    assert.equal(registry.remove('obs'), false)
  })
})

test('resolve ignora id desconhecido e o cabecalho secreto do http sai da definicao', () => {
  withRegistry((registry) => {
    registry.save(
      { id: 'zap', transporte: 'http', url: 'http://127.0.0.1:8000/mcp', cabecalhos: { Authorization: 'Bearer x' }, segredos: ['Authorization'] },
      { Authorization: 'Bearer real' },
    )
    const [zap, ...resto] = registry.resolve(['zap', 'sumiu'])
    assert.equal(resto.length, 0)
    assert.deepEqual(zap.cabecalhos, {})
    assert.deepEqual(zap.secretValues, { Authorization: 'Bearer real' })
    assert.equal(zap.execucao, 'remoto')
  })
})

test('entrada invalida e recusada', () => {
  withRegistry((registry) => {
    assert.throws(() => registry.save({ ...obs, id: 'Obs Studio' }), /Id de MCP invalido/)
    assert.throws(() => registry.save({ ...obs, transporte: 'sse' }), /Transporte/)
    assert.throws(() => registry.save({ ...obs, comando: '' }), /comando/)
    assert.throws(() => registry.save({ id: 'x', transporte: 'http', url: 'ftp://a' }), /http ou https/)
    assert.throws(() => registry.save({ id: 'x', transporte: 'http', url: 'http://u:p@a/' }), /credenciais/)
    assert.throws(() => registry.save(obs, { OUTRO: 'v' }), /lista de segredos/)
  })
})

test('sem chaveiro seguro o segredo nao e gravado em texto', () => {
  withRegistry((registry, userData) => {
    assert.throws(() => registry.save(obs, { OBS_PASSWORD: 's3gredo' }), /chaveiro/)
    assert.deepEqual(registry.list(), [])
    assert.equal(fs.existsSync(path.join(userData, 'mcp', 'secrets.bin')), false)
  }, fakeSafeStorage('basic'))
})

test('basic_text do Electron recente (sem criptografia) tambem pede o chaveiro', () => {
  withRegistry((registry, userData) => {
    assert.throws(() => registry.save(obs, { OBS_PASSWORD: 's3gredo' }), /chaveiro/)
    assert.equal(fs.existsSync(path.join(userData, 'mcp', 'secrets.bin')), false)
  }, fakeSafeStorage('basic_text', false))
})

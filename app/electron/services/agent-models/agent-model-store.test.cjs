const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createAgentModelStore } = require('./agent-model-store.cjs')

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-agent-models-'))
}

test('devolve o cache gravado numa execução anterior', async () => {
  const dir = createTempDir()
  const store = createAgentModelStore({ cacheDir: dir })

  await store.save({ claude: { models: ['opus', 'fable'] } })
  const lido = await createAgentModelStore({ cacheDir: dir }).read()

  assert.deepEqual(lido.claude.models, ['opus', 'fable'])
})

test('cache ausente devolve null em vez de estourar', async () => {
  // Primeira execução do app: não há arquivo, e isso é normal.
  const store = createAgentModelStore({ cacheDir: path.join(createTempDir(), 'inexistente') })

  assert.equal(await store.read(), null)
})

test('cache corrompido devolve null em vez de estourar', async () => {
  // Desligar o PC no meio da escrita não pode impedir o app de abrir.
  const dir = createTempDir()
  fs.writeFileSync(path.join(dir, 'agent-models.json'), '{ truncado', 'utf8')

  assert.equal(await createAgentModelStore({ cacheDir: dir }).read(), null)
})

test('cache com formato inesperado devolve null', async () => {
  const dir = createTempDir()
  fs.writeFileSync(path.join(dir, 'agent-models.json'), '["lista", "em vez de objeto"]', 'utf8')

  assert.equal(await createAgentModelStore({ cacheDir: dir }).read(), null)
})

test('gravar cria o diretório quando ele ainda não existe', async () => {
  const dir = path.join(createTempDir(), 'ainda', 'nao', 'existe')
  const store = createAgentModelStore({ cacheDir: dir })

  await store.save({ codex: { models: ['gpt-5.5'] } })

  assert.deepEqual((await store.read()).codex.models, ['gpt-5.5'])
})

test('guarda quando foi descoberto, para a UI poder mostrar', async () => {
  const dir = createTempDir()
  const store = createAgentModelStore({ cacheDir: dir, now: () => new Date('2026-08-09T12:00:00Z') })

  await store.save({ claude: { models: ['opus'] } })

  assert.equal((await store.read()).discoveredAt, '2026-08-09T12:00:00.000Z')
})

test('salvar null não apaga o cache anterior', async () => {
  // `null` significa "não descobri nada agora" — e uma rodada sem sucesso
  // não pode custar o catálogo que já funcionava.
  const dir = createTempDir()
  const store = createAgentModelStore({ cacheDir: dir })

  await store.save({ claude: { models: ['opus'] } })
  await store.save(null)

  assert.deepEqual((await store.read()).claude.models, ['opus'])
})

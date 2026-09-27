const test = require('node:test')
const assert = require('node:assert/strict')
const { definirViewport, esperarAte, waitForViewport } = require('./canvas-smoke-wait.cjs')

function relogio() {
  let t = 0
  return { now: () => t, sleep: async (ms) => { t += ms } }
}

test('esperarAte: espera a condição REALMENTE ficar verdadeira (não retorna na 1ª volta)', async () => {
  const r = relogio()
  let chamadas = 0
  const ok = await esperarAte(async () => ++chamadas >= 4, { timeoutMs: 5000, ...r })
  assert.equal(ok, true)
  assert.equal(chamadas, 4)
  assert.equal(r.now(), 600)
})

test('esperarAte: uma Promise que resolve falsa NÃO conta como verdadeira (o bug do waitForFunction async)', async () => {
  const r = relogio()
  const ok = await esperarAte(async () => false, { timeoutMs: 1000, ...r })
  assert.equal(ok, false)
  assert.ok(r.now() >= 1000)
})

test('esperarAte: erro na checagem conta como "ainda não" e depois recupera', async () => {
  const r = relogio()
  let n = 0
  const ok = await esperarAte(async () => { if (++n < 3) throw new Error('recarregando'); return true }, { timeoutMs: 5000, ...r })
  assert.equal(ok, true)
})

test('esperarAte: sem nunca ficar verdadeira, devolve false no teto', async () => {
  const r = relogio()
  assert.equal(await esperarAte(() => false, { timeoutMs: 400, intervalMs: 100, ...r }), false)
})

/** Página falsa: `viewportSize` do Playwright, espera que estoura ou passa, e leitura do tamanho. */
function paginaFalsa({ emulado = null, esperaPassa = true, lido = { innerWidth: 1280, innerHeight: 800 }, leituraPendurada = false } = {}) {
  const chamadas = { setViewportSize: [], waitForFunction: [] }
  return {
    chamadas,
    viewportSize: () => emulado,
    async setViewportSize(tamanho) {
      chamadas.setViewportSize.push(tamanho)
      emulado = tamanho
    },
    async waitForFunction(_predicado, arg, opcoes) {
      chamadas.waitForFunction.push({ arg, opcoes })
      if (!esperaPassa) throw new Error(`page.waitForFunction: Timeout ${opcoes.timeout}ms exceeded.\nCall log: ...`)
      return true
    },
    evaluate: () => (leituraPendurada ? new Promise(() => {}) : Promise.resolve(lido)),
  }
}

const semEspera = { sleep: async () => {}, now: () => 0 }

test('definirViewport: não pede de novo o tamanho que já é o atual, mas confere na página com o prazo dado', async () => {
  const page = paginaFalsa({ emulado: { width: 1280, height: 800 } })
  await definirViewport(page, { width: 1280, height: 800 }, { timeoutMs: 15_000 })
  assert.deepEqual(page.chamadas.setViewportSize, [])
  assert.equal(page.chamadas.waitForFunction.length, 1)
  assert.deepEqual(page.chamadas.waitForFunction[0], { arg: { width: 1280, height: 800 }, opcoes: { timeout: 15_000 } })
})

test('definirViewport: pede o tamanho quando é outro, ou quando ainda não há emulação', async () => {
  const outro = paginaFalsa({ emulado: { width: 1280, height: 600 } })
  await definirViewport(outro, { width: 1280, height: 800, deviceScaleFactor: 2 }, { timeoutMs: 5_000 })
  assert.deepEqual(outro.chamadas.setViewportSize, [{ width: 1280, height: 800 }])
  const semEmulacao = paginaFalsa({ emulado: null })
  await definirViewport(semEmulacao, { width: 320, height: 720 }, { timeoutMs: 5_000 })
  assert.deepEqual(semEmulacao.chamadas.setViewportSize, [{ width: 320, height: 720 }])
})

test('waitForViewport: na falha, a mensagem traz o tamanho pedido, o lido e o prazo', async () => {
  const page = paginaFalsa({ esperaPassa: false, lido: { innerWidth: 1320, innerHeight: 669 } })
  await assert.rejects(
    waitForViewport(page, { width: 1280, height: 800 }, { timeoutMs: 15_000, ...semEspera }),
    (error) => {
      assert.match(error.message, /viewport 1280×800 não confirmado/)
      assert.match(error.message, /prazo 15000 ms/)
      assert.match(error.message, /a página está em 1320×669 \(innerWidth×innerHeight\)/)
      assert.match(error.message, /Causa original: page\.waitForFunction: Timeout 15000ms exceeded\.$/)
      return true
    },
  )
})

test('waitForViewport: com o tamanho certo e a página sem responder, a mensagem diz que ela não respondeu', async () => {
  const page = paginaFalsa({ esperaPassa: false, leituraPendurada: true })
  await assert.rejects(
    waitForViewport(page, { width: 1280, height: 800 }, { timeoutMs: 5_000, readTimeoutMs: 2_000, ...semEspera }),
    /a página não respondeu à leitura do tamanho em 2000 ms \(renderer ocupado\)/,
  )
})

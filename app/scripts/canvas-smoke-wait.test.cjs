const test = require('node:test')
const assert = require('node:assert/strict')
const { esperarAte } = require('./canvas-smoke-wait.cjs')

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

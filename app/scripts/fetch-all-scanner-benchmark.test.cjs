const test = require('node:test')
const assert = require('node:assert/strict')

const benchmark = require('./fetch-all-scanner-benchmark.cjs')

test('a bancada do Fetch All exige uma raiz explícita e usa limites finitos', () => {
  assert.equal(benchmark.parseArgs([]).root, null)
  assert.equal(benchmark.parseArgs([]).iterations, 5)
  assert.equal(benchmark.parseArgs([]).concurrency, 16)
  assert.equal(benchmark.parseArgs(['--root=/tmp/projetos']).root, '/tmp/projetos')
  assert.throws(() => benchmark.parseArgs(['--iterations=21']), /iterations.*20/i)
  assert.throws(() => benchmark.parseArgs(['--concurrency=65']), /concurrency.*64/i)
})

test('percentis e saída do benchmark expõem p50, p95, diretórios e repositórios', () => {
  assert.equal(benchmark.percentile([1, 3, 2], 0.5), 2)
  assert.equal(benchmark.percentile([1, 2, 3, 4], 0.95), 3.85)

  const output = benchmark.formatReport({
    root: '/tmp/projetos',
    scannedDirs: 3335,
    foundRepos: 51,
    concurrency: 16,
    iterations: 5,
    p50Ms: 212.5,
    p95Ms: 289,
  })

  assert.match(output, /directories:\s+3335/)
  assert.match(output, /repositories:\s*51/)
  assert.match(output, /concurrency:\s+16/)
  assert.match(output, /p50:\s+212\.5 ms/)
  assert.match(output, /p95:\s+289 ms/)
})

test('a bancada sem raiz falha antes de iniciar o scanner', async () => {
  await assert.rejects(() => benchmark.main([]), /raiz explícita/)
})

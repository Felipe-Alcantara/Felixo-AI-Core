'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const {
  collectBundleAssets,
  parseArgs,
  percentile,
  summarize,
  validateReport,
} = require('./bundle-load-benchmark.cjs')

test('bundle benchmark limits iteration count and accepts report aliases', () => {
  assert.deepEqual(parseArgs(['--iterations=3', '--timeout-ms=5000', '--dist=../baseline/dist', '--out=report.json', '--check']), {
    iterations: 3,
    timeoutMs: 5000,
    distPath: '../baseline/dist',
    reportPath: 'report.json',
    check: true,
  })
  assert.equal(parseArgs(['--report=report.json']).reportPath, 'report.json')
  assert.throws(() => parseArgs(['--iterations=11']), /iterations/)
})

test('bundle benchmark calculates percentiles without mutating the input', () => {
  const values = [40, 10, 30, 20]
  assert.equal(percentile(values, 0.5), 25)
  assert.equal(percentile(values, 0.95), 38.5)
  assert.deepEqual(values, [40, 10, 30, 20])
  assert.deepEqual(summarize(values), { count: 4, p50: 25, p95: 38.5, max: 40 })
})

test('bundle inventory separates initial entry from lazy chunks and records gzip', () => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-bundle-test-'))
  const assetsDirectory = path.join(temporaryDirectory, 'assets')
  fs.mkdirSync(assetsDirectory)
  fs.writeFileSync(path.join(assetsDirectory, 'index-abc.js'), 'entry; import("./feature-def.js")')
  fs.writeFileSync(path.join(assetsDirectory, 'feature-def.js'), 'feature')
  fs.writeFileSync(path.join(assetsDirectory, 'index-abc.css'), 'body {}')
  fs.writeFileSync(
    path.join(temporaryDirectory, 'index.html'),
    '<script type="module" src="./assets/index-abc.js"></script>',
  )

  const inventory = collectBundleAssets(temporaryDirectory)
  assert.equal(inventory.initialJavaScript.name, 'index-abc.js')
  assert.equal(inventory.javascript.length, 2)
  assert.equal(inventory.css.length, 1)
  assert.ok(inventory.javascript.every((asset) => asset.gzipBytes > 0))
  assert.deepEqual(inventory.assetReferences.missing, [])
  assert.equal(inventory.assetReferences.count, 2)

  fs.rmSync(temporaryDirectory, { recursive: true, force: true })
})

test('bundle check requires a lazy JavaScript asset and complete samples', () => {
  const valid = {
    assets: {
      initialJavaScript: { name: 'index.js' },
      javascript: [{ name: 'index.js' }, { name: 'feature.js' }],
      assetReferences: { missing: [] },
    },
    results: [{
      startupMs: 10,
      firstInteractionMs: 20,
      onDemandFetchAllMs: 30,
      initialFetchAllChunkMarks: 0,
      interactionFetchAllChunkMarks: 1,
    }],
  }
  assert.deepEqual(validateReport(valid, 1), [])
  assert.match(
    validateReport({
      assets: { initialJavaScript: null, javascript: [] },
      results: [],
    }, 1).join('\n'),
    /entry JavaScript.*chunk.*amostras/s,
  )

  assert.match(
    validateReport({
      assets: {
        initialJavaScript: { name: 'index.js' },
        javascript: [{ name: 'index.js' }, { name: 'feature.js' }],
        assetReferences: { missing: [{ source: 'index.html', reference: './missing.js' }] },
      },
      results: [],
    }, 0).join('\n'),
    /referência.*asset.*não encontrada/s,
  )
})

'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  diffSummaries,
  formatBytes,
  loadAndSummarize,
  parseHeapSnapshot,
  summarizeHeapSnapshot,
  truncateName,
} = require('./heap-snapshot-analysis.cjs')

/**
 * Monta um `.heapsnapshot` mínimo, mas no formato real do V8 (mesmos campos
 * que `felixo devtools heap-snapshot` grava): `nodes`/`edges` são arrays
 * planos indexados pelos `meta.node_fields`/`edge_fields`, e todo texto vive
 * em `strings`, referenciado por índice.
 */
function buildSnapshot(nodeDescriptors) {
  const strings = ['']
  const stringIndex = (value) => {
    let index = strings.indexOf(value)
    if (index === -1) { strings.push(value); index = strings.length - 1 }
    return index
  }
  const nodeTypes = ['hidden', 'object', 'native', 'closure']
  const nodes = []
  for (const descriptor of nodeDescriptors) {
    nodes.push(
      nodeTypes.indexOf(descriptor.type),
      stringIndex(descriptor.name),
      descriptor.id ?? 1,
      descriptor.selfSize ?? 0,
      0,
      descriptor.detached ? 2 : 1,
    )
  }
  return JSON.stringify({
    snapshot: {
      meta: {
        node_fields: ['type', 'name', 'id', 'self_size', 'edge_count', 'detachedness'],
        node_types: [nodeTypes],
        edge_fields: ['type', 'name_or_index', 'to_node'],
        edge_types: [['property']],
      },
      node_count: nodeDescriptors.length,
      edge_count: 0,
    },
    nodes,
    edges: [],
    trace_function_infos: [],
    trace_tree: [],
    samples: [],
    locations: [],
    strings,
  })
}

test('parseHeapSnapshot lê type/name/self_size/detached pelos índices de meta.node_fields', () => {
  const raw = buildSnapshot([
    { type: 'object', name: 'Window', selfSize: 1000 },
    { type: 'object', name: 'HTMLDivElement', selfSize: 200, detached: true },
  ])
  const parsed = parseHeapSnapshot(raw)
  assert.equal(parsed.nodeCount, 2)
  assert.equal(parsed.totalSelfSize, 1200)
  assert.equal(parsed.hasDetachednessField, true)
  assert.deepEqual(parsed.nodes.map((n) => n.detached), [false, true])
})

test('summarizeHeapSnapshot agrupa por type:name e soma detached separadamente', () => {
  const raw = buildSnapshot([
    { type: 'object', name: 'PtySession', selfSize: 500 },
    { type: 'object', name: 'PtySession', selfSize: 700 },
    { type: 'object', name: 'HTMLDivElement', selfSize: 100, detached: true },
  ])
  const summary = summarizeHeapSnapshot(parseHeapSnapshot(raw))
  assert.equal(summary.constructorsByKey['object:PtySession'].count, 2)
  assert.equal(summary.constructorsByKey['object:PtySession'].selfSize, 1200)
  assert.equal(summary.detached.count, 1)
  assert.equal(summary.detached.selfSize, 100)
  assert.equal(summary.topConstructors[0].name, 'PtySession')
})

test('diffSummaries só reporta construtores cuja variação passa do limiar', () => {
  const before = summarizeHeapSnapshot(parseHeapSnapshot(buildSnapshot([
    { type: 'object', name: 'Terminal', selfSize: 1000 },
    { type: 'object', name: 'Estavel', selfSize: 50 },
  ])))
  const after = summarizeHeapSnapshot(parseHeapSnapshot(buildSnapshot([
    { type: 'object', name: 'Terminal', selfSize: 1000 + 2 * 1024 * 1024 },
    { type: 'object', name: 'Estavel', selfSize: 50 + 10 },
  ])))
  const diff = diffSummaries(before, after, { thresholdBytes: 512 * 1024 })
  assert.equal(diff.growth.length, 1)
  assert.equal(diff.growth[0].key, 'object:Terminal')
  assert.equal(diff.growth[0].selfSizeDelta, 2 * 1024 * 1024)
})

test('diffSummaries denuncia crescimento de destacados mesmo abaixo do limiar de bytes', () => {
  const before = summarizeHeapSnapshot(parseHeapSnapshot(buildSnapshot([
    { type: 'object', name: 'HTMLDivElement', selfSize: 10 },
  ])))
  const after = summarizeHeapSnapshot(parseHeapSnapshot(buildSnapshot([
    { type: 'object', name: 'HTMLDivElement', selfSize: 10, detached: true },
    { type: 'object', name: 'HTMLDivElement', selfSize: 10, detached: true },
  ])))
  const diff = diffSummaries(before, after, { thresholdBytes: 512 * 1024 })
  assert.equal(diff.growth.length, 1)
  assert.equal(diff.growth[0].detachedCountAfter, 2)
})

test('diffSummaries não denuncia nada quando a variação fica dentro do limiar (GC residual esperado)', () => {
  const before = summarizeHeapSnapshot(parseHeapSnapshot(buildSnapshot([{ type: 'object', name: 'X', selfSize: 1000 }])))
  const after = summarizeHeapSnapshot(parseHeapSnapshot(buildSnapshot([{ type: 'object', name: 'X', selfSize: 1000 + 1024 }])))
  const diff = diffSummaries(before, after, { thresholdBytes: 512 * 1024 })
  assert.deepEqual(diff.growth, [])
})

test('loadAndSummarize lê do disco com fs injetável', () => {
  const raw = buildSnapshot([{ type: 'object', name: 'Y', selfSize: 42 }])
  const fakeFs = { readFileSync: (file) => { assert.equal(file, '/tmp/x.heapsnapshot'); return raw } }
  const summary = loadAndSummarize('/tmp/x.heapsnapshot', { fs: fakeFs })
  assert.equal(summary.totalSelfSize, 42)
})

test('truncateName corta nomes longos (source map, bundle em base64) sem quebrar a tabela', () => {
  assert.equal(truncateName(''), '(sem nome)')
  assert.equal(truncateName('curto'), 'curto')
  const long = 'x'.repeat(200)
  const result = truncateName(long, 80)
  assert.equal(result.length, 81)
  assert.ok(result.endsWith('…'))
  assert.equal(truncateName('linha\ncom\nquebra'), 'linha com quebra')
})

test('formatBytes escolhe a unidade e preserva o sinal', () => {
  assert.equal(formatBytes(500), '500 B')
  assert.equal(formatBytes(2048), '2.0 KiB')
  assert.equal(formatBytes(3 * 1024 * 1024), '3.0 MiB')
  assert.equal(formatBytes(-2048), '-2.0 KiB')
})

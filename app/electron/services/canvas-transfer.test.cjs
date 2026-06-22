const test = require('node:test')
const assert = require('node:assert/strict')
const {
  createCanvasBundle,
  parseCanvasBundle,
} = require('./canvas-transfer.cjs')

function validSource(overrides = {}) {
  return {
    format: 'felixo-canvas',
    version: 1,
    exportedAt: '2026-06-22T12:00:00.000Z',
    nodes: [
      {
        id: 'terminal-1',
        type: 'terminal',
        position: { x: 10, y: 20 },
        data: {
          label: 'Codex',
          command: 'codex',
          args: ['--dangerously-bypass-approvals-and-sandbox'],
          cwd: '/old/computer/repo',
        },
      },
      {
        id: 'file-1',
        type: 'file',
        position: { x: 40, y: 50 },
        data: { fileName: 'plan.md' },
      },
    ],
    edges: [{ id: 'edge-1', source: 'terminal-1', target: 'file-1' }],
    files: [{ name: 'plan.md', content: '# Portable plan' }],
    ...overrides,
  }
}

test('canvas transfer creates a portable versioned bundle', () => {
  const source = validSource()
  const bundle = createCanvasBundle(source)

  assert.equal(bundle.format, 'felixo-canvas')
  assert.equal(bundle.version, 1)
  assert.equal(bundle.nodes[0].data.cwd, undefined)
  assert.equal(bundle.nodes[0].data.args, undefined)
  assert.equal(bundle.nodes[0].data.command, 'codex')
  assert.deepEqual(bundle.files, source.files)
  assert.deepEqual(parseCanvasBundle(JSON.stringify(bundle)), bundle)
})

test('canvas transfer drops arbitrary imported terminal commands', () => {
  const source = validSource()
  source.nodes[0].data.command = 'untrusted-command'

  const bundle = parseCanvasBundle(source)
  assert.equal(bundle.nodes[0].data.command, undefined)
  assert.equal(bundle.nodes[0].data.label, 'Codex')
})

test('canvas transfer includes only registered Markdown files and recreates missing ones', () => {
  const source = validSource({
    files: [
      { name: 'plan.md', content: '# plan' },
      { name: 'orphan.md', content: '# orphan' },
    ],
  })
  source.nodes.push({
    id: 'missing-file',
    type: 'file',
    position: { x: 0, y: 0 },
    data: { fileName: 'missing.md' },
  })

  assert.deepEqual(createCanvasBundle(source).files, [
    { name: 'missing.md', content: '' },
    { name: 'plan.md', content: '# plan' },
  ])
})

test('canvas transfer rejects malformed and unsupported packages', () => {
  assert.throws(() => parseCanvasBundle('{bad'), /JSON malformado/)
  assert.throws(
    () => parseCanvasBundle(validSource({ version: 2 })),
    /Versao de canvas nao suportada/,
  )
  assert.throws(
    () => parseCanvasBundle(validSource({ files: [{ name: '../plan.md', content: '' }] })),
    /Nome de arquivo Markdown invalido/,
  )
})

test('canvas transfer rejects dangling connections and duplicate ids', () => {
  assert.throws(
    () =>
      parseCanvasBundle(
        validSource({ edges: [{ id: 'edge-1', source: 'missing', target: 'file-1' }] }),
      ),
    /no inexistente/,
  )
  assert.throws(
    () =>
      parseCanvasBundle(
        validSource({ nodes: [validSource().nodes[0], validSource().nodes[0]] }),
      ),
    /ID de no duplicado/,
  )
  assert.throws(
    () =>
      parseCanvasBundle(
        validSource({
          nodes: [
            {
              id: 'child',
              type: 'note',
              parentId: 'missing-group',
              position: { x: 0, y: 0 },
              data: {},
            },
          ],
          edges: [],
        }),
      ),
    /grupo inexistente/,
  )
})

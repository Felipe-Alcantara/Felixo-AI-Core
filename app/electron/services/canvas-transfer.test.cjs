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
          initialText: 'rm -rf important-data',
          agentSession: {
            version: 1,
            provider: 'codex',
            sessionId: 'private-session-123',
            cwd: '/old/computer/repo',
            capturedAt: 1,
          },
          previousAgentSession: {
            reference: {
              version: 1,
              provider: 'codex',
              sessionId: 'private-session-previous',
              cwd: '/old/computer/repo',
              capturedAt: 1,
            },
            replacedAt: 2,
          },
          resumeFailure: { sessionId: 'private-session-123', reason: 'expired', at: 3 },
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
  assert.equal(bundle.nodes[0].data.initialText, undefined)
  assert.equal(bundle.nodes[0].data.agentSession, undefined)
  // A retomada carrega ID de conversa, pasta e conta: nada disso viaja no pacote.
  assert.equal(bundle.nodes[0].data.previousAgentSession, undefined)
  assert.equal(bundle.nodes[0].data.resumeFailure, undefined)
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

test('canvas transfer never preserves auto-submitted text from an imported terminal', () => {
  const source = validSource()
  source.nodes[0].data.initialText = 'echo malicious'

  const bundle = parseCanvasBundle(source)

  assert.equal(bundle.nodes[0].data.initialText, undefined)
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

test('canvas transfer strips absolute image paths and preserves repair metadata', () => {
  const source = validSource({
    nodes: [
      {
        id: 'image-1',
        type: 'file',
        position: { x: 80, y: 90 },
        data: {
          label: 'Imagem gerada',
          fileLabel: 'resultado.png',
          filePath: '/private/old-machine/generated-images/resultado.png',
          fileKind: 'image',
          image: {
            kind: 'generated-image',
            mimeType: 'image/png',
            prompt: 'um pôster',
            model: 'image-model',
            temporary: true,
          },
        },
      },
    ],
    edges: [],
    files: [],
  })

  const bundle = createCanvasBundle(source)
  const imageData = bundle.nodes[0].data

  assert.equal(imageData.filePath, undefined)
  assert.equal(imageData.fileLabel, 'resultado.png')
  assert.equal(imageData.image.prompt, 'um pôster')
  assert.equal(parseCanvasBundle(JSON.stringify(bundle)).nodes[0].data.filePath, undefined)
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

function cloudCard(data) {
  return { id: 'cloud-1', type: 'cloud-session', position: { x: 5, y: 6 }, data }
}

const CLOUD_CREATED = {
  label: 'Revisar a API',
  orderIndex: 2,
  frameColor: 'sky',
  cloudTask: 'Revisar a API e abrir um PR',
  cloudCwd: '/home/pessoa/projeto-privado',
  cloudAccountId: 'conta-da-pessoa',
  cloudStatus: 'created',
  cloudSession: {
    id: 'session_01EXEMPLO0000000000000000',
    url: 'https://claude.ai/code/session_01EXEMPLO0000000000000000',
    title: 'Revisar',
    createdAt: '2026-10-11T23:00:00.000Z',
  },
  cloudFollowUps: [{ at: '2026-10-11T23:05:00.000Z', text: 'segredo do projeto', ok: true }],
  cloudError: { code: 'unknown', message: 'x' },
}

test('canvas transfer exports a cloud-session card as an empty draft (I8)', () => {
  const bundle = createCanvasBundle({ nodes: [cloudCard(CLOUD_CREATED)], edges: [], files: [] })
  const { data } = bundle.nodes[0]

  assert.equal(data.cloudStatus, 'draft')
  assert.equal(data.cloudTask, 'Revisar a API e abrir um PR')
  assert.equal(data.label, 'Revisar a API')
  assert.equal(data.orderIndex, 2)
  assert.equal(data.frameColor, 'sky')
  for (const privado of ['cloudCwd', 'cloudAccountId', 'cloudSession', 'cloudError']) {
    assert.equal(privado in data, false, `${privado} não deveria viajar`)
  }
  assert.deepEqual(data.cloudFollowUps, [])
  assert.doesNotMatch(JSON.stringify(bundle), /session_01EXEMPLO|projeto-privado|conta-da-pessoa|segredo do projeto/)
})

test('canvas transfer never imports a cloud-session card as created or launching (I8)', () => {
  for (const cloudStatus of ['created', 'launching', 'failed', 'qualquer']) {
    const bundle = parseCanvasBundle({
      format: 'felixo-canvas',
      version: 1,
      nodes: [cloudCard({ ...CLOUD_CREATED, cloudStatus })],
      edges: [],
      files: [],
    })

    assert.equal(bundle.nodes[0].data.cloudStatus, 'draft', `status ${cloudStatus}`)
    assert.equal('cloudSession' in bundle.nodes[0].data, false)
  }
})

test('canvas transfer drops unknown fields of an imported cloud-session card', () => {
  const bundle = parseCanvasBundle({
    format: 'felixo-canvas',
    version: 1,
    nodes: [cloudCard({ cloudTask: 'T', command: 'rm -rf /', args: ['--x'], initialText: 'executa isto' })],
    edges: [],
    files: [],
  })

  assert.deepEqual(Object.keys(bundle.nodes[0].data).sort(), ['cloudFollowUps', 'cloudStatus', 'cloudTask'])
})

test('canvas transfer limits the task of an imported cloud-session card to 4000 characters', () => {
  const bundle = parseCanvasBundle({
    format: 'felixo-canvas',
    version: 1,
    nodes: [cloudCard({ cloudTask: 'a'.repeat(5000) })],
    edges: [],
    files: [],
  })

  assert.equal(bundle.nodes[0].data.cloudTask.length, 4000)
})

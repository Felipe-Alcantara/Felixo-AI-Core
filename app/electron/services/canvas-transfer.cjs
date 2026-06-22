const path = require('node:path')
const {
  normalizeEdge,
  normalizeNode,
} = require('./storage/canvas-repository.cjs')

const CANVAS_TRANSFER_FORMAT = 'felixo-canvas'
const CANVAS_TRANSFER_VERSION = 1
const MAX_NODES = 5_000
const MAX_EDGES = 10_000
const MAX_FILES = 5_000
const MAX_FILE_BYTES = 10 * 1024 * 1024
const MAX_TOTAL_FILE_BYTES = 50 * 1024 * 1024
const PORTABLE_AGENT_COMMANDS = new Set(['claude', 'codex', 'gemini'])

function createCanvasBundle({ nodes, edges, files }) {
  return normalizeCanvasBundle({
    format: CANVAS_TRANSFER_FORMAT,
    version: CANVAS_TRANSFER_VERSION,
    exportedAt: new Date().toISOString(),
    nodes,
    edges,
    files,
  })
}

function parseCanvasBundle(value) {
  let parsed = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch {
      throw new Error('Arquivo .fxcanvas invalido: JSON malformado.')
    }
  }

  return normalizeCanvasBundle(parsed)
}

function normalizeCanvasBundle(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Arquivo .fxcanvas invalido.')
  }
  if (value.format !== CANVAS_TRANSFER_FORMAT) {
    throw new Error('Formato de canvas nao reconhecido.')
  }
  if (value.version !== CANVAS_TRANSFER_VERSION) {
    throw new Error(`Versao de canvas nao suportada: ${String(value.version)}.`)
  }

  requireArrayWithinLimit(value.nodes, MAX_NODES, 'nos')
  requireArrayWithinLimit(value.edges, MAX_EDGES, 'conexoes')
  requireArrayWithinLimit(value.files, MAX_FILES, 'arquivos')

  const nodeIds = new Set()
  const nodes = value.nodes.map((rawNode) => {
    const node = normalizeNode(rawNode)
    if (nodeIds.has(node.id)) {
      throw new Error(`ID de no duplicado: ${node.id}.`)
    }
    nodeIds.add(node.id)

    if (node.type === 'terminal') {
      // Paths and CLI arguments are machine-specific and could execute imported
      // instructions. Keep only known agent binaries, launched with safe defaults.
      const { cwd: _cwd, args: _args, command, ...portableData } = node.data
      return {
        ...node,
        data: {
          ...portableData,
          ...(PORTABLE_AGENT_COMMANDS.has(command) ? { command } : {}),
        },
      }
    }
    return node
  })

  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const referencedFileNames = new Map()
  for (const node of nodes) {
    if (!node.parentId) {
      continue
    }
    const parent = nodesById.get(node.parentId)
    if (!parent || parent.type !== 'group') {
      throw new Error(`No ${node.id} aponta para um grupo inexistente.`)
    }
  }
  for (const node of nodes) {
    if (node.type !== 'file') {
      continue
    }
    const name = typeof node.data.fileName === 'string' ? node.data.fileName.trim() : ''
    if (!name || name !== path.basename(name) || !/\.md$/i.test(name)) {
      throw new Error(`No ${node.id} possui um nome de arquivo Markdown invalido.`)
    }
    referencedFileNames.set(name.toLowerCase(), name)
  }

  const edgeIds = new Set()
  const edges = value.edges.map((rawEdge) => {
    const edge = normalizeEdge(rawEdge)
    if (edgeIds.has(edge.id)) {
      throw new Error(`ID de conexao duplicado: ${edge.id}.`)
    }
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      throw new Error(`Conexao ${edge.id} aponta para um no inexistente.`)
    }
    edgeIds.add(edge.id)
    return edge
  })

  let totalFileBytes = 0
  const fileNames = new Set()
  const providedFiles = value.files.map((rawFile) => {
    if (!rawFile || typeof rawFile !== 'object' || Array.isArray(rawFile)) {
      throw new Error('Arquivo Markdown invalido no pacote.')
    }
    const name = typeof rawFile.name === 'string' ? rawFile.name.trim() : ''
    if (!name || name !== path.basename(name) || !/\.md$/i.test(name)) {
      throw new Error('Nome de arquivo Markdown invalido no pacote.')
    }
    const normalizedName = name.toLowerCase()
    if (fileNames.has(normalizedName)) {
      throw new Error(`Arquivo Markdown duplicado: ${name}.`)
    }
    if (typeof rawFile.content !== 'string') {
      throw new Error(`Conteudo invalido para ${name}.`)
    }

    const size = Buffer.byteLength(rawFile.content, 'utf8')
    if (size > MAX_FILE_BYTES) {
      throw new Error(`Arquivo Markdown muito grande: ${name}.`)
    }
    totalFileBytes += size
    if (totalFileBytes > MAX_TOTAL_FILE_BYTES) {
      throw new Error('O pacote excede o limite total de 50 MB em arquivos Markdown.')
    }

    fileNames.add(normalizedName)
    return { name, content: rawFile.content }
  })
  const providedFilesByName = new Map(
    providedFiles.map((file) => [file.name.toLowerCase(), file]),
  )
  const files = Array.from(referencedFileNames.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([normalizedName, name]) => ({
      name,
      content: providedFilesByName.get(normalizedName)?.content ?? '',
    }))

  return {
    format: CANVAS_TRANSFER_FORMAT,
    version: CANVAS_TRANSFER_VERSION,
    exportedAt:
      typeof value.exportedAt === 'string' && !Number.isNaN(Date.parse(value.exportedAt))
        ? value.exportedAt
        : new Date().toISOString(),
    nodes,
    edges,
    files,
  }
}

function requireArrayWithinLimit(value, limit, label) {
  if (!Array.isArray(value)) {
    throw new Error(`Lista de ${label} invalida no pacote.`)
  }
  if (value.length > limit) {
    throw new Error(`O pacote excede o limite de ${limit} ${label}.`)
  }
}

module.exports = {
  CANVAS_TRANSFER_FORMAT,
  CANVAS_TRANSFER_VERSION,
  createCanvasBundle,
  parseCanvasBundle,
}

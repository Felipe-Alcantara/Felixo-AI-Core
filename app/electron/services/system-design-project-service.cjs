'use strict'

/**
 * Leitura em disco da camada de projeto do System Design: acha a raiz do
 * projeto de um terminal, lê `.felixo/system-design.json` e lista as pastas de
 * guias. A regra de negócio (o que vale, confirmação, precedência) fica em
 * `core/system-design-project.cjs`; aqui só se lê, e só dentro do autorizado.
 *
 * O conteúdo vem de um repositório qualquer, então nada aqui segue link
 * simbólico: um `.felixo` ou um arquivo que fosse link poderia fazer o app ler
 * algo de fora do projeto.
 */

const fsp = require('node:fs/promises')
const path = require('node:path')
const {
  MAX_GUIDE_FILE_BYTES,
  PROJECT_GUIDE_FILE_SEGMENTS,
  detectGuideFolders,
  parseProjectGuideFile,
} = require('../core/system-design-project.cjs')
const { parseMarkdownTitleAndSummary } = require('./system-design-service.cjs')

/** Quantas pastas o caminho até o `.git` pode subir a partir do terminal. */
const MAX_ROOT_ASCENT = 12
const MAX_LOCAL_GUIDE_FILES = 300
const MAX_LOCAL_GUIDE_DEPTH = 6
const MAX_LOCAL_DOCUMENT_BYTES = 256 * 1024

async function isRealDirectory(targetPath, fileSystem = fsp) {
  try {
    return (await fileSystem.lstat(targetPath)).isDirectory()
  } catch {
    return false
  }
}

async function exists(targetPath, fileSystem = fsp) {
  try {
    await fileSystem.lstat(targetPath)
    return true
  } catch {
    return false
  }
}

/**
 * A raiz do projeto de um diretório: a primeira pasta com `.git` subindo a
 * partir dele, sem passar do que `authorize` aceita (projeto registrado ou
 * pasta escolhida no seletor). Sem `.git`, a raiz é o próprio diretório.
 *
 * @param {string} directory
 * @param {{ authorize: (p: string) => string, fileSystem?: object }} options
 * @returns {Promise<string>} raiz já resolvida (lança se `directory` não for autorizado)
 */
async function findProjectRoot(directory, { authorize, fileSystem = fsp, maxAscent = MAX_ROOT_ASCENT }) {
  const start = authorize(directory)
  let current = start
  for (let step = 0; step <= maxAscent; step += 1) {
    if (await exists(path.join(current, '.git'), fileSystem)) return current
    const parent = path.dirname(current)
    if (parent === current) break
    try {
      current = authorize(parent)
    } catch {
      break
    }
  }
  return start
}

/**
 * O que a raiz traz: o arquivo de guias (lido e validado) e as pastas de guias.
 *
 * @returns {Promise<{ root: string, file: { present: boolean, parsed: object | null }, folders: object[] }>}
 */
async function inspectProjectRoot(root, { fileSystem = fsp } = {}) {
  let file = { present: false, parsed: null }
  const configDir = path.join(root, PROJECT_GUIDE_FILE_SEGMENTS[0])
  const filePath = path.join(root, ...PROJECT_GUIDE_FILE_SEGMENTS)
  if (await isRealDirectory(configDir, fileSystem)) {
    try {
      const stat = await fileSystem.lstat(filePath)
      if (stat.isFile()) {
        file = stat.size > MAX_GUIDE_FILE_BYTES
          ? {
              present: true,
              parsed: { guides: [], problems: [`O arquivo passa de ${MAX_GUIDE_FILE_BYTES / 1024} KB.`], hash: null },
            }
          : { present: true, parsed: parseProjectGuideFile(await fileSystem.readFile(filePath, 'utf8')) }
      } else if (stat.isSymbolicLink()) {
        file = {
          present: true,
          parsed: { guides: [], problems: ['O arquivo é um link simbólico e não é lido.'], hash: null },
        }
      }
    } catch {
      // Sem arquivo: o projeto simplesmente não traz guias por arquivo.
    }
  }

  let folders = []
  try {
    const entries = await fileSystem.readdir(root, { withFileTypes: true })
    // `Dirent.isDirectory()` é falso para link simbólico: pasta-link fica de fora.
    folders = detectGuideFolders(entries.map((entry) => ({ name: entry.name, isDirectory: entry.isDirectory() })))
      .map((folder) => ({ ...folder, path: path.join(root, folder.name) }))
  } catch {
    folders = []
  }

  return { root, file, folders }
}

/**
 * Documentos `.md` de uma pasta de guias local, com teto de arquivos, de
 * profundidade e de tamanho. Não segue link simbólico.
 */
async function collectLocalGuideDocuments(folderPath, { fileSystem = fsp, withContent = false } = {}) {
  const collected = []

  async function walk(currentPath, depth) {
    if (depth > MAX_LOCAL_GUIDE_DEPTH || collected.length >= MAX_LOCAL_GUIDE_FILES) return
    let entries
    try {
      entries = await fileSystem.readdir(currentPath, { withFileTypes: true })
    } catch {
      return
    }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      if (collected.length >= MAX_LOCAL_GUIDE_FILES) return
      if (entry.name.startsWith('.')) continue
      const absolutePath = path.join(currentPath, entry.name)
      if (entry.isDirectory()) {
        await walk(absolutePath, depth + 1)
        continue
      }
      if (!entry.isFile() || !/\.md$/i.test(entry.name)) continue
      const stat = await fileSystem.lstat(absolutePath)
      if (stat.size > MAX_LOCAL_DOCUMENT_BYTES) continue
      const content = await fileSystem.readFile(absolutePath, 'utf8')
      const relativePath = path.relative(folderPath, absolutePath).split(path.sep).join('/')
      const { title, summary } = parseMarkdownTitleAndSummary(content, relativePath)
      collected.push({
        path: relativePath,
        title,
        summary,
        byteSize: stat.size,
        updatedAt: stat.mtime.toISOString(),
        ...(withContent ? { content } : {}),
      })
    }
  }

  await walk(folderPath, 0)
  collected.sort((a, b) => a.path.localeCompare(b.path))
  return collected
}

/** Um documento de uma pasta local; o caminho pedido não pode sair da pasta. */
async function readLocalGuideDocument(folderPath, documentPath, { fileSystem = fsp } = {}) {
  if (typeof documentPath !== 'string' || !documentPath.trim()) return null
  const target = path.resolve(folderPath, documentPath)
  const relative = path.relative(folderPath, target)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null
  if (!/\.md$/i.test(target)) return null
  try {
    // A contenção acima é só textual: uma subpasta que fosse link simbólico
    // levaria para fora. Compara os caminhos REAIS.
    const realFolder = await fileSystem.realpath(folderPath)
    const realTarget = await fileSystem.realpath(target)
    const realRelative = path.relative(realFolder, realTarget)
    if (!realRelative || realRelative.startsWith('..') || path.isAbsolute(realRelative)) return null
    const stat = await fileSystem.lstat(target)
    if (!stat.isFile() || stat.size > MAX_LOCAL_DOCUMENT_BYTES) return null
    const content = await fileSystem.readFile(target, 'utf8')
    const normalizedPath = relative.split(path.sep).join('/')
    const { title, summary } = parseMarkdownTitleAndSummary(content, normalizedPath)
    return {
      path: normalizedPath,
      title,
      summary,
      content,
      byteSize: stat.size,
      updatedAt: stat.mtime.toISOString(),
    }
  } catch {
    return null
  }
}

module.exports = {
  MAX_LOCAL_GUIDE_FILES,
  collectLocalGuideDocuments,
  findProjectRoot,
  inspectProjectRoot,
  readLocalGuideDocument,
}

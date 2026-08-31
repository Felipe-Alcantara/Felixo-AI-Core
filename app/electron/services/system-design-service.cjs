'use strict'

const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')
const {
  createRedactedGitError,
  sanitizeGitRemoteUrl,
} = require('./git-secret-redaction.cjs')

const execFileAsync = promisify(execFile)

const DEFAULT_REPO_URL = 'https://github.com/Felipe-Alcantara/Felixo-System-Design.git'
const DEFAULT_BRANCH = 'main'
const GIT_TIMEOUT_MS = 60000
const MAX_BUFFER = 32 * 1024 * 1024

// Indexa apenas arquivos .md/.MD do repo, ignorando arquivos enormes ou não-texto.
const INCLUDE_PATTERN = /\.md$/i
const MAX_DOCUMENT_BYTES = 256 * 1024

async function syncSystemDesignRepository({
  repoUrl = DEFAULT_REPO_URL,
  branch = DEFAULT_BRANCH,
  cacheDir,
  repository,
  logger,
  executeGit = execFileAsync,
}) {
  if (!cacheDir || typeof cacheDir !== 'string') {
    throw new Error('cacheDir e obrigatorio para sync do System Design.')
  }
  if (!repository || typeof repository.save !== 'function') {
    throw new Error('Repository de system-design invalido.')
  }

  // Credenciais nunca devem entrar nos argumentos do processo Git. Repositórios
  // privados usam o credential helper/keychain do sistema, não userinfo na URL.
  repoUrl = sanitizeGitRemoteUrl(repoUrl)
  const run = (cwd, args, context) =>
    runGit(cwd, args, context, executeGit)

  await fsp.mkdir(cacheDir, { recursive: true })
  const repoPath = path.join(cacheDir, 'repo')
  const isFreshClone = !(await pathExists(path.join(repoPath, '.git')))

  if (isFreshClone) {
    await run(
      cacheDir,
      createCloneArgs({ repoUrl, branch }),
      { stage: 'clone', repoUrl, branch },
    )
  } else {
    try {
      await run(
        repoPath,
        ['fetch', '--depth', '1', 'origin', branch],
        { stage: 'fetch', repoUrl, branch },
      )
      await run(
        repoPath,
        ['reset', '--hard', `origin/${branch}`],
        { stage: 'reset', repoUrl, branch },
      )
    } catch (error) {
      logger?.warn?.(
        `fetch falhou, tentando re-clone: ${describeError(error, {
          stage: 'fetch',
          repoUrl,
          branch,
        })}`,
      )
      await fsp.rm(repoPath, { recursive: true, force: true })
      await run(
        cacheDir,
        ['clone', '--depth', '1', '--branch', branch, '--', repoUrl, 'repo'],
        { stage: 're-clone', repoUrl, branch },
      )
    }
  }

  const headSha = (
    await run(
      repoPath,
      ['rev-parse', 'HEAD'],
      { stage: 'ler o HEAD', repoUrl, branch },
    )
  ).trim()
  const documents = await collectDocuments(repoPath, headSha)

  for (const doc of documents) {
    repository.save(doc)
  }
  const removedCount = repository.deleteMissing(documents.map((d) => d.path))

  return {
    headSha,
    indexedCount: documents.length,
    removedCount,
    repoPath,
  }
}

async function collectDocuments(repoPath, headSha) {
  const collected = []

  async function walk(currentPath) {
    const entries = await fsp.readdir(currentPath, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.')) {
        continue
      }
      const absolutePath = path.join(currentPath, entry.name)
      if (entry.isDirectory()) {
        await walk(absolutePath)
        continue
      }
      if (!INCLUDE_PATTERN.test(entry.name)) {
        continue
      }
      const stat = await fsp.stat(absolutePath)
      if (stat.size > MAX_DOCUMENT_BYTES) {
        continue
      }
      const content = await fsp.readFile(absolutePath, 'utf8')
      const relativePath = path.relative(repoPath, absolutePath).split(path.sep).join('/')
      const { title, summary } = parseMarkdownTitleAndSummary(content, relativePath)
      collected.push({
        path: relativePath,
        title,
        summary,
        content,
        byteSize: stat.size,
        sourceSha: headSha,
      })
    }
  }

  await walk(repoPath)
  collected.sort((a, b) => a.path.localeCompare(b.path))
  return collected
}

function parseMarkdownTitleAndSummary(content, fallbackPath) {
  const lines = content.split(/\r?\n/)
  let title = ''
  let summary = ''

  for (const line of lines) {
    const trimmed = line.trim()
    if (!title) {
      const match = /^#\s+(.+)$/.exec(trimmed)
      if (match) {
        title = match[1].trim()
        continue
      }
    } else {
      if (!trimmed) {
        continue
      }
      if (trimmed.startsWith('#')) {
        break
      }
      summary = trimmed.length > 240 ? `${trimmed.slice(0, 240)}…` : trimmed
      break
    }
  }

  if (!title) {
    title = fallbackPath
  }
  return { title, summary }
}

/**
 * Monta os argumentos do `git clone`.
 *
 * O `--` antes da URL não é decorativo: `repoUrl` é configurável pelo renderer
 * (canal `system-design:save-config`), e sem o separador um valor começando com
 * "-" seria interpretado pelo git como opção em vez de endereço — a classe de
 * problema que flags como `--upload-pack` exploram.
 */
function createCloneArgs({ repoUrl, branch }) {
  return ['clone', '--depth', '1', '--branch', branch, '--', repoUrl, 'repo']
}

async function runGit(cwd, args, context = {}, executeGit = execFileAsync) {
  try {
    const { stdout } = await executeGit('git', args, {
      cwd,
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
    })
    return stdout
  } catch (error) {
    throw createRedactedGitError(error, context)
  }
}

async function pathExists(targetPath) {
  try {
    await fsp.access(targetPath, fs.constants.F_OK)
    return true
  } catch {
    return false
  }
}

function describeError(error, context = {}) {
  if (error?.isRedactedGitError && typeof error.message === 'string') {
    return error.message
  }

  return createRedactedGitError(error, context).message
}

module.exports = {
  DEFAULT_REPO_URL,
  createCloneArgs,
  DEFAULT_BRANCH,
  parseMarkdownTitleAndSummary,
  syncSystemDesignRepository,
}

/**
 * @module context-files-ipc-handlers
 * Read-only, short-lived context files delivered to agent terminals.
 *
 * This is deliberately separate from canvas-files: canvas-files are live
 * scratchpads that agents may edit, while these files are immutable handoff,
 * bootstrap or prompt payloads. The renderer never chooses a path or filename;
 * the main process creates both inside userData.
 */

const { ipcMain } = require('electron')
const fsp = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')
const { toErrorResult } = require('./ipc-result.cjs')
const { CONTEXT_FILE_PREFIX } = require('../core/context-file-contract.cjs')
const { caminhoDoComando } = require('./agent-command-install.cjs')
const { buildContextDeliveryEntry } = require('./context-delivery-log.cjs')

const STALE_CONTEXT_MAX_AGE_MS = 24 * 60 * 60 * 1000
const MAX_CONTEXT_BYTES = 32 * 1024 * 1024
function requireText(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${fieldName} precisa ser um texto não vazio.`)
  }
  return value.trim()
}

function normalizeMetadataText(value) {
  if (value === undefined || value === null) return undefined
  const text = String(value).replace(/[\r\n]+/g, ' ').trim()
  return text ? text.slice(0, 240) : undefined
}

function normalizeKind(value) {
  const normalized = String(value || 'contexto')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || 'contexto'
}

function normalizeInsertionMetadata(value) {
  if (!value || typeof value !== 'object') return undefined
  const id = normalizeMetadataText(value.id)
  const source = normalizeMetadataText(value.source)
  const name = normalizeMetadataText(value.name)
  const combinedNames = Array.isArray(value.combinedNames)
    ? value.combinedNames.map((entry) => normalizeMetadataText(entry)).filter(Boolean).slice(0, 50)
    : []
  if (!id && !source && !name && combinedNames.length === 0) return undefined
  return {
    ...(id ? { id } : {}),
    ...(name ? { name } : {}),
    ...(source ? { source } : {}),
    combinedNames,
    autoSubmit: value.autoSubmit === true,
    timestamp: normalizeMetadataText(value.timestamp),
  }
}

function buildContextFileContent({ kind, source, generatedAt, body, insertion }) {
  const origin = String(source || '').replace(/[\r\n]+/g, ' ').trim() || 'Felixo AI Core'
  const type = normalizeKind(kind)
  const timestamp = generatedAt || new Date().toISOString()
  const normalizedInsertion = normalizeInsertionMetadata(insertion)
  const insertionLines = normalizedInsertion
    ? [
        '',
        '## Metadados da inserção',
        `- ID: ${normalizedInsertion.id || '(não informado)'}`,
        `- Nome: ${normalizedInsertion.name || '(sem nome humano)'}`,
        `- Origem: ${normalizedInsertion.source || '(não informada)'}`,
        `- Composição: ${normalizedInsertion.combinedNames.length > 0 ? normalizedInsertion.combinedNames.join(' + ') : '(manual)'}`,
        `- Autoenvio: ${normalizedInsertion.autoSubmit ? 'sim' : 'não'}`,
        ...(normalizedInsertion.timestamp ? [`- Timestamp: ${normalizedInsertion.timestamp}`] : []),
      ]
    : []

  return [
    '# CONTEXTO ENTREGUE PELO FELIXO AI CORE',
    '',
    `- Tipo: ${type}`,
    `- Origem: ${origin}`,
    `- Gerado em: ${timestamp}`,
    '- Regime: somente leitura; não edite este arquivo.',
    '- Este caminho é um artefato temporário do app, não é o repositório trabalhado e não deve entrar em commit.',
    '- Este é um canvas multiagente: outros agentes podem estar trabalhando em paralelo. Registre decisões no scratchpad compartilhado do canvas, quando houver um.',
    ...insertionLines,
    '',
    '## Como usar',
    'Leia este arquivo antes de agir. O corpo abaixo é o contexto entregue pelo app; preserve o conteúdo e valide comandos, caminhos, segredos e decisões contra o estado real do projeto.',
    '',
    '## Corpo do contexto',
    String(body ?? ''),
    '',
  ].join('\n')
}

function isOwnedContextFile(filePath, baseDir) {
  const resolved = path.resolve(filePath)
  const base = path.resolve(baseDir)
  return resolved.startsWith(`${base}${path.sep}`) && path.basename(resolved).startsWith(CONTEXT_FILE_PREFIX)
}

async function removeFileIfOwned(filePath, baseDir) {
  if (!isOwnedContextFile(filePath, baseDir)) {
    return false
  }
  await fsp.rm(filePath, { force: true })
  return true
}

async function cleanupStaleContextFiles(baseDir, now = Date.now()) {
  let entries
  try {
    entries = await fsp.readdir(baseDir, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return 0
    throw error
  }

  let removed = 0
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.startsWith(CONTEXT_FILE_PREFIX)) continue
    const filePath = path.join(baseDir, entry.name)
    const stat = await fsp.stat(filePath)
    if (now - stat.mtimeMs >= STALE_CONTEXT_MAX_AGE_MS) {
      await fsp.rm(filePath, { force: true })
      removed += 1
    }
  }
  return removed
}

async function writeContextFile(baseDir, params = {}, now = new Date()) {
  const sessionId = requireText(params.sessionId, 'sessionId')
  if (typeof params.content !== 'string') {
    throw new Error('content precisa ser um texto.')
  }
  const body = params.content
  if (Buffer.byteLength(body, 'utf8') > MAX_CONTEXT_BYTES) {
    throw new Error('O contexto excede o limite seguro de 32 MB.')
  }

  await fsp.mkdir(baseDir, { recursive: true })
  const kind = normalizeKind(params.kind)
  const filename = `${CONTEXT_FILE_PREFIX}${now.getTime()}-${crypto.randomUUID()}-${kind}.txt`
  const filePath = path.join(baseDir, filename)
  const content = buildContextFileContent({
    kind,
    source: params.source,
    generatedAt: now.toISOString(),
    body,
    insertion: params.insertion,
  })
  const tempPath = `${filePath}.tmp-${process.pid}`
  try {
    await fsp.writeFile(tempPath, content, { encoding: 'utf8', mode: 0o600 })
    await fsp.rename(tempPath, filePath)
  } catch (error) {
    await fsp.rm(tempPath, { force: true }).catch(() => {})
    throw error
  }
  return {
    sessionId,
    filename,
    name: filename,
    path: filePath,
    bytes: Buffer.byteLength(content, 'utf8'),
  }
}

function registerContextFilesIpcHandlers(appPaths, dependencies = {}) {
  const baseDir = appPaths.contextFiles
  const filesBySession = new Map()
  const metadataByArtifact = new Map()
  const logDelivery =
    typeof dependencies.logDelivery === 'function' ? dependencies.logDelivery : null

  // Main-process callers normally pass `logQaEvent`; tests can inject a
  // collector. Diagnostics must never turn a successful handoff into an IPC
  // failure, so the callback is deliberately best effort.
  const recordDelivery = (event) => {
    if (!logDelivery) return
    try {
      const pending = logDelivery(buildContextDeliveryEntry(event))
      if (pending && typeof pending.catch === 'function') pending.catch(() => {})
    } catch {
      // QA logging is best effort.
    }
  }
  // Caminho absoluto do shim `felixo` desta instância. Devolvido ao lado do
  // arquivo para que o prompt possa mandar o agente rodar o executável exato
  // em vez de digitar o nome nu do comando: uma função de shell com o mesmo
  // nome (instalada por outra ferramenta no .bashrc/.zshrc da pessoa) vence
  // o PATH silenciosamente, e "felixo context read" acaba rodando outra
  // coisa — visto em relato real de agente que leu o arquivo certo só depois
  // de descobrir, por conta própria, que "felixo" ali era outro comando.
  const commandPath =
    typeof appPaths.bin === 'string' && appPaths.bin ? caminhoDoComando(appPaths.bin) : undefined

  void cleanupStaleContextFiles(baseDir).catch(() => {})

  ipcMain.handle('context-file:write', async (_event, params = {}) => {
    try {
      const result = await writeContextFile(baseDir, params)
      let files = filesBySession.get(result.sessionId)
      if (!files) {
        files = new Set()
        filesBySession.set(result.sessionId, files)
      }
      files.add(result.path)
      const metadata = {
        sessionId: result.sessionId,
        terminal: params.terminal ?? params.terminalId ?? result.sessionId,
        agent: params.agent ?? params.source,
        kind: params.kind,
        insertion: normalizeInsertionMetadata(params.insertion),
      }
      metadataByArtifact.set(result.filename, metadata)
      recordDelivery({ ...metadata, artifactId: result.filename, state: 'written' })
      return { ok: true, path: result.path, name: result.filename, bytes: result.bytes, commandPath }
    } catch (error) {
      recordDelivery({
        artifactId: params.artifactId ?? params.name,
        sessionId: params.sessionId,
        terminal: params.terminal ?? params.terminalId ?? params.sessionId,
        agent: params.agent ?? params.source,
        kind: params.kind,
        insertion: normalizeInsertionMetadata(params.insertion),
        state: 'failed',
        error: error instanceof Error ? error.message : String(error),
      })
      return toErrorResult(error, 'Não foi possível criar o arquivo temporário de contexto.')
    }
  })

  ipcMain.handle('context-file:path-typed', async (_event, params = {}) => {
    try {
      const sessionId = requireText(params.sessionId, 'sessionId')
      const names = Array.isArray(params.names)
        ? params.names
        : Array.isArray(params.artifactIds)
          ? params.artifactIds
          : []
      let marked = 0
      for (const value of names) {
        const name = typeof value === 'string' ? value.trim() : ''
        const metadata = metadataByArtifact.get(name)
        if (!metadata || metadata.sessionId !== sessionId) continue
        recordDelivery({
          ...metadata,
          artifactId: name,
          terminal: params.terminal ?? params.terminalId ?? metadata.terminal,
          agent: params.agent ?? metadata.agent,
          state: 'path-typed',
        })
        marked += 1
      }
      return { ok: true, marked }
    } catch (error) {
      recordDelivery({
        sessionId: params.sessionId,
        terminal: params.terminal ?? params.terminalId ?? params.sessionId,
        agent: params.agent,
        state: 'failed',
        error: error instanceof Error ? error.message : String(error),
      })
      return toErrorResult(error, 'Nao foi possivel registrar a digitacao do contexto.')
    }
  })

  ipcMain.handle('context-file:release', async (_event, params = {}) => {
    try {
      const sessionId = requireText(params.sessionId, 'sessionId')
      const files = filesBySession.get(sessionId) ?? new Set()
      let removed = 0
      for (const filePath of files) {
        if (await removeFileIfOwned(filePath, baseDir)) removed += 1
        metadataByArtifact.delete(path.basename(filePath))
      }
      filesBySession.delete(sessionId)
      return { ok: true, removed }
    } catch (error) {
      return toErrorResult(error, 'Não foi possível limpar os arquivos temporários de contexto.')
    }
  })

  return {
    baseDir,
    releaseSession: async (sessionId) => {
      const files = filesBySession.get(sessionId) ?? new Set()
      for (const filePath of files) {
        await removeFileIfOwned(filePath, baseDir)
        metadataByArtifact.delete(path.basename(filePath))
      }
      filesBySession.delete(sessionId)
    },
    dispose: async () => {
      for (const sessionId of filesBySession.keys()) {
        const files = filesBySession.get(sessionId) ?? new Set()
        for (const filePath of files) {
          await removeFileIfOwned(filePath, baseDir)
          metadataByArtifact.delete(path.basename(filePath))
        }
      }
      filesBySession.clear()
      metadataByArtifact.clear()
    },
  }
}

module.exports = {
  CONTEXT_FILE_PREFIX,
  MAX_CONTEXT_BYTES,
  STALE_CONTEXT_MAX_AGE_MS,
  buildContextFileContent,
  cleanupStaleContextFiles,
  normalizeKind,
  registerContextFilesIpcHandlers,
  writeContextFile,
}

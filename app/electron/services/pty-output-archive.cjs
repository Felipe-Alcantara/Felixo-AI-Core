'use strict'

/**
 * Arquivo em disco da saída dos terminais do canvas (PTY).
 *
 * O replay do processo principal (`pty-replay-buffer.cjs`) guarda só os
 * últimos 200.000 caracteres, e o xterm só as últimas 5.000 ou 20.000 linhas:
 * o começo de uma sessão longa sumia sem cópia em lugar nenhum. Aqui cada
 * sessão ganha uma pasta com a saída crua, em segmentos cujo nome é o offset
 * (em bytes) do primeiro byte deles. Apagar um segmento antigo não muda o
 * offset dos outros, então o "carregar mais" pagina por offset sem se perder.
 *
 * Decisões de 11/11/2026 (Felipe, task "arquivar a saída do PTY em disco"):
 * guarda por 14 dias, crua (sem redação de segredo; a pasta é do perfil do
 * usuário) e só entra na exportação do canvas quando a pessoa pede.
 *
 * O `append` roda dentro do `onData` de todo PTY: só empilha o pedaço (O(1)).
 * A escrita sai em lote, assíncrona e em ordem por sessão. Falha de disco
 * desliga o arquivo daquela sessão até ela ser fechada, e nunca chega ao
 * terminal.
 */

const crypto = require('node:crypto')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')

const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_MAX_AGE_MS = 14 * DAY_MS
const DEFAULT_SEGMENT_BYTES = 8 * 1024 * 1024
const DEFAULT_MAX_SESSION_BYTES = 64 * 1024 * 1024
const DEFAULT_MAX_TOTAL_BYTES = 1024 * 1024 * 1024
const DEFAULT_FLUSH_DELAY_MS = 250
/** Pendência acima disto sai já, sem esperar o lote: segura a memória de um PTY que despeja. */
const FLUSH_NOW_CHARS = 256 * 1024
const DEFAULT_PAGE_BYTES = 256 * 1024
const MAX_PAGE_BYTES = 4 * 1024 * 1024
const SEGMENT_PATTERN = /^(\d{16})\.log$/
const SESSION_DIR_PATTERN = /^[0-9a-f]{32}$/
/**
 * Prefixo do id de PTY de um bloco do canvas (`ptySessionIdForNode` em
 * `src/features/canvas/terminal/terminal-session-store.ts`). A exportação e a
 * importação do canvas falam em id de bloco; o arquivo, em id de PTY.
 */
const CANVAS_PTY_SESSION_PREFIX = 'canvas:'
/** Teto da exportação: a cauda de cada terminal e a soma de todos. */
const EXPORT_MAX_BYTES_PER_TERMINAL = 1024 * 1024
const EXPORT_MAX_TOTAL_BYTES = 8 * 1024 * 1024

/**
 * @param {object} options
 * @param {string} options.directory - Pasta raiz do arquivo (uma subpasta por sessão).
 * @param {number} [options.segmentBytes]
 * @param {number} [options.maxSessionBytes] - Segmentos mais antigos saem acima disto.
 * @param {number} [options.maxTotalBytes] - Teto de todas as sessões, aplicado na poda.
 * @param {number} [options.maxAgeMs] - Segmento sem escrita há mais que isto sai na poda.
 * @param {number} [options.flushDelayMs]
 * @param {() => number} [options.now]
 * @param {{ warn?: Function }} [options.logger]
 */
function createPtyOutputArchive(options = {}) {
  const directory = requireDirectory(options.directory)
  const segmentBytes = positiveInteger(options.segmentBytes, DEFAULT_SEGMENT_BYTES)
  const maxSessionBytes = Math.max(segmentBytes, positiveInteger(options.maxSessionBytes, DEFAULT_MAX_SESSION_BYTES))
  const maxTotalBytes = positiveInteger(options.maxTotalBytes, DEFAULT_MAX_TOTAL_BYTES)
  const maxAgeMs = positiveInteger(options.maxAgeMs, DEFAULT_MAX_AGE_MS)
  const flushDelayMs = Math.max(0, Number(options.flushDelayMs ?? DEFAULT_FLUSH_DELAY_MS) || 0)
  const now = typeof options.now === 'function' ? options.now : Date.now
  const logger = options.logger ?? console
  /** @type {Map<string, SessionState>} */
  const sessions = new Map()
  // Um timer para todas as sessões: um por sessão custava um setTimeout a
  // cada lote de cada terminal, ~25% do caminho por pedaço (benchmark:pty-output).
  let flushTimer = null

  /**
   * @typedef {{ start: number, bytes: number, path: string }} Segment
   * @typedef {{
   *   dir: string, pending: string[], pendingChars: number, chain: Promise<void>,
   *   loaded: boolean, segments: Segment[], handle: import('node:fs/promises').FileHandle | null,
   *   failed: boolean,
   * }} SessionState
   */

  function stateFor(sessionId) {
    let state = sessions.get(sessionId)
    if (!state) {
      state = {
        dir: path.join(directory, sessionDirName(sessionId)),
        pending: [],
        pendingChars: 0,
        chain: Promise.resolve(),
        loaded: false,
        segments: [],
        handle: null,
        failed: false,
      }
      sessions.set(sessionId, state)
    }
    return state
  }

  /** Caminho quente: só empilha. Quem grava é o lote. */
  function append(sessionId, text) {
    if (typeof text !== 'string' || text === '') return
    const state = stateFor(sessionId)
    if (state.failed) return
    state.pending.push(text)
    state.pendingChars += text.length
    if (state.pendingChars >= FLUSH_NOW_CHARS) {
      void flush(sessionId)
    } else if (flushTimer === null) {
      flushTimer = setTimeout(() => {
        flushTimer = null
        void flushAll()
      }, flushDelayMs)
      flushTimer.unref?.()
    }
  }

  function takePending(state) {
    if (state.pending.length === 0) return null
    const data = Buffer.from(state.pending.join(''), 'utf8')
    state.pending = []
    state.pendingChars = 0
    return data
  }

  /** Toda escrita de uma sessão passa por aqui, em ordem; o erro desliga a sessão. */
  function enqueue(state, task) {
    state.chain = state.chain.then(task).catch((error) => fail(state, error))
    return state.chain
  }

  function fail(state, error) {
    state.failed = true
    state.pending = []
    state.pendingChars = 0
    void closeHandle(state)
    logger.warn?.('[felixo] arquivo da saída do terminal desligado nesta sessão:', error?.message ?? String(error))
  }

  /** Grava o que está pendente. Resolve quando a escrita (e as anteriores) terminou. */
  function flush(sessionId) {
    const state = sessions.get(sessionId)
    if (!state) return Promise.resolve()
    const data = takePending(state)
    if (data && !state.failed) {
      return enqueue(state, () => writeData(state, data))
    }
    return state.chain
  }

  function flushAll() {
    return Promise.all([...sessions.keys()].map((sessionId) => flush(sessionId)))
  }

  /**
   * Para o `before-quit`: o processo sai sem esperar promessa, e o último lote
   * (até `flushDelayMs` de saída) se perderia. Grava síncrono no segmento atual.
   * Uma escrita assíncrona ainda em voo pode terminar depois desta (ou nunca):
   * aceito no fechamento do app, que já mata os PTYs no mesmo passo.
   */
  function flushAllSync() {
    for (const state of sessions.values()) {
      const data = takePending(state)
      const current = state.segments[state.segments.length - 1]
      // Sessão que nunca carregou os segmentos não sabe o offset: fica de fora.
      if (!data || state.failed || !state.loaded) continue
      try {
        fs.mkdirSync(state.dir, { recursive: true })
        const target = current ?? { start: 0, bytes: 0, path: segmentPath(state.dir, 0) }
        fs.appendFileSync(target.path, data)
        target.bytes += data.length
        if (!current) state.segments.push(target)
      } catch {
        // Melhor esforço no fechamento.
      }
    }
  }

  async function ensureLoaded(state) {
    if (state.loaded) return
    state.segments = await listSegments(state.dir)
    state.loaded = true
  }

  async function writeData(state, data) {
    await ensureLoaded(state)
    let current = state.segments[state.segments.length - 1]
    if (!current || current.bytes >= segmentBytes) {
      await closeHandle(state)
      const start = totalOf(state)
      current = { start, bytes: 0, path: segmentPath(state.dir, start) }
      state.segments.push(current)
    }
    if (!state.handle) {
      await fsp.mkdir(state.dir, { recursive: true })
      state.handle = await fsp.open(current.path, 'a')
    }
    // Um lote nunca é partido entre segmentos: o segmento passa do tamanho
    // por no máximo um lote, e um caractere UTF-8 nunca fica dividido.
    await state.handle.appendFile(data)
    current.bytes += data.length
    if (current.bytes >= segmentBytes) {
      await closeHandle(state)
      await dropOldestSegments(state)
      void prune().catch(() => {})
    }
  }

  async function dropOldestSegments(state) {
    let total = state.segments.reduce((sum, segment) => sum + segment.bytes, 0)
    while (state.segments.length > 1 && total > maxSessionBytes) {
      const oldest = state.segments.shift()
      total -= oldest.bytes
      await unlinkQuietly(oldest.path)
    }
  }

  async function closeHandle(state) {
    const handle = state.handle
    state.handle = null
    if (handle) {
      try {
        await handle.close()
      } catch {
        // Já fechado ou disco fora: nada a perder aqui.
      }
    }
  }

  /**
   * Trecho contínuo que termina em `before` (padrão: o fim), com até
   * `maxBytes`. O começo avança até o início de um caractere UTF-8; quem
   * pede a página anterior passa o `start` desta como `before`.
   *
   * @returns {Promise<{ text: string, start: number, end: number, total: number, firstOffset: number }>}
   */
  function read(sessionId, request = {}) {
    const state = stateFor(sessionId)
    const data = takePending(state)
    if (data && !state.failed) enqueue(state, () => writeData(state, data))
    const result = state.chain.then(() => readRange(state, request))
    // A leitura entra na fila (não lê no meio de uma escrita), mas o erro dela
    // é de quem leu: não desliga a gravação da sessão.
    state.chain = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  async function readRange(state, request) {
    await ensureLoaded(state)
    const firstOffset = state.segments[0]?.start ?? 0
    const total = totalOf(state)
    const maxBytes = boundedInteger(request.maxBytes, 1, MAX_PAGE_BYTES, DEFAULT_PAGE_BYTES)
    const before = Number.isSafeInteger(request.before) ? request.before : total
    const end = Math.min(Math.max(before, firstOffset), total)
    const start = Math.max(firstOffset, end - maxBytes)
    const bytes = await readBytes(state.segments, start, end)
    const skip = leadingContinuationBytes(bytes)
    return {
      text: bytes.subarray(skip).toString('utf8'),
      start: start + skip,
      end,
      total,
      firstOffset,
    }
  }

  /** Troca todo o arquivo da sessão por `text` (importação do canvas). */
  function replace(sessionId, text) {
    const state = stateFor(sessionId)
    takePending(state)
    const run = state.chain.then(async () => {
      await closeHandle(state)
      await ensureLoaded(state)
      for (const segment of state.segments) {
        await unlinkQuietly(segment.path)
      }
      state.segments = []
      state.failed = false
      const data = Buffer.from(String(text ?? ''), 'utf8')
      if (data.length > 0) await writeData(state, data)
      await closeHandle(state)
    })
    state.chain = run.then(
      () => undefined,
      (error) => fail(state, error),
    )
    return run
  }

  /** Fecha o arquivo aberto da sessão (o PTY saiu de cena); o que chegar depois reabre. */
  function close(sessionId) {
    const state = sessions.get(sessionId)
    if (!state) return Promise.resolve()
    const data = takePending(state)
    if (data && !state.failed) enqueue(state, () => writeData(state, data))
    return enqueue(state, async () => {
      await closeHandle(state)
      // Um PTY novo nesta sessão tenta o disco de novo.
      state.failed = false
    })
  }

  function closeAll() {
    return Promise.all([...sessions.keys()].map((sessionId) => close(sessionId)))
  }

  /**
   * Apaga o que passou de 14 dias sem escrita e, se a soma ainda passar do
   * teto, os segmentos mais antigos de qualquer sessão. Nunca apaga o
   * segmento em que uma sessão desta execução está escrevendo.
   */
  async function prune() {
    const cutoff = now() - maxAgeMs
    const active = new Set()
    for (const state of sessions.values()) {
      const current = state.segments[state.segments.length - 1]
      if (current) active.add(current.path)
    }

    let entries
    try {
      entries = await fsp.readdir(directory, { withFileTypes: true })
    } catch (error) {
      if (error?.code === 'ENOENT') return { removed: 0, totalBytes: 0 }
      throw error
    }

    const files = []
    const dirs = []
    for (const entry of entries) {
      if (!entry.isDirectory() || !SESSION_DIR_PATTERN.test(entry.name)) continue
      const dir = path.join(directory, entry.name)
      dirs.push(dir)
      for (const segment of await listSegments(dir).catch(() => [])) {
        const stat = await fsp.stat(segment.path).catch(() => null)
        if (stat) files.push({ path: segment.path, size: stat.size, mtimeMs: stat.mtimeMs })
      }
    }

    files.sort((a, b) => a.mtimeMs - b.mtimeMs)
    let totalBytes = files.reduce((sum, file) => sum + file.size, 0)
    const removed = new Set()
    for (const file of files) {
      // Em ordem de idade: o primeiro que não venceu, com a soma no teto, encerra.
      if (file.mtimeMs >= cutoff && totalBytes <= maxTotalBytes) break
      if (active.has(file.path)) continue
      if (await unlinkQuietly(file.path)) {
        totalBytes -= file.size
        removed.add(file.path)
      }
    }

    if (removed.size > 0) {
      for (const state of sessions.values()) {
        state.segments = state.segments.filter((segment) => !removed.has(segment.path))
      }
    }
    for (const dir of dirs) {
      // Só sai se ficou vazia; com segmento dentro, o rmdir falha e está certo.
      await fsp.rmdir(dir).catch(() => {})
    }
    return { removed: removed.size, totalBytes }
  }

  return {
    directory,
    append,
    flush,
    flushAll,
    flushAllSync,
    read,
    replace,
    close,
    closeAll,
    prune,
  }
}

/**
 * Cauda da saída de cada bloco, para a exportação do canvas. Bloco sem
 * arquivo não entra. Teto por terminal e no total, para o `.fxcanvas`
 * continuar abaixo do limite da importação.
 *
 * @param {ReturnType<typeof createPtyOutputArchive>} archive
 * @param {Array<{ id: string }>} nodes
 * @returns {Promise<Array<{ nodeId: string, text: string, truncated: boolean }>>}
 */
async function exportCanvasTerminalOutputs(archive, nodes) {
  const outputs = []
  let budget = EXPORT_MAX_TOTAL_BYTES
  for (const node of Array.isArray(nodes) ? nodes : []) {
    if (budget <= 0) break
    if (typeof node?.id !== 'string' || !node.id) continue
    const page = await archive.read(`${CANVAS_PTY_SESSION_PREFIX}${node.id}`, {
      maxBytes: Math.min(EXPORT_MAX_BYTES_PER_TERMINAL, budget),
    })
    if (!page.text) continue
    budget -= page.end - page.start
    outputs.push({ nodeId: node.id, text: page.text, truncated: page.start > 0 })
  }
  return outputs
}

/**
 * @param {ReturnType<typeof createPtyOutputArchive>} archive
 * @param {Array<{ nodeId: string, text: string }>} outputs - Já validadas por `parseCanvasBundle`.
 */
async function importCanvasTerminalOutputs(archive, outputs) {
  for (const output of Array.isArray(outputs) ? outputs : []) {
    await archive.replace(`${CANVAS_PTY_SESSION_PREFIX}${output.nodeId}`, output.text)
  }
}

async function listSegments(dir) {
  let names
  try {
    names = await fsp.readdir(dir)
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
  const segments = []
  for (const name of names) {
    const match = SEGMENT_PATTERN.exec(name)
    if (!match) continue
    const filePath = path.join(dir, name)
    const stat = await fsp.stat(filePath).catch(() => null)
    if (stat) segments.push({ start: Number(match[1]), bytes: stat.size, path: filePath })
  }
  return segments.sort((a, b) => a.start - b.start)
}

async function readBytes(segments, start, end) {
  const parts = []
  for (const segment of segments) {
    const segmentEnd = segment.start + segment.bytes
    if (segmentEnd <= start || segment.start >= end) continue
    const from = Math.max(start, segment.start)
    const to = Math.min(end, segmentEnd)
    const handle = await fsp.open(segment.path, 'r')
    try {
      const buffer = Buffer.alloc(to - from)
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, from - segment.start)
      parts.push(buffer.subarray(0, bytesRead))
    } finally {
      await handle.close()
    }
  }
  return Buffer.concat(parts)
}

/** Bytes de continuação (10xxxxxx) no começo: o trecho começou no meio de um caractere. */
function leadingContinuationBytes(buffer) {
  let count = 0
  while (count < buffer.length && count < 3 && (buffer[count] & 0xc0) === 0x80) {
    count += 1
  }
  return count
}

function totalOf(state) {
  const last = state.segments[state.segments.length - 1]
  return last ? last.start + last.bytes : 0
}

function segmentPath(dir, start) {
  return path.join(dir, `${String(start).padStart(16, '0')}.log`)
}

/** Hash e não o id: `canvas:...` tem `:`, que o Windows recusa em nome de pasta. */
function sessionDirName(sessionId) {
  return crypto.createHash('sha256').update(String(sessionId)).digest('hex').slice(0, 32)
}

async function unlinkQuietly(filePath) {
  try {
    await fsp.unlink(filePath)
    return true
  } catch {
    return false
  }
}

function requireDirectory(directory) {
  if (typeof directory !== 'string' || directory.trim() === '') {
    throw new Error('A pasta do arquivo da saída do terminal é obrigatória.')
  }
  return path.resolve(directory)
}

function positiveInteger(value, fallback) {
  const number = Math.floor(Number(value))
  return Number.isFinite(number) && number > 0 ? number : fallback
}

function boundedInteger(value, min, max, fallback) {
  const number = Math.floor(Number(value))
  return Number.isFinite(number) ? Math.min(Math.max(number, min), max) : fallback
}

module.exports = {
  CANVAS_PTY_SESSION_PREFIX,
  DEFAULT_MAX_AGE_MS,
  EXPORT_MAX_BYTES_PER_TERMINAL,
  EXPORT_MAX_TOTAL_BYTES,
  MAX_PAGE_BYTES,
  createPtyOutputArchive,
  exportCanvasTerminalOutputs,
  importCanvasTerminalOutputs,
}

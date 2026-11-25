'use strict'

const fs = require('node:fs')
const path = require('node:path')

/**
 * Conversas anteriores do Claude Code de uma conta por chave, para o `/resume`
 * do bloco de conversa.
 *
 * O Claude Code grava cada conversa em
 * `<CLAUDE_CONFIG_DIR>/projects/<pasta codificada>/<id>.jsonl`. Com a conta por
 * chave, `CLAUDE_CONFIG_DIR` é a pasta do perfil dela, então só aparecem as
 * conversas dessa conta naquele projeto. Mesma codificação de pasta de
 * `agent-session-discovery.cjs` (conferida no pacote 2.1.283).
 */

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_SESSIONS = 20
const MAX_TRANSCRIPT_ENTRIES = 300
const MAX_TEXT = 20_000
const CHUNK_BYTES = 1024 * 1024
const BIG_LINE = 100_000
const BASE64_DATA = /"data":"[A-Za-z0-9+/=]{256,}"/g

function encodeProjectDir(cwd) {
  return cwd.split(path.sep).join('-').replace(/[^A-Za-z0-9_-]/g, '-')
}

function projectDir(configDir, cwd) {
  return path.join(configDir, 'projects', encodeProjectDir(cwd))
}

/**
 * Lê o `.jsonl` por linhas, em blocos de 1 MB, sem carregar o arquivo inteiro. O base64 das
 * imagens (`"data":"..."`) é esvaziado antes do parse: o bloco só precisa da contagem.
 */
function forEachEntry(fileSystem, file, onEntry) {
  const fd = fileSystem.openSync(file, 'r')
  const buffer = Buffer.allocUnsafe(CHUNK_BYTES)
  let pending = []
  const flush = () => {
    let line = Buffer.concat(pending).toString('utf8')
    pending = []
    if (!line.trim()) return
    if (line.length > BIG_LINE) line = line.replace(BASE64_DATA, '"data":""')
    try {
      onEntry(JSON.parse(line))
    } catch {
      // Linha cortada no fim de um arquivo ainda em escrita.
    }
  }
  try {
    for (;;) {
      const read = fileSystem.readSync(fd, buffer, 0, CHUNK_BYTES, null)
      if (read === 0) break
      let start = 0
      for (let i = buffer.indexOf(10, 0); i !== -1 && i < read; i = buffer.indexOf(10, start)) {
        pending.push(Buffer.from(buffer.subarray(start, i)))
        flush()
        start = i + 1
      }
      if (start < read) pending.push(Buffer.from(buffer.subarray(start, read)))
    }
    flush()
  } finally {
    fileSystem.closeSync(fd)
  }
}

/** Texto do que a pessoa digitou; `null` para resultado de ferramenta e mensagens internas. */
function userText(entry) {
  if (entry?.type !== 'user' || entry.isMeta || entry.isSidechain) return null
  const content = entry.message?.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return null
  if (content.some((part) => part?.type === 'tool_result')) return null
  const text = content
    .filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n')
  return text || null
}

/** Imagens que a pessoa colou na mensagem (o bloco manda em base64). */
function userImageCount(entry) {
  if (entry?.type !== 'user' || entry.isMeta || entry.isSidechain) return 0
  const content = entry.message?.content
  if (!Array.isArray(content) || content.some((part) => part?.type === 'tool_result')) return 0
  return content.filter((part) => part?.type === 'image').length
}

/** O que a pessoa mandou: texto e quantas imagens. `null` quando não é mensagem dela. */
function userMessage(entry) {
  const text = userText(entry)
  const images = userImageCount(entry)
  if (text === null && images === 0) return null
  return { text: text ?? '', images }
}

function describeImages(count) {
  return count === 1 ? '(1 imagem)' : `(${count} imagens)`
}

function clip(text, max = MAX_TEXT) {
  return text.length > max ? `${text.slice(0, max)}\n… (texto cortado)` : text
}

/**
 * @param {{ configDir: string, cwd: string, fileSystem?: typeof fs }} options
 * @returns {Array<{ sessionId: string, updatedAt: string, firstPrompt: string, turns: number }>}
 */
function listClaudeApiSessions({ configDir, cwd, fileSystem = fs }) {
  if (!configDir || !cwd) return []
  const dir = projectDir(configDir, cwd)
  let names
  try {
    names = fileSystem.readdirSync(dir)
  } catch {
    return []
  }
  const sessions = []
  for (const name of names) {
    if (!name.endsWith('.jsonl')) continue
    const sessionId = name.slice(0, -'.jsonl'.length)
    if (!SESSION_ID.test(sessionId)) continue
    const file = path.join(dir, name)
    let stat
    try {
      stat = fileSystem.statSync(file)
    } catch {
      continue
    }
    let first = null
    let turns = 0
    try {
      forEachEntry(fileSystem, file, (entry) => {
        const message = userMessage(entry)
        if (!message || message.text.startsWith('<')) return
        turns += 1
        first ??= message.text || describeImages(message.images)
      })
    } catch {
      continue
    }
    if (turns === 0) continue
    sessions.push({
      sessionId,
      updatedAt: stat.mtime.toISOString(),
      firstPrompt: first.replace(/\s+/g, ' ').trim().slice(0, 120),
      turns,
    })
  }
  return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, MAX_SESSIONS)
}

/**
 * Histórico de uma conversa, no formato que o bloco já entende.
 *
 * @returns {Array<
 *   | { role: 'user', text: string, images?: number }
 *   | { role: 'assistant', text: string }
 *   | { role: 'tool', toolUseId: string, name: string, input: Record<string, unknown> }
 *   | { role: 'tool-result', toolUseId: string, isError: boolean, text: string }
 * > | null} `null` quando a conversa não existe.
 */
function readClaudeApiTranscript({ configDir, cwd, sessionId, fileSystem = fs }) {
  if (!configDir || !cwd || !SESSION_ID.test(sessionId ?? '')) return null
  const file = path.join(projectDir(configDir, cwd), `${sessionId}.jsonl`)
  const out = []
  try {
    forEachEntry(fileSystem, file, (entry) => collect(entry, out))
  } catch {
    return null
  }
  return out.slice(-MAX_TRANSCRIPT_ENTRIES)
}

function collect(entry, out) {
  if (entry.isSidechain) return
  const typed = userMessage(entry)
  if (typed !== null) {
    out.push({ role: 'user', text: clip(typed.text), ...(typed.images ? { images: typed.images } : {}) })
    return
  }
  const content = entry.message?.content
  if (entry.type === 'user' && Array.isArray(content)) {
    for (const part of content) {
      if (part?.type === 'tool_result' && typeof part.tool_use_id === 'string') {
        const body = typeof part.content === 'string'
          ? part.content
          : Array.isArray(part.content)
            ? part.content.filter((p) => p?.type === 'text').map((p) => p.text).join('\n')
            : ''
        out.push({ role: 'tool-result', toolUseId: part.tool_use_id, isError: part.is_error === true, text: clip(body, 4000) })
      }
    }
    return
  }
  if (entry.type === 'assistant' && Array.isArray(content) && entry.message?.model !== '<synthetic>') {
    for (const part of content) {
      if (part?.type === 'text' && typeof part.text === 'string' && part.text) {
        out.push({ role: 'assistant', text: clip(part.text) })
      } else if (part?.type === 'tool_use' && typeof part.id === 'string') {
        out.push({
          role: 'tool',
          toolUseId: part.id,
          name: typeof part.name === 'string' ? part.name : 'ferramenta',
          input: part.input && typeof part.input === 'object' ? part.input : {},
        })
      }
    }
  }
}

module.exports = {
  encodeProjectDir,
  listClaudeApiSessions,
  readClaudeApiTranscript,
}

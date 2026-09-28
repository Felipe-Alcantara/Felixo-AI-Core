const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$/
const MAX_FILES = 3000

/**
 * Variáveis do ambiente do terminal que mudam onde cada CLI grava o
 * histórico. Um terminal com conta própria grava na pasta do perfil
 * (`CODEX_HOME`, `CLAUDE_CONFIG_DIR`, `HOME` do Gemini), então procurar na
 * pasta do login do sistema nunca achava a conversa, ou achava a de outra
 * conta aberta no mesmo diretório.
 */
const DISCOVERY_ENV_KEYS = Object.freeze(['CODEX_HOME', 'CLAUDE_CONFIG_DIR', 'GEMINI_HOME'])

/**
 * Só o que a descoberta lê do ambiente com que o terminal nasceu. O resto do
 * ambiente (chaves de API inclusive) não é guardado junto da sessão.
 *
 * @param {Record<string, string | undefined>} env - Ambiente do spawn.
 * @returns {{ env: Record<string, string>, homeDir: string | undefined }}
 *   `homeDir` só vem quando o perfil troca a HOME (Gemini); sem ele vale a
 *   home do sistema.
 */
function selectDiscoveryContext(env = {}) {
  const picked = {}
  for (const key of DISCOVERY_ENV_KEYS) {
    if (typeof env[key] === 'string' && env[key]) picked[key] = env[key]
  }
  const profileHome = typeof env.FELIXO_PROFILE_HOME === 'string' && env.FELIXO_PROFILE_HOME
    ? env.FELIXO_PROFILE_HOME
    : undefined
  return { env: picked, homeDir: profileHome }
}

/**
 * Finds only provider-owned session metadata created around this PTY spawn.
 * It never reads prompts, tool output, credentials or the conversation body.
 */
function discoverAgentSession({ command, cwd, startedAt, now = Date.now(), homeDir = os.homedir(), env = process.env }) {
  if (!command || !cwd || !Number.isFinite(startedAt)) return null

  const candidates = command === 'codex'
    ? discoverCodexSessions({ cwd, startedAt, now, homeDir, env })
    : command === 'gemini'
      ? discoverGeminiSessions({ cwd, startedAt, now, homeDir, env })
      : command === 'claude'
        ? discoverClaudeSessions({ cwd, startedAt, now, homeDir, env })
      : []

  if (candidates.length === 0) return null

  candidates.sort((left, right) => {
    const leftDistance = Math.abs(left.mtimeMs - startedAt)
    const rightDistance = Math.abs(right.mtimeMs - startedAt)
    return leftDistance - rightDistance
  })

  // Two sessions started at the same time in the same workspace cannot be
  // associated safely by filesystem timestamps. Refuse instead of resuming
  // another conversation.
  if (candidates.length > 1) {
    const distance = Math.abs(candidates[0].mtimeMs - candidates[1].mtimeMs)
    if (distance < 250) return null
  }

  const candidate = candidates[0]
  return {
    version: 1,
    provider: command,
    sessionId: candidate.sessionId,
    cwd,
    capturedAt: now,
    source: 'cli-history',
  }
}

function discoverCodexSessions({ cwd, startedAt, now, homeDir, env }) {
  const root = env.CODEX_HOME || path.join(homeDir, '.codex')
  const files = collectFiles(path.join(root, 'sessions'), (name) => /^rollout-.*\.jsonl$/.test(name))
  return files.flatMap((file) => readCandidate(file, { cwd, startedAt, now }, readCodexMetadata))
}

function discoverGeminiSessions({ cwd, startedAt, now, homeDir, env }) {
  const root = env.GEMINI_HOME || path.join(homeDir, '.gemini', 'tmp')
  const projectDirs = collectDirectories(root)
    .filter((directory) => readText(path.join(directory, '.project_root')) === cwd)
  return projectDirs.flatMap((directory) => {
    const files = collectFiles(path.join(directory, 'chats'), (name) => /^session-.*\.jsonl$/.test(name))
    return files.flatMap((file) =>
      readCandidate(file, { cwd, startedAt, now }, (line) => ({
        ...readGeminiMetadata(line),
        cwd,
      })),
    )
  })
}

function discoverClaudeSessions({ cwd, startedAt, now, homeDir, env }) {
  const encodedProject = cwd
    .split(path.sep)
    .join('-')
    .replace(/[^A-Za-z0-9_-]/g, '-')
  // Mesma regra da CLI (conferida no pacote 2.1.283): `projects/` fica dentro
  // de CLAUDE_CONFIG_DIR quando ela existe, e só na falta dela em ~/.claude.
  const root = env.CLAUDE_CONFIG_DIR || path.join(homeDir, '.claude')
  const files = collectFiles(
    path.join(root, 'projects', encodedProject),
    (name) => name.endsWith('.jsonl'),
  )
  return files.flatMap((file) =>
    readCandidate(file, { cwd, startedAt, now }, (line) => ({
      ...readClaudeMetadata(line),
      cwd,
    })),
  )
}

function readCandidate(file, bounds, parseMetadata) {
  let stat
  try {
    stat = fs.statSync(file)
  } catch {
    return []
  }

  if (stat.mtimeMs < bounds.startedAt - 2000 || stat.mtimeMs > bounds.now + 2000) {
    return []
  }

  const metadata = parseMetadata(readFirstLine(file))
  if (!metadata || metadata.cwd !== bounds.cwd || !isSafeSessionId(metadata.sessionId)) {
    return []
  }

  return [{ sessionId: metadata.sessionId, mtimeMs: stat.mtimeMs }]
}

function readCodexMetadata(line) {
  const payload = parseJson(line)?.payload
  if (!payload || typeof payload !== 'object') return null
  return {
    sessionId: payload.session_id || payload.id,
    cwd: payload.cwd,
  }
}

function readGeminiMetadata(line) {
  const payload = parseJson(line)
  if (!payload || typeof payload !== 'object') return null
  return {
    sessionId: payload.sessionId,
    cwd: undefined,
  }
}

function readClaudeMetadata(line) {
  const payload = parseJson(line)
  if (!payload || typeof payload !== 'object') return null
  return {
    sessionId: payload.sessionId,
    cwd: undefined,
  }
}

function isSafeSessionId(value) {
  return typeof value === 'string' && SESSION_ID_PATTERN.test(value)
}

function collectDirectories(root) {
  try {
    return fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(root, entry.name))
  } catch {
    return []
  }
}

function collectFiles(root, predicate) {
  const result = []
  const queue = [root]
  while (queue.length > 0 && result.length < MAX_FILES) {
    const directory = queue.shift()
    let entries
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name)
      if (entry.isDirectory()) queue.push(fullPath)
      else if (entry.isFile() && predicate(entry.name)) result.push(fullPath)
      if (result.length >= MAX_FILES) break
    }
  }
  return result
}

function readFirstLine(file) {
  try {
    const fd = fs.openSync(file, 'r')
    const buffer = Buffer.alloc(64 * 1024)
    const size = fs.readSync(fd, buffer, 0, buffer.length, 0)
    fs.closeSync(fd)
    return buffer.toString('utf8', 0, size).split(/\r?\n/, 1)[0]
  } catch {
    return ''
  }
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8').trim()
  } catch {
    return ''
  }
}

function parseJson(value) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

module.exports = { DISCOVERY_ENV_KEYS, discoverAgentSession, selectDiscoveryContext }

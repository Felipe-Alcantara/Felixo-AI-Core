const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

// Mesma regra do renderer (`SESSION_ID_PATTERN` em agent-session.ts): um ID
// fora dela nunca vira referência, venha do histórico ou dos argumentos.
const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$/
const MAX_FILES = 3000
// Folga das datas de arquivo em volta do spawn (relógio de disco grosso).
const TIMESTAMP_TOLERANCE_MS = 2000
// Na busca ancorada na escrita, o arquivo da conversa nova nasce DEPOIS da
// escrita (a CLI só cria o histórico ao receber a mensagem). A folga para trás
// cobre só disco que trunca a data no segundo; maior que isso aceitaria a
// conversa de outro terminal que nasceu logo antes.
const CREATED_AFTER_TOLERANCE_MS = 1000
// Duas conversas mexidas a menos disto uma da outra não se separam por data.
const AMBIGUITY_WINDOW_MS = 250

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
 *
 * `createdAfter` (ms) troca a âncora da busca: em vez de "arquivo mexido perto
 * do spawn", só conta arquivo NASCIDO depois desse instante, e ganha o que
 * nasceu mais perto dele (a folga de 1 s para trás só entra quando nenhum
 * nasceu depois; ver `preferBornAfter`). É o que o gerenciador de PTY usa
 * quando a primeira mensagem chega depois da janela do spawn: minutos depois,
 * "mexido perto do spawn" pegaria a conversa de outro terminal ativo no mesmo
 * diretório.
 *
 * `excludeSessionIds` são conversas que já pertencem a outro terminal do app;
 * elas não concorrem (nem geram falso "ambíguo").
 *
 * `platform` só muda a regra de caixa do `.project_root` do Gemini; existe
 * para o teste simular o Windows em qualquer sistema.
 */
function discoverAgentSession({
  command,
  cwd,
  startedAt,
  createdAfter,
  excludeSessionIds,
  now = Date.now(),
  homeDir = os.homedir(),
  env = process.env,
  platform = process.platform,
}) {
  if (!command || !cwd || !Number.isFinite(startedAt)) return null

  const anchoredToCreation = Number.isFinite(createdAfter)
  const referenceAt = anchoredToCreation ? createdAfter : startedAt
  const bounds = {
    cwd,
    startedAt: referenceAt,
    now,
    createdAfter: anchoredToCreation ? createdAfter : null,
  }
  const request = { cwd, bounds, homeDir, env, platform }

  const found = command === 'codex'
    ? discoverCodexSessions(request)
    : command === 'gemini'
      ? discoverGeminiSessions(request)
      : command === 'claude'
        ? discoverClaudeSessions(request)
      : []

  const excluded = new Set(Array.isArray(excludeSessionIds) ? excludeSessionIds : [])
  const available = found.filter((candidate) => !excluded.has(candidate.sessionId))
  const candidates = dedupeBySessionId(
    anchoredToCreation ? preferBornAfter(available, createdAfter) : available,
    referenceAt,
  )

  if (candidates.length === 0) return null

  candidates.sort((left, right) =>
    Math.abs(left.anchorMs - referenceAt) - Math.abs(right.anchorMs - referenceAt),
  )

  // Two sessions started at the same time in the same workspace cannot be
  // associated safely by filesystem timestamps. Refuse instead of resuming
  // another conversation.
  if (candidates.length > 1) {
    const distance = Math.abs(candidates[0].anchorMs - candidates[1].anchorMs)
    if (distance < AMBIGUITY_WINDOW_MS) return null
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

function discoverCodexSessions({ bounds, homeDir, env }) {
  const root = env.CODEX_HOME || path.join(homeDir, '.codex')
  const files = collectFiles(path.join(root, 'sessions'), (name) => /^rollout-.*\.jsonl$/.test(name))
  return files.flatMap((file) => readCandidate(file, bounds, readCodexMetadata))
}

function discoverGeminiSessions({ cwd, bounds, homeDir, env, platform }) {
  const root = env.GEMINI_HOME || path.join(homeDir, '.gemini', 'tmp')
  // O Gemini grava o `.project_root` já normalizado e compara os dois lados
  // normalizados; comparar com `===` fazia a descoberta nunca casar no
  // Windows (lá ele grava tudo em minúsculas, até a letra do disco).
  const projectRoot = normalizeGeminiProjectRoot(cwd, platform)
  const projectDirs = collectDirectories(root).filter((directory) => {
    const owner = readText(path.join(directory, '.project_root'))
    return Boolean(owner) && normalizeGeminiProjectRoot(owner, platform) === projectRoot
  })
  return projectDirs.flatMap((directory) => {
    const files = collectFiles(path.join(directory, 'chats'), (name) => /^session-.*\.jsonl$/.test(name))
    return files.flatMap((file) =>
      readCandidate(file, bounds, (line) => ({
        ...readGeminiMetadata(line),
        cwd,
      })),
    )
  })
}

/**
 * Mesma normalização do Gemini (`ProjectRegistry.normalizePath`, conferida
 * no pacote 0.57.0): `path.resolve` e, só no win32, minúsculas. No macOS e no
 * Linux ele preserva a caixa, então aqui também: lá duas pastas que diferem
 * só na caixa podem ser projetos diferentes.
 */
function normalizeGeminiProjectRoot(value, platform) {
  if (platform === 'win32') return path.win32.resolve(value).toLowerCase()
  return path.posix.resolve(value)
}

function discoverClaudeSessions({ cwd, bounds, homeDir, env }) {
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
    readCandidate(file, bounds, (line) => {
      const metadata = readClaudeMetadata(line)
      return metadata ? { ...metadata, cwd } : null
    }),
  )
}

function readCandidate(file, bounds, parseMetadata) {
  let stat
  try {
    stat = fs.statSync(file)
  } catch {
    return []
  }

  if (stat.mtimeMs < bounds.startedAt - TIMESTAMP_TOLERANCE_MS || stat.mtimeMs > bounds.now + TIMESTAMP_TOLERANCE_MS) {
    return []
  }

  // Busca ancorada na escrita: vale a data de criação. Conversa de outro
  // terminal que continua ativa tem mtime recente, mas nasceu antes da
  // escrita, e não pode passar pela conversa nova deste. Sistema de arquivos
  // sem data de criação devolve 0: aí resta o mtime.
  let anchorMs = stat.mtimeMs
  if (bounds.createdAfter !== null && bounds.createdAfter !== undefined) {
    anchorMs = stat.birthtimeMs > 0 ? stat.birthtimeMs : stat.mtimeMs
    if (anchorMs < bounds.createdAfter - CREATED_AFTER_TOLERANCE_MS) return []
  }

  const metadata = parseMetadata(readFirstLine(file))
  if (!metadata || metadata.cwd !== bounds.cwd || !isSafeSessionId(metadata.sessionId)) {
    return []
  }

  return [{ sessionId: metadata.sessionId, anchorMs }]
}

/**
 * Na busca ancorada na escrita, a folga para trás
 * ({@link CREATED_AFTER_TOLERANCE_MS}) só vale quando nenhum arquivo nasceu
 * em ou depois da escrita. Com a distância absoluta, a conversa de outro
 * terminal nascida 300 ms ANTES do Enter vencia a deste, nascida 600 ms
 * depois; a folga existe para o disco que trunca a data, não para competir
 * com quem nasceu do lado certo.
 */
function preferBornAfter(candidates, createdAfter) {
  const bornAfter = candidates.filter((candidate) => candidate.anchorMs >= createdAfter)
  return bornAfter.length > 0 ? bornAfter : candidates
}

/**
 * A mesma conversa em mais de um arquivo não é ambiguidade: fica o arquivo
 * mais perto da âncora. Sem isso, dois arquivos da MESMA sessão mexidos juntos
 * caíam na regra dos 250 ms e a descoberta devolvia "ambíguo" para uma
 * conversa só.
 */
function dedupeBySessionId(candidates, referenceAt) {
  const bySession = new Map()
  for (const candidate of candidates) {
    const current = bySession.get(candidate.sessionId)
    if (!current || Math.abs(candidate.anchorMs - referenceAt) < Math.abs(current.anchorMs - referenceAt)) {
      bySession.set(candidate.sessionId, candidate)
    }
  }
  return [...bySession.values()]
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
  // Transcrição de subagente (`<sessionId>/subagents/agent-*.jsonl`, que a
  // varredura recursiva alcança) começa com `isSidechain: true` e carrega o
  // sessionId da conversa-mãe. Não é conversa que se retome; na busca
  // ancorada na escrita, o subagente de OUTRA conversa nascido depois da
  // escrita passaria pela conversa nova deste terminal.
  if (payload.isSidechain === true) return null
  return {
    sessionId: payload.sessionId,
    cwd: undefined,
  }
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
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

module.exports = { DISCOVERY_ENV_KEYS, discoverAgentSession, isSafeSessionId, selectDiscoveryContext }

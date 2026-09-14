'use strict'

const fs = require('node:fs')
const fsPromises = require('node:fs/promises')
const path = require('node:path')
const { redactSensitiveText, isSensitiveKeyName } = require('./git-secret-redaction.cjs')

const QA_LOG_FILE_PATTERN = /^qa-(\d{4}-\d{2}-\d{2})\.jsonl$/
const DEFAULT_MAX_DAYS = 14
const DEFAULT_MAX_TOTAL_BYTES = 5 * 1024 * 1024 // 5 MiB

/**
 * Persistência do QA Logger em disco, com rotação por dia e por tamanho.
 *
 * Diferente de `terminal-log-store` (que apaga seu arquivo a cada reinício —
 * a saída de terminal é da sessão atual), este store existe justamente para
 * sobreviver ao restart: reiniciar o app é o contorno que o Felipe usa quando
 * algo trava, e é exatamente o que apagava o log até aqui (task
 * "Observabilidade — capturar erros com causa, persistir em disco").
 *
 * Um arquivo `.jsonl` por dia civil (`qa-AAAA-MM-DD.jsonl`), cada linha um
 * registro já redigido (`redactValue`, reaproveitando `redactSensitiveText`
 * de `git-secret-redaction.cjs` — o texto persistido nunca deve carregar
 * segredo). Rotação: arquivos com mais de `maxDays` dias são apagados; se o
 * total ainda passar de `maxTotalBytes`, os mais antigos saem primeiro até
 * caber.
 */
function createQaLogDiskStore(options = {}) {
  const directory = normalizeDirectory(options.directory)
  const fileSystem = options.fs ?? fs
  const fileSystemPromises = options.fsPromises ?? fsPromises
  const maxDays = Number.isFinite(options.maxDays) ? options.maxDays : DEFAULT_MAX_DAYS
  const maxTotalBytes = Number.isFinite(options.maxTotalBytes) ? options.maxTotalBytes : DEFAULT_MAX_TOTAL_BYTES
  const now = options.now ?? (() => new Date())

  fileSystem.mkdirSync(directory, { recursive: true })

  // Serializa as escritas: `append` é chamado de qualquer lugar do processo
  // (handlers de erro incluídos), e escritas fora de ordem embaralhariam a
  // linha do tempo do log num crash real.
  let writeQueue = Promise.resolve()

  function todayFilePath() {
    return path.join(directory, `qa-${dayKey(now())}.jsonl`)
  }

  function append(entry) {
    const line = `${JSON.stringify(redactValue(entry))}\n`
    const task = writeQueue.then(() => fileSystemPromises.appendFile(todayFilePath(), line, 'utf8'))
    // Uma escrita que falhar não pode travar as próximas — o log em disco é
    // best-effort; o buffer em memória do qa-logger continua funcionando.
    writeQueue = task.catch(() => {})
    return task
  }

  async function flush() {
    await writeQueue
  }

  /** Lê as últimas `limit` entradas, do arquivo mais recente pra trás, para hidratar o buffer em memória depois de um restart. */
  async function loadRecent(limit) {
    const files = listLogFiles(directory, fileSystem).sort().reverse()
    const collected = []

    for (const file of files) {
      if (collected.length >= limit) break
      let content = ''
      try {
        content = await fileSystemPromises.readFile(path.join(directory, file), 'utf8')
      } catch {
        continue
      }
      const parsed = parseJsonLines(content)
      collected.unshift(...parsed.slice(-Math.max(0, limit - collected.length)))
    }

    return collected.slice(-limit)
  }

  /** Remove arquivos com mais de `maxDays` dias e, se ainda passar de `maxTotalBytes`, os mais antigos até caber. */
  async function prune() {
    const files = listLogFiles(directory, fileSystem)
    const cutoff = now().getTime() - maxDays * 24 * 60 * 60 * 1000
    const kept = []

    for (const file of files) {
      const fileDate = new Date(`${QA_LOG_FILE_PATTERN.exec(file)[1]}T00:00:00.000Z`).getTime()
      if (fileDate < cutoff) {
        await fileSystemPromises.rm(path.join(directory, file), { force: true })
        continue
      }
      kept.push(file)
    }

    await pruneBySize(kept.sort())
  }

  async function pruneBySize(sortedOldestFirst) {
    const sizes = await Promise.all(
      sortedOldestFirst.map(async (file) => {
        try {
          const stat = await fileSystemPromises.stat(path.join(directory, file))
          return { file, size: stat.size }
        } catch {
          return { file, size: 0 }
        }
      }),
    )

    let total = sizes.reduce((sum, entry) => sum + entry.size, 0)
    for (const entry of sizes) {
      if (total <= maxTotalBytes) break
      await fileSystemPromises.rm(path.join(directory, entry.file), { force: true })
      total -= entry.size
    }
  }

  return { append, flush, loadRecent, prune, getDirectory: () => directory }
}

function listLogFiles(directory, fileSystem) {
  try {
    return fileSystem.readdirSync(directory).filter((name) => QA_LOG_FILE_PATTERN.test(name))
  } catch {
    return []
  }
}

function parseJsonLines(content) {
  const entries = []
  for (const line of content.split('\n')) {
    if (!line.trim()) continue
    try {
      entries.push(JSON.parse(line))
    } catch {
      // Linha corrompida (escrita truncada por um crash no meio do append) não pode derrubar o carregamento das demais.
    }
  }
  return entries
}

function dayKey(date) {
  return date.toISOString().slice(0, 10)
}

function normalizeDirectory(directory) {
  if (typeof directory !== 'string' || !directory.trim()) {
    throw new Error('Diretório do QA log em disco não informado.')
  }
  return path.resolve(directory)
}

/**
 * Redige recursivamente todo texto de um valor JSON antes de gravar em
 * disco — `details` de um evento pode carregar qualquer coisa (env vars,
 * argumentos de CLI, resposta de rede), então a redação não pode se limitar
 * a `message`.
 *
 * Duas fontes de sinal, porque nenhuma cobre a outra: `redactSensitiveText`
 * acha o rótulo DENTRO do próprio texto ("token=abc..."); mas um objeto
 * estruturado como `{"password": "abc..."}` carrega o rótulo só no NOME da
 * propriedade — a string sozinha ("abc...") não tem "password:" nela pra
 * `redactSensitiveText` casar. Por isso o valor inteiro vira `***` quando a
 * própria chave já é sensível, antes mesmo de tentar redigir o conteúdo.
 */
function redactValue(value, depth = 0, keyName) {
  if (isSensitiveKeyName(keyName)) return '***'
  if (depth > 8) return '[profundidade máxima atingida]'
  if (typeof value === 'string') return redactSensitiveText(value)
  if (Array.isArray(value)) return value.map((item) => redactValue(item, depth + 1))
  if (value && typeof value === 'object') {
    const redacted = {}
    for (const [key, item] of Object.entries(value)) {
      redacted[key] = redactValue(item, depth + 1, key)
    }
    return redacted
  }
  return value
}

module.exports = {
  QA_LOG_FILE_PATTERN,
  createQaLogDiskStore,
  redactValue,
}

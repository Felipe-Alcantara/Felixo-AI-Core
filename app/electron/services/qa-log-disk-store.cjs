'use strict'

const fs = require('node:fs')
const fsPromises = require('node:fs/promises')
const path = require('node:path')
const { redactSensitiveText, isSensitiveKeyName } = require('./git-secret-redaction.cjs')
const { redactSecrets } = require('./official-cli-account-status.cjs')

// `qa-AAAA-MM-DD.jsonl` é a primeira parte do dia; `qa-AAAA-MM-DD.N.jsonl`, as seguintes.
const QA_LOG_FILE_PATTERN = /^qa-(\d{4}-\d{2}-\d{2})(?:\.(\d+))?\.jsonl$/
const DEFAULT_MAX_DAYS = 14
const DEFAULT_MAX_TOTAL_BYTES = 5 * 1024 * 1024 // 5 MiB
const DEFAULT_MAX_PART_BYTES = 1024 * 1024 // 1 MiB

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
 *
 * O dia é gravado em partes de até `maxPartBytes`, e o prune roda também
 * durante a execução (ao virar o dia ou abrir uma parte), nunca apagando a
 * parte em uso: antes ele só rodava no boot e, com o arquivo do dia sozinho
 * acima do orçamento, apagava o dia inteiro.
 */
function createQaLogDiskStore(options = {}) {
  const directory = normalizeDirectory(options.directory)
  const fileSystem = options.fs ?? fs
  const fileSystemPromises = options.fsPromises ?? fsPromises
  const maxDays = Number.isFinite(options.maxDays) ? options.maxDays : DEFAULT_MAX_DAYS
  const maxTotalBytes = Number.isFinite(options.maxTotalBytes) ? options.maxTotalBytes : DEFAULT_MAX_TOTAL_BYTES
  const maxPartBytes = Number.isFinite(options.maxPartBytes) ? options.maxPartBytes : DEFAULT_MAX_PART_BYTES
  const now = options.now ?? (() => new Date())

  fileSystem.mkdirSync(directory, { recursive: true })

  // Serializa as escritas: `append` é chamado de qualquer lugar do processo
  // (handlers de erro incluídos), e escritas fora de ordem embaralhariam a
  // linha do tempo do log num crash real.
  let writeQueue = Promise.resolve()
  // Parte em uso, `{ day, part, bytes }`: descoberta no disco na primeira escrita de cada dia.
  let current = null

  function latestPartOf(day) {
    const parts = listLogFiles(directory, fileSystem)
      .map(parseLogFileName)
      .filter((file) => file.day === day)
    const part = parts.reduce((max, file) => Math.max(max, file.part), 0)
    let bytes = 0
    try {
      bytes = fileSystem.statSync(path.join(directory, logFileName(day, part))).size
    } catch {
      // Ainda não existe: a parte começa vazia.
    }
    return { day, part, bytes }
  }

  function append(entry) {
    const line = `${JSON.stringify(redactValue(entry))}\n`
    const lineBytes = Buffer.byteLength(line, 'utf8')
    const task = writeQueue.then(async () => {
      const day = dayKey(now())
      let opened = false
      if (current?.day !== day) {
        current = latestPartOf(day)
        opened = true
      }
      if (current.bytes > 0 && current.bytes + lineBytes > maxPartBytes) {
        current = { day, part: current.part + 1, bytes: 0 }
        opened = true
      }
      current.bytes += lineBytes
      await fileSystemPromises.appendFile(path.join(directory, logFileName(day, current.part)), line, 'utf8')
      if (opened) {
        await prune().catch(() => {})
      }
    })
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
    const files = listLogFiles(directory, fileSystem).sort(compareLogFiles).reverse()
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
    const inUse = current ?? latestPartOf(dayKey(now()))
    const keep = logFileName(inUse.day, inUse.part)
    const files = listLogFiles(directory, fileSystem).sort(compareLogFiles)
    const cutoff = now().getTime() - maxDays * 24 * 60 * 60 * 1000
    const kept = []

    for (const file of files) {
      const fileDate = new Date(`${parseLogFileName(file).day}T00:00:00.000Z`).getTime()
      if (fileDate < cutoff && file !== keep) {
        await fileSystemPromises.rm(path.join(directory, file), { force: true })
        continue
      }
      kept.push(file)
    }

    await pruneBySize(kept, keep)
  }

  async function pruneBySize(sortedOldestFirst, keep) {
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
      if (entry.file === keep) continue
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

function logFileName(day, part) {
  return part > 0 ? `qa-${day}.${part}.jsonl` : `qa-${day}.jsonl`
}

function parseLogFileName(name) {
  const match = QA_LOG_FILE_PATTERN.exec(name)
  return { day: match[1], part: match[2] ? Number(match[2]) : 0 }
}

/** Ordem cronológica: dia, depois parte (`qa-…-14.jsonl` antes de `qa-…-14.1.jsonl`, que o sort de texto inverteria). */
function compareLogFiles(left, right) {
  const a = parseLogFileName(left)
  const b = parseLogFileName(right)
  return a.day === b.day ? a.part - b.part : a.day < b.day ? -1 : 1
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
 * O texto que vai ao disco passa pelas duas redações: a do git acha URL com senha e rótulo solto; a
 * das CLIs acha nome de variável de ambiente (`OPENAI_API_KEY=…`) e os formatos de token (Google,
 * AWS, Slack, PEM…) que a do git não conhece.
 */
function redactForDisk(text) {
  return redactSensitiveText(redactSecrets(text))
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
 *
 * `redactText` mascara cada string: o disco usa as duas redações (`redactForDisk`); a memória e o
 * evento ao renderer usam só a das CLIs, que mantém o `[oculto]` que os produtores já deixaram.
 */
function redactValue(value, depth = 0, keyName, redactText = redactForDisk) {
  if (isSensitiveKeyName(keyName)) return '***'
  if (depth > 8) return '[profundidade máxima atingida]'
  if (typeof value === 'string') return redactText(value)
  if (Array.isArray(value)) return value.map((item) => redactValue(item, depth + 1, undefined, redactText))
  if (value && typeof value === 'object') {
    const redacted = {}
    for (const [key, item] of Object.entries(value)) {
      redacted[key] = redactValue(item, depth + 1, key, redactText)
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

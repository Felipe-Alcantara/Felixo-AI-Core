/**
 * Geração de imagem via Openia: IPC no processo principal, processo filho e
 * arquivo de saída.
 *
 * O Openia é o único que conhece a chave do OpenRouter. Por isso quem gera é um
 * FILHO do Openia (`openia image --json`, contrato REAL do Openia: prompt em
 * `--prompt`, pasta em `--output-dir`, cancelamento cooperativo por
 * `--cancel-file`, envelope JSON versionado em stdout), e este serviço só faz o
 * que é do Felixo:
 *
 *  - validar o pedido por um schema fechado (o renderer não escolhe pasta,
 *    caminho nem argumento do filho);
 *  - só aceitar modelos que o catálogo PÚBLICO do OpenRouter declara com saída
 *    de imagem (consulta sem chave, com limite de tempo e de tamanho);
 *  - dar ao filho uma pasta privada por pedido e ler DEPOIS só o que ele
 *    listou e que passe nas checagens (arquivo direto na pasta, regular, não
 *    link, no limite de tamanho, bytes de imagem raster de verdade);
 *  - gravar pelo mesmo caminho seguro das outras imagens (`saveGeneratedImage`)
 *    e só então avisar o canvas;
 *  - acompanhar pending/success/error/cancelled, cancelar pedindo ao Openia
 *    (arquivo de cancelamento) e, se ele não sair, matando a árvore de
 *    processos, sem deixar processo nem arquivo órfão;
 *  - nunca devolver stderr, chave, mensagem do filho ou traceback ao renderer.
 *
 * Contrato: docs/projeto/OPENIA-IMAGEM-CONTRATO.md.
 */

const fs = require('node:fs/promises')
const fsSync = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const spawnChildProcess = require('cross-spawn')
const { ipcMain } = require('electron')
const { resolveOpeniaSpawn } = require('./openia-service.cjs')
const { killProcessTree } = require('../core/process-tree.cjs')
const { MAX_ATTACHMENT_BYTES, isPathInside } = require('./file-attachments-ipc-handlers.cjs')

const IMAGE_MODELS_URL = 'https://openrouter.ai/api/v1/images/models'
const CATALOG_TIMEOUT_MS = 10_000
const CATALOG_MAX_BYTES = 2 * 1024 * 1024
const CATALOG_CACHE_MS = 10 * 60_000
// Openia: 100 s por tentativa e 1 tentativa extra (`--timeout`/`--retries`); o teto do Felixo dá folga.
const IMAGE_TIMEOUT_MS = 240_000
const OPENIA_CALL_TIMEOUT_S = 100
const OPENIA_RETRIES = 1
const MAX_PROMPT_CHARS = 4_000
const MAX_CONCURRENT = 2
const MAX_FILES = 4
const STDOUT_LIMIT = 32_000
const ORPHAN_RUN_AGE_MS = 60 * 60_000
const STATE_HISTORY = 50
const COOPERATIVE_GRACE_MS = 2_500
const KILL_GRACE_MS = 2_000
const ENVELOPE_VERSION = 1

// Segue a chave de idempotência do Openia (`^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`): nunca começa com `-`.
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/
// `empresa/modelo` do OpenRouter; nada que vire opção de linha de comando.
const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~:+-]*\/[A-Za-z0-9][A-Za-z0-9._~:+-]*$/
const ALLOWED_REQUEST_KEYS = new Set(['prompt', 'model', 'requestId'])
const MODALITIES = new Set(['text', 'image', 'audio', 'video', 'embeddings', 'file'])

/** Mensagens fixas: o renderer só vê estas, nunca texto do filho. */
const MESSAGES = Object.freeze({
  invalid_request: 'Pedido de imagem inválido.',
  duplicate_request: 'Já existe uma geração em andamento com esse identificador.',
  busy: 'Já há gerações de imagem demais em andamento. Aguarde uma terminar.',
  catalog_unavailable: 'Não foi possível consultar o catálogo de modelos de imagem.',
  model_not_image_capable: 'Este modelo não gera imagem.',
  openia_unavailable: 'Não foi possível executar o Openia.',
  authentication_error: 'A chave do OpenRouter não está configurada ou foi recusada. Configure no Openia.',
  limit_error: 'O OpenRouter recusou por limite ou falta de créditos.',
  model_unavailable: 'O modelo escolhido não está disponível para gerar imagem agora.',
  network_error: 'Falha de rede ao falar com o OpenRouter.',
  generation_failed: 'O Openia não conseguiu gerar a imagem.',
  invalid_output: 'O Openia devolveu um resultado que o Felixo não aceita.',
  save_failed: 'Não foi possível salvar a imagem gerada.',
  timeout: 'A geração de imagem demorou demais e foi interrompida.',
  cancelled: 'A geração de imagem foi cancelada.',
})

/** Código de saída do Openia (`ImageError.exit_code`) → código público do Felixo. */
const EXIT_CODE_TO_FAILURE = new Map([
  [2, 'invalid_request'],
  [3, 'authentication_error'],
  [4, 'model_unavailable'],
  [5, 'limit_error'],
  [6, 'network_error'],
  [124, 'timeout'],
  [130, 'cancelled'],
])

/** Sem código de saída confiável, cai no `error.code` do envelope (lista fechada; o resto é falha genérica). */
const ERROR_CODE_TO_FAILURE = new Map([
  ['missing_key', 'authentication_error'],
  ['invalid_key', 'authentication_error'],
  ['authentication_error', 'authentication_error'],
  ['model_not_found', 'model_unavailable'],
  ['model_unsupported', 'model_unavailable'],
  ['model_input_unsupported', 'model_unavailable'],
  ['rate_limit', 'limit_error'],
  ['account_limit', 'limit_error'],
  ['request_limit', 'limit_error'],
  ['network_error', 'network_error'],
  ['timeout', 'timeout'],
  ['cancelled', 'cancelled'],
  ['output_too_large', 'invalid_output'],
  ['unsafe_output', 'invalid_output'],
  ['mime_mismatch', 'invalid_output'],
  ['format_mismatch', 'invalid_output'],
  ['unsupported_mime', 'invalid_output'],
])

function fail(code, requestId) {
  return { ok: false, code, message: MESSAGES[code] ?? MESSAGES.generation_failed, ...(requestId ? { requestId } : {}) }
}

/**
 * @param {object} deps
 * @param {string} deps.userData Pasta de dados do app.
 * @param {(params: object) => Promise<{ ok: boolean, artifact?: object }>} deps.saveImage `saveGeneratedImage` já ligado à pasta de imagens geradas.
 * @param {(artifact: object) => void} [deps.notify] Avisa o canvas (`canvas:image-generated`).
 * @param {() => Promise<object[]>} [deps.fetchCatalog] Catálogo público de modelos de imagem.
 * @param {(request: object) => object} [deps.runImage] Inicia o filho; padrão spawn real do Openia.
 */
function createOpeniaImageService({
  userData,
  saveImage,
  notify = () => {},
  fetchCatalog = fetchImageCatalog,
  runImage = runOpeniaImageProcess,
  now = () => Date.now(),
  timeoutMs = IMAGE_TIMEOUT_MS,
  fileSystem = fs,
} = {}) {
  const runsDir = path.join(userData, 'openia-image-runs')
  const active = new Map()
  const history = new Map()
  let catalogCache = null

  function setState(requestId, state, extra = {}) {
    history.set(requestId, { requestId, state, updatedAt: now(), ...extra })
    while (history.size > STATE_HISTORY) history.delete(history.keys().next().value)
  }

  async function imageModels() {
    if (catalogCache && now() - catalogCache.at < CATALOG_CACHE_MS) return catalogCache.value
    let models
    try {
      models = await fetchCatalog()
    } catch {
      return { ok: false }
    }
    const value = { ok: true, models: Array.isArray(models) ? models : [] }
    catalogCache = { at: now(), value }
    return value
  }

  async function generate(params) {
    const parsed = parseRequest(params)
    if (!parsed.ok) return fail('invalid_request')
    const { prompt, model } = parsed
    const requestId = parsed.requestId ?? randomUUID()

    if (active.has(requestId)) return fail('duplicate_request', requestId)
    if (active.size >= MAX_CONCURRENT) return fail('busy', requestId)

    const entry = { cancelReason: null, controller: new AbortController() }
    active.set(requestId, entry)
    setState(requestId, 'pending')

    const runDir = path.join(runsDir, requestId)
    const cancelFile = path.join(runsDir, `${requestId}.cancel`)
    try {
      const catalog = await imageModels()
      if (!catalog.ok) return finish(requestId, fail('catalog_unavailable', requestId))
      if (!catalog.models.some((item) => item.id === model)) {
        return finish(requestId, fail('model_not_image_capable', requestId))
      }
      if (entry.controller.signal.aborted) return finish(requestId, fail(entry.cancelReason ?? 'cancelled', requestId))

      await fileSystem.mkdir(runDir, { recursive: true, mode: 0o700 })
      const outcome = await runChild({ requestId, prompt, model, runDir, cancelFile, entry })
      if (entry.controller.signal.aborted) return finish(requestId, fail(entry.cancelReason ?? 'cancelled', requestId))
      if (outcome.error) return finish(requestId, fail(outcome.error, requestId))

      const named = await resolveOutputNames(runDir, outcome.outputs, fileSystem)
      if (!named.ok) return finish(requestId, fail('invalid_output', requestId))
      const collected = await collectFiles(runDir, named.names, fileSystem)
      if (!collected.ok) return finish(requestId, fail('invalid_output', requestId))
      // Cancelou enquanto lia os arquivos: nada é gravado nem anunciado.
      if (entry.controller.signal.aborted) return finish(requestId, fail(entry.cancelReason ?? 'cancelled', requestId))

      const artifacts = []
      for (const file of collected.files) {
        if (entry.controller.signal.aborted) {
          await removeSaved(artifacts, fileSystem)
          return finish(requestId, fail(entry.cancelReason ?? 'cancelled', requestId))
        }
        const saved = await saveImage({
          data: file.buffer,
          type: file.mimeType,
          name: 'openia-image',
          prompt,
          model,
          requestId,
          temporary: true,
        }).catch(() => ({ ok: false }))
        if (!saved?.ok || !saved.artifact) {
          await removeSaved(artifacts, fileSystem)
          return finish(requestId, fail('save_failed', requestId))
        }
        artifacts.push(saved.artifact)
      }

      // A referência só chega ao canvas depois que TODAS as escritas terminaram.
      for (const artifact of artifacts) notify(artifact)
      setState(requestId, 'success', { count: artifacts.length })
      return { ok: true, requestId, state: 'success', artifacts }
    } catch {
      return finish(requestId, fail('generation_failed', requestId))
    } finally {
      await fileSystem.rm(runDir, { recursive: true, force: true }).catch(() => {})
      await fileSystem.rm(cancelFile, { force: true }).catch(() => {})
      active.delete(requestId)
    }
  }

  function finish(requestId, result) {
    const state = result.code === 'cancelled' ? 'cancelled' : 'error'
    setState(requestId, state, { code: result.code })
    return { ...result, state }
  }

  /** Executa o filho e devolve `{ error }` ou `{ outputs }`; nunca texto cru do filho. */
  async function runChild({ requestId, prompt, model, runDir, cancelFile, entry }) {
    const timer = setTimeout(() => {
      entry.cancelReason = 'timeout'
      entry.controller.abort()
    }, timeoutMs)
    let result
    try {
      result = await runImage({
        args: buildOpeniaArgs({ prompt, model, runDir, requestId, cancelFile }),
        signal: entry.controller.signal,
        cancelFile,
      })
    } catch {
      result = { started: false }
    } finally {
      clearTimeout(timer)
    }

    if (entry.controller.signal.aborted) return { error: entry.cancelReason ?? 'cancelled' }
    if (!result?.started) return { error: 'openia_unavailable' }

    const envelope = parseEnvelope(result.stdout)
    if (!envelope) return { error: result.ok ? 'invalid_output' : 'generation_failed' }
    if (envelope.ok === false) return { error: mapFailure(result.exitCode, envelope.error?.code) }
    if (!result.ok) return { error: mapFailure(result.exitCode) }
    if (!Array.isArray(envelope.outputs) || envelope.outputs.length === 0) return { error: 'invalid_output' }
    return { outputs: envelope.outputs.slice(0, MAX_FILES) }
  }

  function cancel(params) {
    const requestId = typeof params?.requestId === 'string' ? params.requestId : ''
    if (!REQUEST_ID_PATTERN.test(requestId)) return { ok: false, code: 'invalid_request', message: MESSAGES.invalid_request }
    const entry = active.get(requestId)
    if (!entry) return { ok: true, cancelled: false }
    entry.cancelReason = 'cancelled'
    entry.controller.abort()
    return { ok: true, cancelled: true }
  }

  function status(params) {
    const requestId = typeof params?.requestId === 'string' ? params.requestId : ''
    if (!REQUEST_ID_PATTERN.test(requestId)) return { ok: false, code: 'invalid_request', message: MESSAGES.invalid_request }
    const known = history.get(requestId)
    return known ? { ok: true, ...known } : { ok: true, requestId, state: 'unknown' }
  }

  /** Ao iniciar: apaga pastas e arquivos de cancelamento de execuções que sobraram de uma queda do app. */
  async function sweepOrphans() {
    let entries = []
    try {
      entries = await fileSystem.readdir(runsDir, { withFileTypes: true })
    } catch {
      return { removed: 0 }
    }
    let removed = 0
    for (const item of entries) {
      const owner = item.name.replace(/\.cancel$/, '')
      if (active.has(owner)) continue
      if (!item.isDirectory() && !item.name.endsWith('.cancel')) continue
      const target = path.join(runsDir, item.name)
      const stats = await fileSystem.stat(target).catch(() => null)
      if (stats && now() - stats.mtimeMs < ORPHAN_RUN_AGE_MS) continue
      await fileSystem.rm(target, { recursive: true, force: true }).catch(() => {})
      removed += 1
    }
    return { removed }
  }

  /** Ao encerrar o app: interrompe tudo que estiver em andamento. */
  function shutdown() {
    for (const entry of active.values()) {
      entry.cancelReason = 'cancelled'
      entry.controller.abort()
    }
  }

  return {
    imageModels: async () => {
      const catalog = await imageModels()
      if (!catalog.ok) return { ok: false, code: 'catalog_unavailable', message: MESSAGES.catalog_unavailable }
      return { ok: true, models: catalog.models }
    },
    generate,
    cancel,
    status,
    sweepOrphans,
    shutdown,
  }
}

/** Argumentos do filho. O prompt vai em `--prompt=<texto>`: assim nunca é lido como opção, mesmo começando com `-`. */
function buildOpeniaArgs({ prompt, model, runDir, requestId, cancelFile }) {
  return [
    'image',
    '--json',
    '--model',
    model,
    `--prompt=${prompt}`,
    '--output-dir',
    runDir,
    '--request-id',
    requestId,
    '--cancel-file',
    cancelFile,
    '--timeout',
    String(OPENIA_CALL_TIMEOUT_S),
    '--retries',
    String(OPENIA_RETRIES),
  ]
}

/** Schema fechado: só prompt, model e requestId; qualquer outra chave (ex.: caminho de saída) é recusada. */
function parseRequest(params) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return { ok: false }
  if (Object.keys(params).some((key) => !ALLOWED_REQUEST_KEYS.has(key))) return { ok: false }

  const prompt = typeof params.prompt === 'string' ? params.prompt.trim() : ''
  if (!prompt || prompt.length > MAX_PROMPT_CHARS || prompt.includes('\0')) return { ok: false }

  const model = typeof params.model === 'string' ? params.model.trim() : ''
  if (model.length > 300 || !MODEL_PATTERN.test(model)) return { ok: false }

  let requestId
  if (params.requestId !== undefined) {
    if (typeof params.requestId !== 'string' || !REQUEST_ID_PATTERN.test(params.requestId)) return { ok: false }
    requestId = params.requestId
  }
  return { ok: true, prompt, model, requestId }
}

/** Envelope versionado do Openia; versão desconhecida ou formato estranho vale como resultado inválido. */
function parseEnvelope(stdout) {
  try {
    const parsed = JSON.parse(String(stdout ?? '').trim())
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    if (parsed.version !== ENVELOPE_VERSION || typeof parsed.ok !== 'boolean') return null
    return parsed
  } catch {
    return null
  }
}

/** Falha do filho → código público. O código de saída é a parte estável do contrato; o `error.code` é reserva. */
function mapFailure(exitCode, errorCode) {
  if (EXIT_CODE_TO_FAILURE.has(exitCode)) return EXIT_CODE_TO_FAILURE.get(exitCode)
  if (typeof errorCode === 'string' && ERROR_CODE_TO_FAILURE.has(errorCode)) return ERROR_CODE_TO_FAILURE.get(errorCode)
  return 'generation_failed'
}

/**
 * O envelope lista caminhos ABSOLUTOS. Só vale quem está DIRETAMENTE na pasta
 * do pedido (a pasta do caminho, resolvida, é a pasta do pedido, resolvida):
 * qualquer outro caminho invalida o resultado. Devolve só os nomes simples.
 */
async function resolveOutputNames(runDir, outputs, fileSystem = fs) {
  const realRunDir = await fileSystem.realpath(runDir).catch(() => null)
  if (!realRunDir || !Array.isArray(outputs) || outputs.length === 0) return { ok: false }

  const names = []
  for (const output of outputs) {
    const outputPath = typeof output?.path === 'string' ? output.path : ''
    if (!outputPath || outputPath.includes('\0') || !path.isAbsolute(outputPath)) return { ok: false }
    const realDir = await fileSystem.realpath(path.dirname(outputPath)).catch(() => null)
    if (!realDir || realDir !== realRunDir) return { ok: false }
    names.push(path.basename(outputPath))
  }
  return { ok: true, names }
}

/**
 * Lê SOMENTE os arquivos listados, um a um: nome simples (sem separador nem
 * `..`), arquivo regular (nunca link), dentro da pasta do pedido, com tamanho
 * no limite e bytes de imagem raster. Qualquer falha invalida o resultado todo
 * — nada é aproveitado pela metade.
 */
async function collectFiles(runDir, names, fileSystem = fs) {
  if (!Array.isArray(names) || names.length === 0) return { ok: false }
  const realRunDir = await fileSystem.realpath(runDir).catch(() => null)
  if (!realRunDir) return { ok: false }

  const files = []
  for (const name of new Set(names)) {
    if (!name || name !== path.basename(name) || name === '.' || name === '..' || /[\\/\0]/.test(name)) {
      return { ok: false }
    }
    const target = path.join(realRunDir, name)
    const info = await fileSystem.lstat(target).catch(() => null)
    if (!info || !info.isFile() || info.isSymbolicLink()) return { ok: false }
    if (info.size === 0 || info.size > MAX_ATTACHMENT_BYTES) return { ok: false }
    const real = await fileSystem.realpath(target).catch(() => null)
    if (!real || !isPathInside(realRunDir, real)) return { ok: false }

    const buffer = await fileSystem.readFile(real)
    const mimeType = sniffRasterMimeType(buffer)
    if (!mimeType) return { ok: false }
    files.push({ buffer, mimeType })
  }
  return { ok: true, files }
}

/** Tipo pelos BYTES (a extensão e o que o filho declara não valem). SVG e HTML ficam de fora de propósito. */
function sniffRasterMimeType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return ''
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  const head = buffer.subarray(0, 6).toString('latin1')
  if (head === 'GIF87a' || head === 'GIF89a') return 'image/gif'
  if (buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp'
  if (buffer.subarray(0, 2).toString('latin1') === 'BM') return 'image/bmp'
  if (buffer.subarray(4, 8).toString('latin1') === 'ftyp' && /^avi[fs]$/.test(buffer.subarray(8, 12).toString('latin1'))) return 'image/avif'
  return ''
}

async function removeSaved(artifacts, fileSystem = fs) {
  for (const artifact of artifacts) {
    if (artifact?.path) await fileSystem.rm(artifact.path, { force: true }).catch(() => {})
  }
}

/**
 * Catálogo PÚBLICO de modelos com saída de imagem (`/api/v1/images/models`, o
 * mesmo que o Openia consulta). Sem chave nem cabeçalho de autorização, sem
 * redirecionamento, com limite de tempo e de tamanho. Devolve só id, nome,
 * fornecedor e modalidades de uma lista fechada; ignora entradas malformadas.
 */
async function fetchImageCatalog({ fetchImpl = globalThis.fetch, timeoutMs = CATALOG_TIMEOUT_MS, maxBytes = CATALOG_MAX_BYTES } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch indisponível')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(IMAGE_MODELS_URL, {
      method: 'GET',
      redirect: 'error',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response?.ok) throw new Error('catálogo indisponível')
    const declared = Number(response.headers?.get?.('content-length'))
    if (Number.isFinite(declared) && declared > maxBytes) throw new Error('catálogo grande demais')
    const text = await readLimitedText(response, maxBytes)
    const payload = JSON.parse(text)
    if (!payload || !Array.isArray(payload.data)) throw new Error('formato inválido')
    return payload.data.map(parseCatalogEntry).filter(Boolean)
  } finally {
    clearTimeout(timer)
  }
}

async function readLimitedText(response, maxBytes) {
  const reader = response.body?.getReader?.()
  if (!reader) {
    const text = await response.text()
    if (Buffer.byteLength(text) > maxBytes) throw new Error('catálogo grande demais')
    return text
  }
  const chunks = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => {})
      throw new Error('catálogo grande demais')
    }
    chunks.push(Buffer.from(value))
  }
  return Buffer.concat(chunks).toString('utf8')
}

function parseCatalogEntry(item) {
  if (!item || typeof item !== 'object') return null
  const id = typeof item.id === 'string' ? item.id.trim() : ''
  if (!id || id.length > 300 || !MODEL_PATTERN.test(id)) return null
  const architecture = item.architecture && typeof item.architecture === 'object' ? item.architecture : {}
  const output = cleanModalities(architecture.output_modalities)
  if (!output.includes('image')) return null
  const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim().slice(0, 200) : id
  return {
    id,
    vendor: id.split('/', 1)[0],
    name,
    inputModalities: cleanModalities(architecture.input_modalities),
    outputModalities: output,
  }
}

function cleanModalities(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((entry) => (typeof entry === 'string' ? entry.trim().toLowerCase() : '')).filter((entry) => MODALITIES.has(entry)))]
}

/** No Windows, um atalho `.cmd` passa por cmd.exe, onde quebra de linha no argumento encerraria o comando: vira espaço. */
function sanitizeArgsForShell(args) {
  return args.map((arg) => arg.replace(/[\r\n]+/g, ' '))
}

/**
 * Inicia o `openia` SEM shell (exceto `.cmd` no Windows) e devolve
 * `{ started, ok, exitCode, stdout }`. Não há stdin nem stderr: o stderr pode
 * conter traceback ou eco de chave e é descartado. Ao abortar, primeiro pede
 * cancelamento ao Openia (cria `cancelFile`, que ele observa) e, se ele não
 * sair a tempo, mata o grupo/árvore de processos; só resolve quando o processo
 * realmente saiu, para cancelar nunca deixar órfão.
 */
function runOpeniaImageProcess({
  args,
  signal,
  cancelFile,
  resolveSpawn = resolveOpeniaSpawn,
  cooperativeGraceMs = COOPERATIVE_GRACE_MS,
  killGraceMs = KILL_GRACE_MS,
}) {
  const { executable, env, needsShell, prefixArgs = [] } = resolveSpawn()
  const finalArgs = [...prefixArgs, ...(needsShell ? sanitizeArgsForShell(args) : args)]
  return new Promise((resolve) => {
    let child
    try {
      child = spawnChildProcess(executable, finalArgs, {
        cwd: os.homedir(),
        env,
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true,
        // Grupo próprio no POSIX: cancelar mata o filho E os netos.
        detached: process.platform !== 'win32',
        ...(needsShell ? { shell: true } : {}),
      })
    } catch {
      resolve({ started: false })
      return
    }

    let stdout = ''
    let settled = false
    let graceTimer = null
    const done = (result) => {
      if (settled) return
      settled = true
      if (graceTimer) clearTimeout(graceTimer)
      signal?.removeEventListener('abort', onAbort)
      resolve(result)
    }

    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk) => {
      stdout = `${stdout}${chunk}`.slice(0, STDOUT_LIMIT)
    })

    const onAbort = () => {
      if (cancelFile) {
        try {
          fsSync.writeFileSync(cancelFile, '')
        } catch {
          // Sem o arquivo, o aviso educado não chega: vale a interrupção abaixo.
        }
      }
      // Fire-and-forget: `done()` é disparado pelo `child.once('close', ...)` quando o
      // processo realmente morrer, não por esta chamada — o próprio módulo compartilhado
      // já aguarda internamente a escalada SIGTERM→SIGKILL (ou o taskkill no Windows).
      graceTimer = setTimeout(() => {
        void killProcessTree({ pid: child.pid, graceMs: killGraceMs })
      }, cooperativeGraceMs)
    }
    if (signal?.aborted) onAbort()
    else signal?.addEventListener('abort', onAbort, { once: true })

    child.once('error', () => done({ started: false }))
    child.once('close', (code) => done({ started: true, ok: code === 0, exitCode: code, stdout }))
  })
}

/**
 * Registra o IPC do renderer. O renderer só pode pedir: listar os modelos que
 * geram imagem, gerar (prompt, model, requestId), cancelar e consultar estado.
 */
function registerOpeniaImageIpcHandlers({ service } = {}) {
  ipcMain.handle('openia:image-models', () => service.imageModels())
  ipcMain.handle('openia:generate-image', (_event, params) => service.generate(params))
  ipcMain.handle('openia:cancel-image', (_event, params) => service.cancel(params))
  ipcMain.handle('openia:image-status', (_event, params) => service.status(params))
}

module.exports = {
  IMAGE_MODELS_URL,
  IMAGE_TIMEOUT_MS,
  MAX_CONCURRENT,
  MESSAGES,
  buildOpeniaArgs,
  collectFiles,
  createOpeniaImageService,
  fetchImageCatalog,
  mapFailure,
  parseEnvelope,
  parseRequest,
  registerOpeniaImageIpcHandlers,
  resolveOutputNames,
  runOpeniaImageProcess,
  sanitizeArgsForShell,
  sniffRasterMimeType,
}

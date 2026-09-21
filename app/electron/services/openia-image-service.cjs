/**
 * Geração de imagem via Openia: IPC no processo principal, processo filho e
 * arquivo de saída.
 *
 * O Openia é o único que conhece a chave do OpenRouter (ela entra nele por
 * stdin e nunca aqui). Por isso quem gera é um FILHO do Openia
 * (`openia image --json`), e este serviço só faz o que é do Felixo:
 *
 *  - validar o pedido por um schema fechado (o renderer não escolhe pasta,
 *    caminho nem argumento do filho);
 *  - exigir que o Openia tenha INFORMADO que o modelo gera imagem;
 *  - dar ao filho uma pasta privada por pedido e ler DEPOIS só o que ele
 *    listou e que passe nas checagens (nome simples, arquivo regular, dentro da
 *    pasta, tamanho, bytes de imagem raster de verdade);
 *  - gravar pelo mesmo caminho seguro das outras imagens (`saveGeneratedImage`)
 *    e só então avisar o canvas;
 *  - acompanhar pending/success/error/cancelled, cancelar sem deixar processo
 *    nem arquivo órfão e nunca devolver stderr, chave ou traceback ao renderer.
 *
 * Contrato do filho: docs/projeto/OPENIA-IMAGEM-CONTRATO.md.
 */

const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const spawnChildProcess = require('cross-spawn')
const { spawn } = require('node:child_process')
const { ipcMain } = require('electron')
const { resolveOpeniaSpawn } = require('./openia-service.cjs')
const { MAX_ATTACHMENT_BYTES, isPathInside } = require('./file-attachments-ipc-handlers.cjs')

const IMAGE_TIMEOUT_MS = 180_000
const MODELS_CACHE_MS = 5 * 60_000
const MAX_PROMPT_CHARS = 4_000
const MAX_CONCURRENT = 2
const MAX_FILES = 4
const STDOUT_LIMIT = 16_000
const ORPHAN_RUN_AGE_MS = 60 * 60_000
const STATE_HISTORY = 50
const KILL_GRACE_MS = 2_000

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/
// `empresa/modelo` do OpenRouter; nada que vire opção de linha de comando.
const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~:+-]*\/[A-Za-z0-9][A-Za-z0-9._~:+-]*$/
const ALLOWED_REQUEST_KEYS = new Set(['prompt', 'model', 'requestId'])

/** Mensagens fixas: o renderer só vê estas, nunca texto do filho. */
const MESSAGES = Object.freeze({
  invalid_request: 'Pedido de imagem inválido.',
  duplicate_request: 'Já existe uma geração em andamento com esse identificador.',
  busy: 'Já há gerações de imagem demais em andamento. Aguarde uma terminar.',
  capability_unknown: 'O Openia ainda não informa quais modelos geram imagem.',
  model_not_image_capable: 'Este modelo não gera imagem.',
  openia_unavailable: 'Não foi possível executar o Openia.',
  key_missing: 'Configure a chave do OpenRouter no Openia.',
  insufficient_credits: 'O OpenRouter recusou por falta de créditos.',
  model_unavailable: 'O modelo escolhido não está disponível agora.',
  content_policy: 'O provedor recusou o pedido pela política de conteúdo.',
  generation_failed: 'O Openia não conseguiu gerar a imagem.',
  invalid_output: 'O Openia devolveu um resultado que o Felixo não aceita.',
  save_failed: 'Não foi possível salvar a imagem gerada.',
  timeout: 'A geração de imagem demorou demais e foi interrompida.',
  cancelled: 'A geração de imagem foi cancelada.',
})

/** Códigos que o filho pode declarar em `{ ok: false, code }`; qualquer outro vira `generation_failed`. */
const CHILD_ERROR_CODES = new Map([
  ['key_missing', 'key_missing'],
  ['insufficient_credits', 'insufficient_credits'],
  ['model_unavailable', 'model_unavailable'],
  ['content_policy', 'content_policy'],
])

function fail(code, requestId) {
  return { ok: false, code, message: MESSAGES[code] ?? MESSAGES.generation_failed, ...(requestId ? { requestId } : {}) }
}

/**
 * @param {object} deps
 * @param {string} deps.userData Pasta de dados do app.
 * @param {() => Promise<{ ok: boolean, models?: object[] }>} deps.listModels `openia-service.listModels`.
 * @param {(params: object) => Promise<{ ok: boolean, artifact?: object }>} deps.saveImage `saveGeneratedImage` já ligado à pasta de imagens geradas.
 * @param {(artifact: object) => void} [deps.notify] Avisa o canvas (`canvas:image-generated`).
 * @param {(request: object) => object} [deps.runImage] Inicia o filho; padrão spawn real do Openia.
 */
function createOpeniaImageService({
  userData,
  listModels,
  saveImage,
  notify = () => {},
  runImage = runOpeniaImageProcess,
  now = () => Date.now(),
  timeoutMs = IMAGE_TIMEOUT_MS,
  fileSystem = fs,
} = {}) {
  const runsDir = path.join(userData, 'openia-image-runs')
  const active = new Map()
  const history = new Map()
  let modelsCache = null

  function setState(requestId, state, extra = {}) {
    history.set(requestId, { requestId, state, updatedAt: now(), ...extra })
    while (history.size > STATE_HISTORY) history.delete(history.keys().next().value)
  }

  async function imageModels() {
    if (modelsCache && now() - modelsCache.at < MODELS_CACHE_MS) return modelsCache.value
    const result = await listModels().catch(() => ({ ok: false }))
    if (!result?.ok) return { ok: false }
    const models = Array.isArray(result.models) ? result.models : []
    // Sem NENHUM modelo informando modalidades, o Openia ainda não fala esse contrato.
    const known = models.some((model) => Array.isArray(model.outputModalities))
    const value = {
      ok: true,
      capabilityKnown: known,
      models: models.filter((model) => Array.isArray(model.outputModalities) && model.outputModalities.includes('image')),
    }
    modelsCache = { at: now(), value }
    return value
  }

  async function generate(params) {
    const parsed = parseRequest(params)
    if (!parsed.ok) return fail('invalid_request')
    const { prompt, model } = parsed
    const requestId = parsed.requestId ?? randomUUID()

    if (active.has(requestId)) return fail('duplicate_request', requestId)
    if (active.size >= MAX_CONCURRENT) return fail('busy', requestId)

    const entry = { state: 'pending', cancelReason: null, controller: new AbortController() }
    active.set(requestId, entry)
    setState(requestId, 'pending')

    const runDir = path.join(runsDir, requestId)
    try {
      const catalog = await imageModels()
      if (!catalog.ok) return finish(requestId, fail('openia_unavailable', requestId))
      if (!catalog.capabilityKnown) return finish(requestId, fail('capability_unknown', requestId))
      if (!catalog.models.some((item) => item.id === model)) {
        return finish(requestId, fail('model_not_image_capable', requestId))
      }
      if (entry.controller.signal.aborted) return finish(requestId, fail(entry.cancelReason ?? 'cancelled', requestId))

      await fileSystem.mkdir(runDir, { recursive: true, mode: 0o700 })
      const outcome = await runChild({ requestId, prompt, model, runDir, entry })
      if (entry.controller.signal.aborted) return finish(requestId, fail(entry.cancelReason ?? 'cancelled', requestId))
      if (outcome.error) return finish(requestId, fail(outcome.error, requestId))

      const collected = await collectFiles(runDir, outcome.files, fileSystem)
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
          cost: outcome.cost,
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
      active.delete(requestId)
      return { ok: true, requestId, state: 'success', artifacts }
    } catch {
      return finish(requestId, fail('generation_failed', requestId))
    } finally {
      await fileSystem.rm(runDir, { recursive: true, force: true }).catch(() => {})
      active.delete(requestId)
    }
  }

  function finish(requestId, result) {
    setState(requestId, result.code === 'cancelled' ? 'cancelled' : 'error', { code: result.code })
    active.delete(requestId)
    return { ...result, state: result.code === 'cancelled' ? 'cancelled' : 'error' }
  }

  /** Executa o filho e devolve `{ error }` ou `{ files, cost }`; nunca texto cru do filho. */
  async function runChild({ requestId, prompt, model, runDir, entry }) {
    const timer = setTimeout(() => {
      entry.cancelReason = 'timeout'
      entry.controller.abort()
    }, timeoutMs)
    let result
    try {
      result = await runImage({
        args: ['image', '--json', '--model', model, '--out-dir', runDir, '--request-id', requestId],
        input: prompt,
        signal: entry.controller.signal,
      })
    } catch {
      result = { started: false }
    } finally {
      clearTimeout(timer)
    }

    if (entry.controller.signal.aborted) return { error: entry.cancelReason ?? 'cancelled' }
    if (!result?.started) return { error: 'openia_unavailable' }

    const payload = parseChildPayload(result.stdout)
    if (payload?.ok === false) return { error: CHILD_ERROR_CODES.get(payload.code) ?? 'generation_failed' }
    if (!result.ok) return { error: 'generation_failed' }
    if (!payload || payload.ok !== true || !Array.isArray(payload.files)) return { error: 'invalid_output' }

    const cost = Number(payload.cost)
    return {
      files: payload.files.slice(0, MAX_FILES).map((file) => (typeof file?.name === 'string' ? file.name : '')),
      cost: Number.isFinite(cost) && cost >= 0 ? cost : undefined,
    }
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

  /** Ao iniciar: apaga pastas de execuções que sobraram de uma queda do app. */
  async function sweepOrphans() {
    let entries = []
    try {
      entries = await fileSystem.readdir(runsDir, { withFileTypes: true })
    } catch {
      return { removed: 0 }
    }
    let removed = 0
    for (const item of entries) {
      if (!item.isDirectory() || active.has(item.name)) continue
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
      if (!catalog.ok) return { ok: false, message: MESSAGES.openia_unavailable }
      return { ok: true, capabilityKnown: catalog.capabilityKnown, models: catalog.models }
    },
    generate,
    cancel,
    status,
    sweepOrphans,
    shutdown,
  }
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

function parseChildPayload(stdout) {
  try {
    const parsed = JSON.parse(String(stdout ?? '').trim())
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * Lê SOMENTE os arquivos que o filho listou, um a um: nome simples (sem
 * separador nem `..`), arquivo regular (nunca link), dentro da pasta do
 * pedido, com tamanho no limite e bytes de imagem raster. Qualquer falha
 * invalida o resultado todo — nada é aproveitado pela metade.
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
 * Inicia o `openia` SEM shell (exceto `.cmd` no Windows) e devolve
 * `{ started, ok, stdout }`. O prompt vai por stdin, nunca por argumento; o
 * stderr é descartado (pode conter traceback ou eco de chave). Ao abortar, mata
 * o grupo/árvore de processos e espera o filho sair antes de resolver.
 */
function runOpeniaImageProcess({ args, input, signal, resolveSpawn = resolveOpeniaSpawn, killGraceMs = KILL_GRACE_MS }) {
  const { executable, env, needsShell, prefixArgs = [] } = resolveSpawn()
  return new Promise((resolve) => {
    let child
    try {
      child = spawnChildProcess(executable, [...prefixArgs, ...args], {
        cwd: os.homedir(),
        env,
        stdio: ['pipe', 'pipe', 'ignore'],
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
    const done = (result) => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', onAbort)
      resolve(result)
    }

    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk) => {
      stdout = `${stdout}${chunk}`.slice(0, STDOUT_LIMIT)
    })
    child.stdin?.on('error', () => {})
    child.stdin?.end(input)

    const onAbort = () => {
      killProcessTree(child, killGraceMs)
    }
    if (signal?.aborted) onAbort()
    else signal?.addEventListener('abort', onAbort, { once: true })

    child.once('error', () => done({ started: false }))
    // Só resolve quando o processo realmente saiu: cancelar não deixa órfão.
    child.once('close', (code) => done({ started: true, ok: code === 0, stdout }))
  })
}

function killProcessTree(child, graceMs) {
  if (!child?.pid) return
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }).on('error', () => {})
    return
  }
  const signalGroup = (signal) => {
    try {
      process.kill(-child.pid, signal)
    } catch {
      try {
        child.kill(signal)
      } catch {
        // já saiu
      }
    }
  }
  signalGroup('SIGTERM')
  setTimeout(() => signalGroup('SIGKILL'), graceMs).unref()
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
  IMAGE_TIMEOUT_MS,
  MAX_CONCURRENT,
  MESSAGES,
  collectFiles,
  createOpeniaImageService,
  parseRequest,
  registerOpeniaImageIpcHandlers,
  runOpeniaImageProcess,
  sniffRasterMimeType,
}

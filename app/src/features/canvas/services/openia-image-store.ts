/**
 * Geração de imagem pelo Openia, do lado do renderer.
 *
 * Tudo o que é sensível já mora no processo principal
 * (`electron/services/openia-image-service.cjs`): validar o pedido, falar com o
 * Openia, gravar o arquivo e avisar o canvas por `canvas:image-generated`, que o
 * CanvasView transforma em bloco de imagem. Aqui ficam só o rascunho do prompt,
 * o modelo escolhido, o catálogo e o estado do pedido em andamento.
 *
 * É uma store externa, e não estado de componente, porque uma geração dura de
 * segundos a alguns minutos e quem a iniciou pode desmontar no meio: o grupo
 * "Criar" da sidebar recolhe, ou a pessoa vai para o chat e o CanvasView inteiro
 * sai da tela. A promessa do pedido continua aqui e, na volta, o botão encontra o
 * estado certo. Se a janela recarregar, a promessa se perde: por isso o id do
 * pedido fica no `sessionStorage` e o desfecho é reconsultado por `imageStatus`.
 */

type Bridge = NonNullable<NonNullable<Window['felixo']>['openia']>

/** Modelo do catálogo público do OpenRouter com saída de imagem, como o preload o entrega. */
export type OpeniaImageModel = NonNullable<Awaited<ReturnType<Bridge['listImageModels']>>['models']>[number]
export type OpeniaImageResult = Awaited<ReturnType<Bridge['generateImage']>>

/** Mesmo teto do serviço (`MAX_PROMPT_CHARS`); o Openia aceita mais, o Felixo não. */
export const IMAGE_PROMPT_MAX_CHARS = 4_000

const MODEL_STORAGE_KEY = 'felixo:openia-image-model'
const PENDING_STORAGE_KEY = 'felixo:openia-image-pending'
const STATUS_POLL_MS = 2_000

export const OPENIA_IMAGE_MESSAGES = Object.freeze({
  unavailable: 'A integração do Openia não está disponível nesta versão do Felixo.',
  catalogFailed: 'Não foi possível consultar o catálogo de modelos de imagem.',
  requestFailed: 'Não foi possível pedir a imagem ao Openia.',
  cancelled: 'A geração de imagem foi cancelada.',
  emptyPrompt: 'Descreva a imagem que você quer gerar.',
  longPrompt: `A descrição passa do limite de ${IMAGE_PROMPT_MAX_CHARS} caracteres.`,
  noModel: 'Escolha o modelo que vai gerar a imagem.',
  alreadyRunning: 'Já há uma imagem sendo gerada. Aguarde ou cancele.',
})

export type ImageModelsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; models: readonly OpeniaImageModel[] }
  | { status: 'error'; message: string }

export type ImageGenerationState =
  | { status: 'idle' }
  | { status: 'pending'; requestId: string; startedAt: number; cancelling: boolean }
  | { status: 'success'; requestId: string; count: number }
  | { status: 'cancelled'; requestId?: string; message: string }
  | { status: 'error'; requestId?: string; code: string; message: string }

export type OpeniaImageSnapshot = {
  prompt: string
  model: string
  models: ImageModelsState
  generation: ImageGenerationState
}

export type ImageRequestProblem = { field: 'prompt' | 'model'; message: string }

export type GenerateOutcome =
  | { ok: true; requestId: string; done: Promise<void> }
  | { ok: false; field: 'prompt' | 'model' | 'generation'; message: string }

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

type StoreDeps = {
  now?: () => number
  newRequestId?: () => string
  /** Guarda o pedido em andamento para sobreviver a um recarregamento da janela. */
  session?: () => KeyValueStorage | undefined
  /** Lembra o último modelo escolhido entre sessões. */
  local?: () => KeyValueStorage | undefined
  schedule?: (callback: () => void, ms: number) => void
}

/** Checagem do lado da interface, para responder na hora; a que protege é a do processo principal. */
export function validateImageRequest(prompt: string, model: string): ImageRequestProblem | null {
  const text = prompt.trim()
  if (!text) return { field: 'prompt', message: OPENIA_IMAGE_MESSAGES.emptyPrompt }
  if (text.length > IMAGE_PROMPT_MAX_CHARS) return { field: 'prompt', message: OPENIA_IMAGE_MESSAGES.longPrompt }
  if (!model.trim()) return { field: 'model', message: OPENIA_IMAGE_MESSAGES.noModel }
  return null
}

/** Estado final a partir da resposta de `generateImage` (ou da falta dela). */
export function generationOutcome(
  requestId: string,
  result: OpeniaImageResult | undefined,
): ImageGenerationState {
  if (!result) {
    return { status: 'error', requestId, code: 'request_failed', message: OPENIA_IMAGE_MESSAGES.requestFailed }
  }
  if (result.ok) return { status: 'success', requestId, count: result.artifacts.length }
  if (result.state === 'cancelled' || result.code === 'cancelled') {
    return { status: 'cancelled', requestId, message: result.message || OPENIA_IMAGE_MESSAGES.cancelled }
  }
  return {
    status: 'error',
    requestId,
    code: result.code || 'generation_failed',
    message: result.message || OPENIA_IMAGE_MESSAGES.requestFailed,
  }
}

function defaultRequestId(): string {
  // `img-` + UUID cabe no padrão do serviço (`^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$`).
  if (typeof globalThis.crypto?.randomUUID === 'function') return `img-${globalThis.crypto.randomUUID()}`
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return `img-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

function safeGet(storage: (() => KeyValueStorage | undefined) | undefined, key: string): string | null {
  try {
    return storage?.()?.getItem(key) ?? null
  } catch {
    return null
  }
}

function safeSet(storage: (() => KeyValueStorage | undefined) | undefined, key: string, value: string | null) {
  try {
    const target = storage?.()
    if (value === null) target?.removeItem(key)
    else target?.setItem(key, value)
  } catch {
    // Sem armazenamento a escolha vale só para esta sessão; não é motivo de erro.
  }
}

type PendingRecord = { requestId: string; startedAt: number }

function parsePending(raw: string | null): PendingRecord | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<PendingRecord>
    if (typeof value?.requestId !== 'string' || !value.requestId) return null
    return { requestId: value.requestId, startedAt: Number(value.startedAt) || 0 }
  } catch {
    return null
  }
}

export function createOpeniaImageStore(getBridge: () => Bridge | undefined, deps: StoreDeps = {}) {
  const now = deps.now ?? (() => Date.now())
  const newRequestId = deps.newRequestId ?? defaultRequestId
  const schedule = deps.schedule ?? ((callback: () => void, ms: number) => void setTimeout(callback, ms))

  let snapshot: OpeniaImageSnapshot = {
    prompt: '',
    model: safeGet(deps.local, MODEL_STORAGE_KEY) ?? '',
    models: { status: 'idle' },
    generation: { status: 'idle' },
  }
  let reconcileStarted = false
  const listeners = new Set<() => void>()

  const update = (patch: Partial<OpeniaImageSnapshot>) => {
    snapshot = { ...snapshot, ...patch }
    listeners.forEach((listener) => listener())
  }

  const pendingId = () => (snapshot.generation.status === 'pending' ? snapshot.generation.requestId : null)

  const finish = (requestId: string, generation: ImageGenerationState) => {
    // Só fecha o pedido que ainda é o atual; um desfecho atrasado não apaga um pedido novo.
    if (pendingId() !== requestId) return
    safeSet(deps.session, PENDING_STORAGE_KEY, null)
    update({ generation })
  }

  async function loadModels({ force = false }: { force?: boolean } = {}): Promise<void> {
    if (snapshot.models.status === 'loading') return
    if (snapshot.models.status === 'ready' && !force) return
    const bridge = getBridge()
    if (!bridge) {
      update({ models: { status: 'error', message: OPENIA_IMAGE_MESSAGES.unavailable } })
      return
    }
    update({ models: { status: 'loading' } })
    try {
      const result = await bridge.listImageModels()
      if (!result?.ok) {
        // A mensagem do serviço é fixa por código (ex.: catálogo indisponível); nunca texto de terceiros.
        update({ models: { status: 'error', message: result?.message || OPENIA_IMAGE_MESSAGES.catalogFailed } })
        return
      }
      const models = result.models ?? []
      // Um modelo lembrado que saiu do catálogo seria recusado pelo serviço: melhor pedir outro já.
      const model = models.some((item) => item.id === snapshot.model) ? snapshot.model : ''
      update({ models: { status: 'ready', models }, model })
    } catch {
      update({ models: { status: 'error', message: OPENIA_IMAGE_MESSAGES.catalogFailed } })
    }
  }

  function setPrompt(prompt: string) {
    update({ prompt: prompt.slice(0, IMAGE_PROMPT_MAX_CHARS) })
  }

  function setModel(model: string) {
    safeSet(deps.local, MODEL_STORAGE_KEY, model || null)
    update({ model })
  }

  function generate(): GenerateOutcome {
    if (snapshot.generation.status === 'pending') {
      return { ok: false, field: 'generation', message: OPENIA_IMAGE_MESSAGES.alreadyRunning }
    }
    const problem = validateImageRequest(snapshot.prompt, snapshot.model)
    if (problem) return { ok: false, ...problem }
    const bridge = getBridge()
    if (!bridge) {
      update({ generation: { status: 'error', code: 'unavailable', message: OPENIA_IMAGE_MESSAGES.unavailable } })
      return { ok: false, field: 'generation', message: OPENIA_IMAGE_MESSAGES.unavailable }
    }

    const prompt = snapshot.prompt.trim()
    const model = snapshot.model
    const requestId = newRequestId()
    const startedAt = now()
    safeSet(deps.session, PENDING_STORAGE_KEY, JSON.stringify({ requestId, startedAt }))
    update({ generation: { status: 'pending', requestId, startedAt, cancelling: false } })

    const done = bridge
      .generateImage({ prompt, model, requestId })
      .catch(() => undefined)
      .then((result) => finish(requestId, generationOutcome(requestId, result)))
    return { ok: true, requestId, done }
  }

  async function cancel(): Promise<void> {
    const generation = snapshot.generation
    if (generation.status !== 'pending' || generation.cancelling) return
    update({ generation: { ...generation, cancelling: true } })
    try {
      await getBridge()?.cancelImage({ requestId: generation.requestId })
    } catch {
      // O desfecho chega pela resposta do pedido (ou pela consulta de estado); aqui não há o que mostrar.
    }
  }

  /** Esquece o desfecho mostrado (sucesso, erro ou cancelamento); um pedido em andamento continua. */
  function acknowledge() {
    if (snapshot.generation.status === 'pending' || snapshot.generation.status === 'idle') return
    update({ generation: { status: 'idle' } })
  }

  /** Depois de recarregar a janela: acompanha pelo `imageStatus` o pedido cuja promessa se perdeu. */
  async function pollStatus(requestId: string): Promise<void> {
    const bridge = getBridge()
    let status: Awaited<ReturnType<Bridge['imageStatus']>> | undefined
    try {
      status = await bridge?.imageStatus({ requestId })
    } catch {
      status = undefined
    }
    if (pendingId() !== requestId) return
    if (!status?.ok || !status.state || status.state === 'unknown') {
      // O processo principal não conhece mais o pedido (ex.: o app reiniciou): não há o que acompanhar.
      safeSet(deps.session, PENDING_STORAGE_KEY, null)
      update({ generation: { status: 'idle' } })
      return
    }
    if (status.state === 'pending') {
      schedule(() => void pollStatus(requestId), STATUS_POLL_MS)
      return
    }
    if (status.state === 'success') {
      finish(requestId, { status: 'success', requestId, count: status.count ?? 1 })
    } else if (status.state === 'cancelled') {
      finish(requestId, { status: 'cancelled', requestId, message: status.message || OPENIA_IMAGE_MESSAGES.cancelled })
    } else {
      finish(requestId, {
        status: 'error',
        requestId,
        code: status.code || 'generation_failed',
        message: status.message || OPENIA_IMAGE_MESSAGES.requestFailed,
      })
    }
  }

  function reconcile(): Promise<void> | undefined {
    if (reconcileStarted) return undefined
    reconcileStarted = true
    const pending = parsePending(safeGet(deps.session, PENDING_STORAGE_KEY))
    if (!pending) return undefined
    if (snapshot.generation.status !== 'idle' || !getBridge()) {
      safeSet(deps.session, PENDING_STORAGE_KEY, null)
      return undefined
    }
    update({
      generation: { status: 'pending', requestId: pending.requestId, startedAt: pending.startedAt || now(), cancelling: false },
    })
    return pollStatus(pending.requestId)
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener)
      // A primeira assinatura retoma um pedido que ficou pela metade num recarregamento.
      void reconcile()
      return () => {
        listeners.delete(listener)
      }
    },
    loadModels,
    setPrompt,
    setModel,
    generate,
    cancel,
    acknowledge,
    reconcile,
  }
}

export type OpeniaImageStore = ReturnType<typeof createOpeniaImageStore>

export const openiaImageStore = createOpeniaImageStore(() => window.felixo?.openia, {
  session: () => window.sessionStorage,
  local: () => window.localStorage,
})

import { describe, expect, it, vi } from 'vitest'
import type { CanvasImageArtifact } from '../types'
import {
  IMAGE_PROMPT_MAX_CHARS,
  OPENIA_IMAGE_MESSAGES,
  createOpeniaImageStore,
  describeImagePricing,
  generationOutcome,
  validateImageRequest,
  type OpeniaImageModel,
  type OpeniaImageResult,
} from './openia-image-store'

type Bridge = NonNullable<NonNullable<Window['felixo']>['openia']>

const MODEL = 'acme/pixel-1'
const MODELS: OpeniaImageModel[] = [
  { id: MODEL, vendor: 'acme', name: 'Pixel', inputModalities: ['text'], outputModalities: ['image'] },
  { id: 'acme/pixel-2', vendor: 'acme', name: 'Pixel 2', inputModalities: ['text'], outputModalities: ['image'] },
]

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  }
}

/** Ponte falsa: a geração fica pendurada até o teste decidir o desfecho. */
function fakeBridge(overrides: Partial<Bridge> = {}) {
  const pending: Array<(result: OpeniaImageResult) => void> = []
  const bridge = {
    listInterfaces: vi.fn(),
    listModels: vi.fn(),
    keyStatus: vi.fn(),
    setKey: vi.fn(),
    listImageModels: vi.fn(async () => ({ ok: true, models: MODELS })),
    imagePricing: vi.fn(async () => ({ ok: true, pricing: { unit: 'image' as const, minUsd: 0.04, maxUsd: 0.04 } })),
    generateImage: vi.fn(() => new Promise<OpeniaImageResult>((resolve) => pending.push(resolve))),
    cancelImage: vi.fn(async () => ({ ok: true, cancelled: true })),
    imageStatus: vi.fn(async ({ requestId }: { requestId: string }) => ({ ok: true, requestId, state: 'unknown' as const })),
    ...overrides,
  } as unknown as Bridge
  return { bridge, pending }
}

/** O clique em "Confirmar e gerar". */
const CONFIRMED = { confirmed: true } as const

function storeWith(bridge: Bridge | undefined, extra: Parameters<typeof createOpeniaImageStore>[1] = {}) {
  let counter = 0
  const session = memoryStorage()
  const local = memoryStorage()
  const store = createOpeniaImageStore(() => bridge, {
    now: () => 1_000,
    newRequestId: () => `img-teste-${++counter}`,
    session: () => session,
    local: () => local,
    ...extra,
  })
  return { store, session, local }
}

const artifact = (name: string): CanvasImageArtifact => ({
  kind: 'generated-image',
  path: `/dados/${name}`,
  name,
  size: 10,
  mimeType: 'image/png',
  temporary: true,
})

describe('validateImageRequest', () => {
  it('exige descrição e modelo, com o mesmo teto de caracteres do serviço', () => {
    expect(validateImageRequest('   ', MODEL)).toEqual({ field: 'prompt', message: OPENIA_IMAGE_MESSAGES.emptyPrompt })
    expect(validateImageRequest('x'.repeat(IMAGE_PROMPT_MAX_CHARS + 1), MODEL)?.field).toBe('prompt')
    expect(validateImageRequest('um gato', '')).toEqual({ field: 'model', message: OPENIA_IMAGE_MESSAGES.noModel })
    expect(validateImageRequest(`  ${'x'.repeat(IMAGE_PROMPT_MAX_CHARS)}  `, MODEL)).toBeNull()
  })
})

describe('describeImagePricing', () => {
  it('diz o preço por imagem (ou a faixa por resolução), por milhão de tokens, ou que ele não veio', () => {
    const ready = (pricing: { unit: 'image' | 'token'; minUsd: number; maxUsd: number }) =>
      describeImagePricing({ status: 'ready', model: MODEL, pricing })
    expect(ready({ unit: 'image', minUsd: 0.04, maxUsd: 0.04 })).toBe('Custo: US$ 0,04 por imagem.')
    expect(ready({ unit: 'image', minUsd: 0.041, maxUsd: 0.607 })).toBe(
      'Custo: de US$ 0,04 a US$ 0,61 por imagem, conforme a resolução.',
    )
    expect(ready({ unit: 'token', minUsd: 0.000008, maxUsd: 0.000008 })).toBe(
      'Custo: US$ 8,00 por milhão de tokens de imagem; o total depende da resolução.',
    )
    expect(describeImagePricing({ status: 'unavailable', model: MODEL })).toMatch(/não informou o preço/)
    expect(describeImagePricing({ status: 'loading', model: MODEL })).toMatch(/Consultando/)
  })
})

describe('generationOutcome', () => {
  it('traduz a resposta do serviço sem inventar texto além das mensagens fixas', () => {
    expect(generationOutcome('r', { ok: true, requestId: 'r', state: 'success', artifacts: [artifact('a.png')] })).toEqual({
      status: 'success',
      requestId: 'r',
      count: 1,
    })
    expect(generationOutcome('r', { ok: false, state: 'cancelled', code: 'cancelled', message: 'Cancelada.' })).toEqual({
      status: 'cancelled',
      requestId: 'r',
      message: 'Cancelada.',
    })
    expect(generationOutcome('r', { ok: false, state: 'error', code: 'authentication_error', message: 'Configure no Openia.' })).toEqual({
      status: 'error',
      requestId: 'r',
      code: 'authentication_error',
      message: 'Configure no Openia.',
    })
    expect(generationOutcome('r', undefined)).toMatchObject({ status: 'error', message: OPENIA_IMAGE_MESSAGES.requestFailed })
  })
})

describe('openia image store', () => {
  it('carrega o catálogo uma vez e esquece o modelo lembrado que saiu dele', async () => {
    const { bridge } = fakeBridge()
    const local = memoryStorage({ 'felixo:openia-image-model': 'acme/aposentado' })
    const { store } = storeWith(bridge, { local: () => local })
    expect(store.getSnapshot().model).toBe('acme/aposentado')

    await store.loadModels()
    await store.loadModels()
    expect(bridge.listImageModels).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot().models).toEqual({ status: 'ready', models: MODELS })
    expect(store.getSnapshot().model).toBe('')

    await store.loadModels({ force: true })
    expect(bridge.listImageModels).toHaveBeenCalledTimes(2)
  })

  it('catálogo indisponível mostra a mensagem fixa do serviço, e tentar de novo refaz a consulta', async () => {
    const { bridge } = fakeBridge({
      listImageModels: vi.fn(async () => ({ ok: false, code: 'catalog_unavailable', message: 'Catálogo fora do ar.' })),
    })
    const { store } = storeWith(bridge)
    await store.loadModels()
    expect(store.getSnapshot().models).toEqual({ status: 'error', message: 'Catálogo fora do ar.' })
    await store.loadModels()
    expect(bridge.listImageModels).toHaveBeenCalledTimes(2)
  })

  it('sem a ponte do Electron explica que a integração não existe, sem tentar gerar', async () => {
    const { store } = storeWith(undefined)
    await store.loadModels()
    expect(store.getSnapshot().models).toEqual({ status: 'error', message: OPENIA_IMAGE_MESSAGES.unavailable })
    store.setPrompt('um gato')
    store.setModel(MODEL)
    expect(store.generate()).toEqual({ ok: false, field: 'generation', message: OPENIA_IMAGE_MESSAGES.unavailable })
  })

  it('recusa pedido incompleto ANTES de chamar o processo principal', () => {
    const { bridge } = fakeBridge()
    const { store } = storeWith(bridge)
    expect(store.generate()).toMatchObject({ ok: false, field: 'prompt' })
    store.setPrompt('um gato')
    expect(store.generate()).toMatchObject({ ok: false, field: 'model' })
    expect(bridge.generateImage).not.toHaveBeenCalled()
  })

  it('gera com só prompt, modelo e id, fica pendente e termina em sucesso', async () => {
    const { bridge, pending } = fakeBridge()
    const { store, session, local } = storeWith(bridge)
    const seen = vi.fn()
    store.subscribe(seen)
    store.setPrompt('  um gato astronauta  ')
    store.setModel(MODEL)
    expect(local.data.get('felixo:openia-image-model')).toBe(MODEL)

    const outcome = store.generate(CONFIRMED)
    if (!outcome.ok) throw new Error('deveria ter iniciado')
    expect(bridge.generateImage).toHaveBeenCalledWith({ prompt: 'um gato astronauta', model: MODEL, requestId: 'img-teste-1' })
    expect(store.getSnapshot().generation).toEqual({ status: 'pending', requestId: 'img-teste-1', startedAt: 1_000, cancelling: false })
    expect(JSON.parse(session.data.get('felixo:openia-image-pending') ?? '{}')).toEqual({ requestId: 'img-teste-1', startedAt: 1_000 })

    // Enquanto uma geração corre, outra não começa (o botão vira "Cancelar").
    expect(store.generate()).toEqual({ ok: false, field: 'generation', message: OPENIA_IMAGE_MESSAGES.alreadyRunning })

    pending[0]({ ok: true, requestId: 'img-teste-1', state: 'success', artifacts: [artifact('a.png')] })
    await outcome.done
    expect(store.getSnapshot().generation).toEqual({ status: 'success', requestId: 'img-teste-1', count: 1 })
    expect(session.data.has('felixo:openia-image-pending')).toBe(false)
    // O prompt fica, para a pessoa ajustar e gerar outra variação.
    expect(store.getSnapshot().prompt).toBe('  um gato astronauta  ')
    expect(seen).toHaveBeenCalled()

    store.acknowledge()
    expect(store.getSnapshot().generation).toEqual({ status: 'idle' })
  })

  it('cancelar pede ao processo principal e o desfecho vem da resposta do pedido', async () => {
    const { bridge, pending } = fakeBridge()
    const { store } = storeWith(bridge)
    store.setPrompt('um gato')
    store.setModel(MODEL)
    const outcome = store.generate(CONFIRMED)
    if (!outcome.ok) throw new Error('deveria ter iniciado')

    await store.cancel()
    await store.cancel()
    expect(bridge.cancelImage).toHaveBeenCalledTimes(1)
    expect(bridge.cancelImage).toHaveBeenCalledWith({ requestId: 'img-teste-1' })
    expect(store.getSnapshot().generation).toMatchObject({ status: 'pending', cancelling: true })

    pending[0]({ ok: false, requestId: 'img-teste-1', state: 'cancelled', code: 'cancelled', message: 'A geração de imagem foi cancelada.' })
    await outcome.done
    expect(store.getSnapshot().generation).toEqual({
      status: 'cancelled',
      requestId: 'img-teste-1',
      message: 'A geração de imagem foi cancelada.',
    })
  })

  it('erro do serviço (ex.: chave ausente) aparece com a mensagem fixa e libera nova tentativa', async () => {
    const { bridge, pending } = fakeBridge()
    const { store } = storeWith(bridge)
    store.setPrompt('um gato')
    store.setModel(MODEL)
    const first = store.generate(CONFIRMED)
    if (!first.ok) throw new Error('deveria ter iniciado')
    pending[0]({ ok: false, requestId: 'img-teste-1', state: 'error', code: 'authentication_error', message: 'Configure no Openia.' })
    await first.done
    expect(store.getSnapshot().generation).toMatchObject({ status: 'error', code: 'authentication_error', message: 'Configure no Openia.' })

    expect(store.generate(CONFIRMED)).toMatchObject({ ok: true, requestId: 'img-teste-2' })
  })

  it('falha do IPC em si vira mensagem fixa, nunca exceção solta', async () => {
    const { bridge } = fakeBridge({ generateImage: vi.fn(async () => Promise.reject(new Error('canal fechado'))) })
    const { store } = storeWith(bridge)
    store.setPrompt('um gato')
    store.setModel(MODEL)
    const outcome = store.generate(CONFIRMED)
    if (!outcome.ok) throw new Error('deveria ter iniciado')
    await outcome.done
    expect(store.getSnapshot().generation).toMatchObject({ status: 'error', message: OPENIA_IMAGE_MESSAGES.requestFailed })
  })

  it('depois de recarregar a janela, retoma o pedido pelo imageStatus até ele terminar', async () => {
    const states = [
      { ok: true, requestId: 'img-antigo', state: 'pending' as const },
      { ok: true, requestId: 'img-antigo', state: 'error' as const, code: 'limit_error', message: 'Sem créditos.' },
    ]
    const { bridge } = fakeBridge({ imageStatus: vi.fn(async () => states.shift()!) })
    const session = memoryStorage({ 'felixo:openia-image-pending': JSON.stringify({ requestId: 'img-antigo', startedAt: 500 }) })
    const scheduled: Array<() => void> = []
    const { store } = storeWith(bridge, { session: () => session, schedule: (callback) => void scheduled.push(callback) })

    await store.reconcile()
    expect(bridge.imageStatus).toHaveBeenCalledWith({ requestId: 'img-antigo' })
    expect(store.getSnapshot().generation).toEqual({ status: 'pending', requestId: 'img-antigo', startedAt: 500, cancelling: false })
    expect(scheduled).toHaveLength(1)

    // Cancelar também vale para o pedido retomado.
    await store.cancel()
    expect(bridge.cancelImage).toHaveBeenCalledWith({ requestId: 'img-antigo' })

    scheduled[0]()
    await vi.waitFor(() => expect(store.getSnapshot().generation.status).toBe('error'))
    expect(store.getSnapshot().generation).toEqual({ status: 'error', requestId: 'img-antigo', code: 'limit_error', message: 'Sem créditos.' })
    expect(session.data.has('felixo:openia-image-pending')).toBe(false)
  })

  it('pedido que o processo principal não conhece mais (app reiniciado) é esquecido em silêncio', async () => {
    const { bridge } = fakeBridge()
    const session = memoryStorage({ 'felixo:openia-image-pending': JSON.stringify({ requestId: 'img-perdido', startedAt: 1 }) })
    const { store } = storeWith(bridge, { session: () => session })
    await store.reconcile()
    expect(store.getSnapshot().generation).toEqual({ status: 'idle' })
    expect(session.data.has('felixo:openia-image-pending')).toBe(false)
    // Só retoma uma vez por carregamento.
    expect(store.reconcile()).toBeUndefined()
  })

  it('sem confirmar o custo, Gerar não pede nada ao Openia', () => {
    const { bridge } = fakeBridge()
    const { store } = storeWith(bridge)
    store.setPrompt('um gato')
    store.setModel(MODEL)
    expect(store.generate()).toEqual({ ok: false, field: 'cost', message: OPENIA_IMAGE_MESSAGES.confirmCost })
    expect(bridge.generateImage).not.toHaveBeenCalled()
    expect(store.getSnapshot().generation).toEqual({ status: 'idle' })
  })

  it('"não perguntar de novo" vale para o modelo confirmado, sobrevive a reabrir o app e pode ser desfeito', async () => {
    const { bridge, pending } = fakeBridge()
    const { store, local } = storeWith(bridge)
    store.setPrompt('um gato')
    store.setModel(MODEL)
    const first = store.generate({ confirmed: true, remember: true })
    if (!first.ok) throw new Error('deveria ter iniciado')
    expect(store.getSnapshot().costRemembered).toBe(true)
    pending[0]({ ok: true, requestId: first.requestId, state: 'success', artifacts: [] })
    await first.done

    // Outra janela/abertura lendo o mesmo armazenamento já não pergunta para este modelo…
    const reopened = createOpeniaImageStore(() => bridge, { local: () => local, newRequestId: () => 'img-reaberto' })
    reopened.setPrompt('um cão')
    expect(reopened.getSnapshot().costRemembered).toBe(true)
    expect(reopened.generate()).toMatchObject({ ok: true, requestId: 'img-reaberto' })

    // …mas outro modelo tem outro preço e pede confirmação.
    store.setModel('acme/pixel-2')
    expect(store.getSnapshot().costRemembered).toBe(false)
    expect(store.generate()).toMatchObject({ ok: false, field: 'cost' })

    store.setModel(MODEL)
    store.forgetCostChoice()
    expect(store.getSnapshot().costRemembered).toBe(false)
    expect(store.generate()).toMatchObject({ ok: false, field: 'cost' })
    expect(bridge.generateImage).toHaveBeenCalledTimes(2)
  })

  it('confirmar uma vez sem "não perguntar de novo" vale só para aquela geração', async () => {
    const { bridge, pending } = fakeBridge()
    const { store } = storeWith(bridge)
    store.setPrompt('um gato')
    store.setModel(MODEL)
    const outcome = store.generate(CONFIRMED)
    if (!outcome.ok) throw new Error('deveria ter iniciado')
    pending[0]({ ok: true, requestId: outcome.requestId, state: 'success', artifacts: [] })
    await outcome.done
    expect(store.generate()).toMatchObject({ ok: false, field: 'cost' })
  })

  it('busca o preço do modelo escolhido, e o preço atrasado de outro modelo não sobrescreve', async () => {
    let release: (value: { ok: true; pricing: { unit: 'image'; minUsd: number; maxUsd: number } }) => void = () => {}
    const imagePricing = vi
      .fn()
      .mockImplementationOnce(() => new Promise((resolve) => (release = resolve)))
      .mockImplementationOnce(async () => ({ ok: true, pricing: { unit: 'token', minUsd: 0.000008, maxUsd: 0.000008 } }))
    const { bridge } = fakeBridge({ imagePricing } as Partial<Bridge>)
    const { store } = storeWith(bridge)
    store.setModel(MODEL)
    expect(store.getSnapshot().pricing).toEqual({ status: 'loading', model: MODEL })
    store.setModel('acme/pixel-2')
    await vi.waitFor(() => expect(store.getSnapshot().pricing.status).toBe('ready'))
    release({ ok: true, pricing: { unit: 'image', minUsd: 9, maxUsd: 9 } })
    await Promise.resolve()
    expect(store.getSnapshot().pricing).toEqual({
      status: 'ready',
      model: 'acme/pixel-2',
      pricing: { unit: 'token', minUsd: 0.000008, maxUsd: 0.000008 },
    })
    expect(imagePricing).toHaveBeenNthCalledWith(1, { model: MODEL })
  })

  it('armazenamento bloqueado não impede gerar', async () => {
    const blocked = () => {
      throw new Error('bloqueado')
    }
    const { bridge, pending } = fakeBridge()
    const store = createOpeniaImageStore(() => bridge, { session: blocked, local: blocked, newRequestId: () => 'img-sem-storage' })
    store.setPrompt('um gato')
    store.setModel(MODEL)
    const outcome = store.generate(CONFIRMED)
    if (!outcome.ok) throw new Error('deveria ter iniciado')
    pending[0]({ ok: true, requestId: 'img-sem-storage', state: 'success', artifacts: [] })
    await outcome.done
    expect(store.getSnapshot().generation).toMatchObject({ status: 'success', count: 0 })
  })
})

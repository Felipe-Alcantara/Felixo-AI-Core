import { describe, expect, it } from 'vitest'
import type { OnboardingCatalog } from './onboarding-catalog'
import type { OnboardingBootSignals } from './onboarding-state'
import {
  createOnboardingStore,
  type OnboardingLogEntry,
  type OnboardingReadResult,
  type OnboardingSnapshot,
  type OnboardingStore,
} from './onboarding-store'
import { createOnboardingStoreProxy, loadOnboardingUi, onboardingStore } from './onboarding-store-proxy'
import {
  CATALOG_WITH_CANVAS_TRIGGER,
  FIRST_BOOT,
  FIXED_NOW,
  PREVIOUS_USE,
  createDisk,
  deferred,
  diskValue,
  fakeBackend,
  memoryStorage,
  type FakeBackendOptions,
  type FakeDisk,
} from './onboarding-test-fixtures'

/**
 * U-proxy: o chunk do canvas só tem o procurador; a store real chega depois, num
 * chunk preguiçoso. O procurador não pode mudar nada do que a store decide: a
 * mesma sequência de chamadas dá o mesmo snapshot e as mesmas escritas que a
 * store sozinha, a leitura começa junto com o download e acontece uma vez só, e
 * o badge da Ajuda continua lendo a contagem de novidades.
 */

type Options = FakeBackendOptions & {
  signals?: OnboardingBootSignals
  catalog?: OnboardingCatalog
  noBridge?: boolean
  chunkFails?: boolean
}

function storeFactory(disk: FakeDisk, options: Options, logs: OnboardingLogEntry[]) {
  const backend = options.noBridge ? null : fakeBackend(disk, options)
  const session = memoryStorage()
  const create = (read?: (() => Promise<OnboardingReadResult>) | null) =>
    createOnboardingStore({
      backend: backend ? { read: read ?? (() => backend.read()), write: (request) => backend.write(request) } : null,
      session: () => session,
      now: () => FIXED_NOW,
      bootSignals: () => options.signals ?? FIRST_BOOT,
      clearFirstBootMarker: () => {},
      getLocale: () => 'pt-BR',
      getActiveElement: () => 'foco-anterior',
      catalog: options.catalog,
      schedule: () => {},
      log: (entry) => {
        logs.push(entry)
      },
    })
  return { backend, create }
}

/** O procurador com um "chunk" que só chega quando o teste mandar. */
function createHarness(options: Options = {}) {
  const disk = createDisk()
  const logs: OnboardingLogEntry[] = []
  const { backend, create } = storeFactory(disk, options, logs)
  const chunk = deferred()
  const loaded: OnboardingStore[] = []
  const reads: Array<(() => Promise<OnboardingReadResult>) | null> = []
  let downloads = 0
  const proxy = createOnboardingStoreProxy({
    loadStore: async (read) => {
      downloads++
      reads.push(read)
      await chunk.promise
      if (options.chunkFails) throw new Error('Failed to fetch dynamically imported module')
      const store = create(read)
      loaded.push(store)
      return store
    },
    read: backend ? () => backend.read() : null,
    log: (entry) => {
      logs.push(entry)
    },
  })
  return { proxy, disk, logs, chunk, loaded, reads, downloads: () => downloads }
}

/** A store sozinha, como era no chunk do canvas: a referência de comportamento. */
function createDirect(options: Options = {}) {
  const disk = createDisk()
  const logs: OnboardingLogEntry[] = []
  const store = storeFactory(disk, options, logs).create()
  return { store, disk, logs }
}

/** O que a pessoa e o smoke enxergam do snapshot. */
function visible(snapshot: OnboardingSnapshot) {
  return {
    fase: snapshot.fase,
    decisao: snapshot.decisao,
    persistencia: snapshot.persistencia,
    automacao: snapshot.automacao,
    tour: snapshot.tour && { tourId: snapshot.tour.tourId, stepIndex: snapshot.tour.stepIndex, trigger: snapshot.tour.trigger, foco: snapshot.tour.foco },
    aviso: snapshot.aviso && { featureId: snapshot.aviso.featureId, tourId: snapshot.aviso.tourId },
    ajuda: snapshot.ajuda,
    novidades: snapshot.novidades,
  }
}

type Call = (store: OnboardingStore) => void

/**
 * Roda a mesma sequência na store sozinha (como era no chunk do canvas: as chamadas da
 * montagem chegam juntas, com a leitura ainda em andamento) e no procurador (as mesmas
 * chamadas guardadas até o chunk chegar). Depois, as ações da pessoa, uma a uma.
 */
async function compare(options: Options, before: Call[], after: Call[] = []) {
  const direct = createDirect(options)
  for (const call of before) call(direct.store)
  await direct.store.settled()
  for (const call of after) {
    call(direct.store)
    await direct.store.settled()
  }

  const harness = createHarness(options)
  for (const call of before) call(harness.proxy)
  harness.chunk.resolve()
  await harness.proxy.settled()
  for (const call of after) {
    call(harness.proxy)
    await harness.proxy.settled()
  }
  return { direct, harness }
}

describe('procurador da store do tutorial', () => {
  it('antes da store: snapshot inicial, nada abre, e sinais sem hidratação não baixam o chunk', () => {
    const { proxy, downloads, disk } = createHarness()
    proxy.canvasUnmounted()
    proxy.canvasNodeTypes('file,terminal')
    proxy.dismissNotice()
    expect(downloads()).toBe(0)
    expect(disk.reads).toBe(0)
    expect(proxy.getSnapshot()).toMatchObject({ fase: 'carregando', decisao: 'carregando', tour: null, aviso: null, novidades: 0 })
    expect(proxy.getServerSnapshot()).toBe(proxy.getSnapshot())
    expect(proxy.focusBeforeOpen()).toBeNull()
  })

  it('canvasReady começa a leitura e o download juntos, e a store usa essa mesma leitura (uma só)', async () => {
    const { proxy, downloads, disk, chunk, reads } = createHarness()
    proxy.canvasReady(0)
    expect(disk.reads).toBe(1)
    expect(downloads()).toBe(1)
    expect(proxy.getSnapshot().decisao).toBe('carregando')
    chunk.resolve()
    await proxy.settled()
    expect(disk.reads).toBe(1)
    expect(proxy.getSnapshot()).toMatchObject({ fase: 'tour', decisao: 'aberto' })
    // A leitura antecipada é entregue uma vez; uma leitura seguinte vai à ponte de novo.
    await reads[0]?.()
    expect(disk.reads).toBe(2)
  })

  it('preload (canvas montado) baixa a store sem ler; o canvasReady com o chunk a caminho ainda antecipa a leitura', async () => {
    const { proxy, downloads, disk, chunk } = createHarness()
    proxy.preload()
    proxy.preload()
    expect(downloads()).toBe(1)
    expect(disk.reads).toBe(0)
    expect(proxy.getSnapshot().decisao).toBe('carregando')
    proxy.canvasReady(0)
    expect(disk.reads).toBe(1)
    chunk.resolve()
    await proxy.settled()
    expect(downloads()).toBe(1)
    expect(disk.reads).toBe(1)
    expect(proxy.getSnapshot()).toMatchObject({ fase: 'tour', decisao: 'aberto' })
  })

  it('com a store já ligada pelo preload, canvasReady vai direto para ela (a leitura é a dela)', async () => {
    const { proxy, disk, chunk } = createHarness()
    proxy.preload()
    chunk.resolve()
    await proxy.settled()
    expect(disk.reads).toBe(0)
    proxy.canvasReady(0)
    expect(disk.reads).toBe(1)
    await proxy.settled()
    expect(disk.reads).toBe(1)
    expect(proxy.getSnapshot()).toMatchObject({ fase: 'tour', decisao: 'aberto' })
  })

  it('primeiro uso: mesmo snapshot e mesmas escritas que a store sozinha', async () => {
    const { direct, harness } = await compare({}, [(store) => store.canvasReady(0)])
    expect(visible(harness.proxy.getSnapshot())).toEqual(visible(direct.store.getSnapshot()))
    expect(diskValue(harness.disk)).toEqual(diskValue(direct.disk))
    expect(harness.disk.writes.length).toBe(direct.disk.writes.length)
    expect(harness.proxy.focusBeforeOpen()).toBe('foco-anterior')
  })

  it('quem já usava: a novidade da Ajuda é anunciada e o badge conta 1, como na store sozinha', async () => {
    const options = { signals: PREVIOUS_USE }
    const { direct, harness } = await compare(options, [(store) => store.canvasReady(4)])
    expect(visible(direct.store.getSnapshot())).toMatchObject({ fase: 'aviso', decisao: 'anunciado', novidades: 1 })
    expect(visible(harness.proxy.getSnapshot())).toEqual(visible(direct.store.getSnapshot()))
    expect(diskValue(harness.disk)).toEqual(diskValue(direct.disk))
  })

  it('chamadas antes da store chegam nela na mesma ordem (StrictMode, volta do chat, tipos do canvas)', async () => {
    const options = { catalog: CATALOG_WITH_CANVAS_TRIGGER, signals: PREVIOUS_USE }
    const before: Call[] = [
      (store) => store.canvasReady(2),
      (store) => store.canvasUnmounted(),
      (store) => store.canvasReady(2),
      (store) => store.canvasNodeTypes('file,note'),
    ]
    const after: Call[] = [
      (store) => store.dismissNotice(),
      (store) => store.canvasNodeTypes('file,image,note'),
      (store) => store.dismissNotice(),
      (store) => store.open('inicial', 'ajuda'),
      (store) => store.next(),
      (store) => store.skip('botao'),
    ]
    const { direct, harness } = await compare(options, before, after)
    expect(visible(harness.proxy.getSnapshot())).toEqual(visible(direct.store.getSnapshot()))
    expect(diskValue(harness.disk)).toEqual(diskValue(direct.disk))
    expect(harness.disk.writes.map((write) => write.applied)).toEqual(direct.disk.writes.map((write) => write.applied))
  })

  it('a pessoa vai ao chat antes de a store chegar: a store sabe que o canvas saiu, e a novidade do canvas espera', async () => {
    const options = { catalog: CATALOG_WITH_CANVAS_TRIGGER, signals: PREVIOUS_USE }
    const before: Call[] = [
      (store) => store.canvasReady(2),
      (store) => store.canvasNodeTypes('file,note'),
      (store) => store.canvasUnmounted(),
    ]
    const after: Call[] = [
      (store) => store.dismissNotice(),
      (store) => store.canvasNodeTypes('file,image,note'),
    ]
    const { direct, harness } = await compare(options, before, after)
    expect(visible(direct.store.getSnapshot())).toMatchObject({ fase: 'ocioso', aviso: null })
    expect(visible(harness.proxy.getSnapshot())).toEqual(visible(direct.store.getSnapshot()))
    expect(diskValue(harness.disk)).toEqual(diskValue(direct.disk))
  })

  it('espelha a store e avisa quem assina (o badge da Ajuda re-renderiza com a contagem)', async () => {
    const { proxy, chunk, loaded } = createHarness({ signals: PREVIOUS_USE })
    const novidades: number[] = []
    const unsubscribe = proxy.subscribe(() => novidades.push(proxy.getSnapshot().novidades))
    proxy.canvasReady(3)
    chunk.resolve()
    await proxy.settled()
    expect(proxy.getSnapshot()).toBe(loaded[0]?.getSnapshot())
    expect(novidades.at(-1)).toBe(1)
    const count = novidades.length
    unsubscribe()
    proxy.dismissNotice()
    expect(novidades.length).toBe(count)
    expect(proxy.getSnapshot().fase).toBe('ocioso')
  })

  it('Ajuda antes da hidratação: ready() liga a store, e abrir passa direto para ela', async () => {
    const { proxy, chunk, disk } = createHarness()
    const ready = proxy.ready()
    chunk.resolve()
    await ready
    expect(proxy.getSnapshot().ajuda.length).toBeGreaterThan(0)
    proxy.open('inicial', 'ajuda')
    expect(proxy.getSnapshot()).toMatchObject({ fase: 'tour', tour: { trigger: 'ajuda', foco: 'mover' } })
    await proxy.settled()
    expect(disk.reads).toBe(1)
  })

  it('sem ponte: nenhuma leitura antecipada, e a store decide "sem-ponte"', async () => {
    const { proxy, chunk } = createHarness({ noBridge: true })
    proxy.canvasReady(0)
    chunk.resolve()
    await proxy.settled()
    expect(proxy.getSnapshot()).toMatchObject({ fase: 'ocioso', decisao: 'sem-ponte', persistencia: 'sem-ponte' })
  })

  it('chunk que não carrega: tutorial desativado na sessão, um erro no log, ready() rejeita e nada quebra depois', async () => {
    const { proxy, chunk, logs } = createHarness({ chunkFails: true })
    proxy.canvasReady(0)
    chunk.resolve()
    await proxy.settled()
    expect(proxy.getSnapshot()).toMatchObject({ fase: 'desativado', decisao: 'indisponivel', tour: null })
    expect(logs.filter((entry) => entry.level === 'error')).toHaveLength(1)
    await expect(proxy.ready()).rejects.toThrow('não carregou')
    proxy.open('inicial', 'ajuda')
    proxy.reportFailure(new Error('lazy rejeitou'))
    expect(proxy.getSnapshot().fase).toBe('desativado')
    expect(logs.filter((entry) => entry.level === 'error')).toHaveLength(1)
  })

  it('falha de render com a store ligada vai para ela; durante o download, chega quando ela chegar', async () => {
    const ligada = createHarness()
    ligada.proxy.canvasReady(0)
    ligada.chunk.resolve()
    await ligada.proxy.settled()
    ligada.proxy.reportFailure(new Error('render quebrou'), 'pilha')
    expect(ligada.proxy.getSnapshot()).toMatchObject({ fase: 'desativado', tour: null })
    expect(ligada.logs.at(-1)?.details).toMatchObject({ message: 'render quebrou', componentStack: 'pilha' })

    const baixando = createHarness()
    baixando.proxy.canvasReady(0)
    baixando.proxy.reportFailure(new Error('menu quebrou'))
    baixando.chunk.resolve()
    await baixando.proxy.settled()
    expect(baixando.proxy.getSnapshot().fase).toBe('desativado')
  })
})

describe('store da janela', () => {
  it('loadOnboardingUi entrega a interface com a store real já ligada (nunca o snapshot provisório)', async () => {
    expect(onboardingStore.getSnapshot().ajuda).toHaveLength(0)
    const ui = await loadOnboardingUi()
    expect(typeof ui.OnboardingHelpMenu).toBe('function')
    expect(typeof ui.OnboardingTourLayer).toBe('function')
    expect(onboardingStore.getSnapshot().ajuda.length).toBeGreaterThan(0)
  })
})

import { describe, expect, it } from 'vitest'
import type { OnboardingCatalog } from './onboarding-catalog'
import {
  applyOnboardingEvent,
  serializeOnboardingState,
  toIso,
  type OnboardingBootSignals,
  type OnboardingState,
} from './onboarding-state'
import { ONBOARDING_READ_TIMEOUT_MS, createOnboardingStore, type OnboardingLogEntry } from './onboarding-store'
import {
  BASE_CTX,
  CATALOG_WITH_CANVAS_TRIGGER,
  CATALOG_WITH_NEW_FEATURE,
  CATALOG_WITH_REQUIRES,
  FIRST_BOOT,
  FIXED_NOW,
  INTERRUPTED_FIRST_BOOT,
  PREVIOUS_USE,
  createDisk,
  deferred,
  diskValue,
  externalWrite,
  fakeBackend,
  memoryStorage,
  type FakeBackendOptions,
  type FakeDisk,
} from './onboarding-test-fixtures'

type HarnessOptions = FakeBackendOptions & {
  disk?: FakeDisk
  session?: ReturnType<typeof memoryStorage>
  signals?: OnboardingBootSignals
  catalog?: OnboardingCatalog
  noBridge?: boolean
}

function createHarness(options: HarnessOptions = {}) {
  const disk = options.disk ?? createDisk()
  const session = options.session ?? memoryStorage()
  const timers: Array<{ callback: () => void; ms: number }> = []
  const logs: OnboardingLogEntry[] = []
  const marker = { cleared: 0 }
  let clock = FIXED_NOW
  let active: unknown = 'foco-anterior'
  const store = createOnboardingStore({
    backend: options.noBridge ? null : fakeBackend(disk, options),
    session: () => session,
    now: () => clock,
    bootSignals: () => options.signals ?? FIRST_BOOT,
    clearFirstBootMarker: () => {
      marker.cleared++
    },
    getLocale: () => 'pt-BR',
    getActiveElement: () => active,
    catalog: options.catalog,
    schedule: (callback, ms) => {
      timers.push({ callback, ms })
    },
    log: (entry) => {
      logs.push(entry)
    },
  })
  return {
    store,
    disk,
    session,
    timers,
    logs,
    marker,
    snapshot: () => store.getSnapshot(),
    advance: (ms: number) => {
      clock += ms
    },
    setActive: (element: unknown) => {
      active = element
    },
    appliedWrites: () => disk.writes.filter((write) => write.applied).length,
  }
}

/** Estado gravado por quem concluiu o tutorial inicial (catálogo atual). */
function completedState(): OnboardingState {
  let state: OnboardingState | null = null
  state = applyOnboardingEvent(state, { tipo: 'REIVINDICAR_INICIAL' }, BASE_CTX)
  state = applyOnboardingEvent(state, { tipo: 'CONCLUIR', tourId: 'inicial', stepId: 'ajuda' }, BASE_CTX)
  if (!state) throw new Error('estado não criado')
  return state
}

function claimedState(): OnboardingState {
  const state = applyOnboardingEvent(null, { tipo: 'REIVINDICAR_INICIAL' }, BASE_CTX)
  if (!state) throw new Error('estado não criado')
  return state
}

const tourStatus = (disk: FakeDisk, tourId = 'inicial') =>
  ((diskValue(disk)?.tours as Record<string, { status?: string }> | undefined)?.[tourId] ?? {}).status

describe('store do tutorial: primeiro boot', () => {
  it('abre sozinho depois da hidratação, com foco mover e uma escrita', async () => {
    const h = createHarness()
    expect(h.snapshot().fase).toBe('carregando')
    h.store.canvasReady(0)
    await h.store.settled()

    const { fase, tour, decisao, persistencia } = h.snapshot()
    expect(fase).toBe('tour')
    expect(tour).toMatchObject({ tourId: 'inicial', stepIndex: 0, trigger: 'primeiro-uso', foco: 'mover', instancia: 1 })
    expect(tour?.passos).toHaveLength(6)
    expect(decisao).toBe('aberto')
    expect(persistencia).toBe('ok')
    expect(h.disk.writes).toHaveLength(1)
    expect(tourStatus(h.disk)).toBe('ativo')
    expect(h.marker.cleared).toBe(1)
    expect(h.store.focusBeforeOpen()).toBe('foco-anterior')
    expect(h.session.data.get('felixo:onboarding:sessao')).toBeDefined()
  })

  it('canvasReady duplicado (StrictMode) → uma escrita e uma abertura', async () => {
    const h = createHarness()
    h.store.canvasReady(0)
    h.store.canvasUnmounted()
    h.store.canvasReady(0)
    await h.store.settled()
    h.store.canvasReady(0)
    await h.store.settled()
    expect(h.disk.writes).toHaveLength(1)
    expect(h.snapshot().tour?.instancia).toBe(1)
  })

  it('nada abre antes da hidratação, e a leitura não trava o canvas', async () => {
    const h = createHarness()
    void h.store.load()
    await h.store.settled()
    expect(h.snapshot().fase).toBe('ocioso')
    expect(h.snapshot().tour).toBeNull()
    expect(h.disk.writes).toHaveLength(0)
  })

  it('primeiro boot interrompido (marcador e chaves do tema) continua sendo primeiro uso', async () => {
    const disk = createDisk()
    const crashed = createHarness({ disk, writeFails: true })
    crashed.store.canvasReady(0)
    await crashed.store.settled()
    expect(crashed.snapshot().tour).toBeNull()
    expect(crashed.appliedWrites()).toBe(0)

    const next = createHarness({ disk, signals: INTERRUPTED_FIRST_BOOT })
    next.store.canvasReady(0)
    await next.store.settled()
    expect(next.snapshot().tour?.trigger).toBe('primeiro-uso')
  })

  it('o relógio e a versão injetados aparecem no registro gravado (T1.e)', async () => {
    const h = createHarness({ appVersion: '0.1.423-2-gabc1234-dev' })
    h.store.canvasReady(0)
    await h.store.settled()
    const value = diskValue(h.disk)
    expect(value).toMatchObject({
      createdAt: toIso(FIXED_NOW),
      appVersion: { first: '0.1.423-2-gabc1234-dev', last: '0.1.423-2-gabc1234-dev' },
    })
    expect((value?.tours as Record<string, { seenAt: string }>).inicial.seenAt).toBe(toIso(FIXED_NOW))
  })
})

describe('store do tutorial: uso anterior, updates e novidades', () => {
  it('uso anterior → linha de base gravada, Ajuda "Não visto" e o aviso da Ajuda uma vez', async () => {
    const disk = createDisk()
    const h = createHarness({ disk, signals: PREVIOUS_USE })
    h.setActive('input-da-busca')
    h.store.canvasReady(0)
    await h.store.settled()

    const snapshot = h.snapshot()
    expect(snapshot.fase).toBe('aviso')
    expect(snapshot.tour).toBeNull()
    expect(snapshot.aviso).toEqual({
      featureId: 'feature.ajuda',
      tourId: 'novidade-ajuda',
      titulo: 'novidade.ajuda.titulo',
      lang: 'pt-BR',
    })
    expect(snapshot.ajuda[0]).toMatchObject({ tourId: 'inicial', status: 'nao-visto' })
    expect(snapshot.novidades).toBe(1)
    expect(h.disk.writes.map((write) => write.applied)).toEqual([true, true])
    expect(diskValue(disk)?.origin).toBe('uso-anterior')

    h.store.dismissNotice()
    expect(h.snapshot().fase).toBe('ocioso')
    expect(h.snapshot().ajuda[1]).toMatchObject({ featureId: 'feature.ajuda', status: 'novo' })

    const restart = createHarness({ disk, signals: PREVIOUS_USE })
    restart.store.canvasReady(0)
    await restart.store.settled()
    expect(restart.snapshot().fase).toBe('ocioso')
    expect(disk.writes).toHaveLength(2)
  })

  it('blocos no canvas contam como uso anterior mesmo sem chaves', async () => {
    const h = createHarness()
    h.store.canvasReady(4)
    await h.store.settled()
    expect(diskValue(h.disk)?.origin).toBe('uso-anterior')
    expect(h.snapshot().tour).toBeNull()
  })

  it('update sem feature → zero escritas (T1.a)', async () => {
    const h = createHarness({ disk: createDisk({ value: serializeOnboardingState(completedState()) }) })
    h.store.canvasReady(3)
    await h.store.settled()
    expect(h.disk.writes).toHaveLength(0)
    expect(h.snapshot()).toMatchObject({ fase: 'ocioso', decisao: 'nada' })
    expect(h.snapshot().ajuda[0].status).toBe('concluido')
  })

  it('update com feature → aviso uma vez; restart no mesmo backend → nada (T1.b, T3.c)', async () => {
    const disk = createDisk({ value: serializeOnboardingState(completedState()) })
    const h = createHarness({ disk, catalog: CATALOG_WITH_NEW_FEATURE })
    h.store.canvasReady(3)
    await h.store.settled()
    expect(h.snapshot().aviso).toMatchObject({ featureId: 'feature.nova', tourId: 'novidade-nova' })
    expect(h.disk.writes).toHaveLength(1)
    expect(tourStatus(disk)).toBe('concluido')

    h.store.viewNotice()
    expect(h.snapshot().tour).toMatchObject({ tourId: 'novidade-nova', trigger: 'novidade', foco: 'mover' })
    h.store.complete()
    await h.store.settled()

    const restart = createHarness({ disk, catalog: CATALOG_WITH_NEW_FEATURE })
    const writes = disk.writes.length
    restart.store.canvasReady(3)
    await restart.store.settled()
    expect(restart.snapshot()).toMatchObject({ fase: 'ocioso', aviso: null })
    expect(disk.writes).toHaveLength(writes)
  })

  it('capability desconhecida espera; quando fica disponível, anuncia uma vez', async () => {
    const disk = createDisk({ value: serializeOnboardingState(completedState()) })
    const h = createHarness({ disk, catalog: CATALOG_WITH_REQUIRES })
    h.store.canvasReady(1)
    await h.store.settled()
    expect(h.snapshot().fase).toBe('ocioso')
    expect(disk.writes).toHaveLength(0)

    h.store.setCapability('integracao', 'indisponivel')
    await h.store.settled()
    expect(disk.writes).toHaveLength(0)

    h.store.setCapability('integracao', 'disponivel')
    await h.store.settled()
    expect(h.snapshot().aviso?.featureId).toBe('feature.condicional')
    h.store.setCapability('integracao', 'indisponivel')
    h.store.setCapability('integracao', 'disponivel')
    await h.store.settled()
    expect(disk.writes).toHaveLength(1)
  })

  it('gatilho de canvas: hidratar com o tipo não dispara; o bloco ao vivo sim, e durante o tour fica pendente', async () => {
    const disk = createDisk({ value: serializeOnboardingState(completedState()) })
    const h = createHarness({ disk, catalog: CATALOG_WITH_CANVAS_TRIGGER })
    h.store.canvasReady(2)
    h.store.canvasNodeTypes('image,terminal')
    await h.store.settled()
    expect(h.snapshot().fase).toBe('ocioso')

    h.store.canvasNodeTypes('terminal')
    h.store.open('inicial', 'ajuda')
    h.store.canvasNodeTypes('image,terminal')
    await h.store.settled()
    expect(h.snapshot().fase).toBe('tour')
    expect(h.snapshot().aviso).toBeNull()

    h.store.skip('botao')
    await h.store.settled()
    expect(h.snapshot().aviso?.featureId).toBe('feature.imagem')
  })
})

describe('store do tutorial: várias instâncias, reload e restart (T3.d)', () => {
  it('duas stores no mesmo backend com leituras intercaladas → exatamente um tour', async () => {
    const disk = createDisk()
    const gate = deferred()
    const a = createHarness({ disk, readGate: gate })
    const b = createHarness({ disk, readGate: gate })
    a.store.canvasReady(0)
    b.store.canvasReady(0)
    gate.resolve()
    await Promise.all([a.store.settled(), b.store.settled()])

    const tours = [a.snapshot().tour, b.snapshot().tour].filter(Boolean)
    expect(tours).toHaveLength(1)
    expect(disk.revision).toBe(1)
    expect(disk.writes.map((write) => write.applied).sort()).toEqual([false, true])
  })

  it('reload com sessão retoma no mesmo passo, sem escrever e sem mover o foco', async () => {
    const disk = createDisk()
    const session = memoryStorage()
    const first = createHarness({ disk, session })
    first.store.canvasReady(0)
    await first.store.settled()
    first.store.next()
    first.store.next()
    expect(first.snapshot().tour?.stepIndex).toBe(2)
    const writes = disk.writes.length

    const reloaded = createHarness({ disk, session })
    reloaded.store.canvasReady(0)
    await reloaded.store.settled()
    expect(reloaded.snapshot().tour).toMatchObject({ stepIndex: 2, trigger: 'retomada', foco: 'manter' })
    expect(reloaded.snapshot().decisao).toBe('retomada')
    expect(reloaded.store.focusBeforeOpen()).toBeNull()
    expect(disk.writes).toHaveLength(writes)

    // Outro reload continua retomando: a sessão guarda o gatilho original.
    const again = createHarness({ disk, session })
    again.store.canvasReady(0)
    await again.store.settled()
    expect(again.snapshot().tour?.stepIndex).toBe(2)
  })

  it('restart (sessão vazia) com o estado já reivindicado → nada; a Ajuda mostra "Interrompido"', async () => {
    const disk = createDisk({ value: serializeOnboardingState(claimedState()) })
    const h = createHarness({ disk })
    h.store.canvasReady(0)
    await h.store.settled()
    expect(h.snapshot().fase).toBe('ocioso')
    expect(h.snapshot().ajuda[0]).toMatchObject({ status: 'interrompido', passo: 1 })
    expect(disk.writes).toHaveLength(0)
  })

  it('voltar do chat reaparece no mesmo passo, sem puxar o foco e sem nova instância', async () => {
    const h = createHarness()
    h.store.canvasReady(0)
    await h.store.settled()
    h.store.next()
    h.store.canvasUnmounted()
    // A camada remonta antes de o canvas hidratar (antes do canvasReady): o foco
    // já precisa estar em 'manter' na saída, senão a volta puxa o foco para o card.
    expect(h.snapshot().tour).toMatchObject({ stepIndex: 1, foco: 'manter', instancia: 1 })
    h.store.canvasReady(0)
    expect(h.snapshot().tour).toMatchObject({ stepIndex: 1, foco: 'manter', instancia: 1 })
  })

  it('reinstall: backend preservado → nada; backend novo com sinais vazios → primeiro uso', async () => {
    const disk = createDisk({ value: serializeOnboardingState(completedState()) })
    const preserved = createHarness({ disk })
    preserved.store.canvasReady(0)
    await preserved.store.settled()
    expect(preserved.snapshot().tour).toBeNull()

    const clean = createHarness({ disk: createDisk(), signals: FIRST_BOOT })
    clean.store.canvasReady(0)
    await clean.store.settled()
    expect(clean.snapshot().tour?.trigger).toBe('primeiro-uso')
  })
})

describe('store do tutorial: storage inválido e falhas (T1.c, T2.f)', () => {
  it('linha corrompida → recuperado, nada abre, CAS sobre a revisão lida', async () => {
    const disk = createDisk({ corrupted: true })
    const h = createHarness({ disk })
    h.store.canvasReady(0)
    await h.store.settled()
    expect(h.snapshot()).toMatchObject({ fase: 'ocioso', decisao: 'recuperado', tour: null })
    expect(disk.writes).toEqual([expect.objectContaining({ expectedRevision: 0, applied: true })])
    expect(diskValue(disk)?.origin).toBe('recuperado')
    expect(h.marker.cleared).toBe(1)
    expect(h.logs.some((entry) => entry.level === 'warn')).toBe(true)
  })

  it('schemaVersion inválido → recuperado sem abrir', async () => {
    const disk = createDisk({ value: { schemaVersion: 0, tours: 'x' } })
    const h = createHarness({ disk })
    h.store.canvasReady(0)
    await h.store.settled()
    expect(h.snapshot().decisao).toBe('recuperado')
    expect(h.snapshot().tour).toBeNull()
    expect(disk.writes[0]).toMatchObject({ expectedRevision: 1, applied: true })
  })

  it.each([
    ['ok:false', 'falha' as const],
    ['exceção', 'excecao' as const],
  ])('leitura com %s → indisponível: nada abre, a Ajuda funciona em memória', async (_name, read) => {
    const h = createHarness({ read })
    h.store.canvasReady(0)
    await h.store.settled()
    expect(h.snapshot()).toMatchObject({ fase: 'ocioso', persistencia: 'indisponivel', decisao: 'indisponivel' })

    h.store.open('inicial', 'ajuda')
    expect(h.snapshot().tour?.foco).toBe('mover')
    h.store.complete()
    await h.store.settled()
    expect(h.snapshot().ajuda[0].status).toBe('concluido')
    expect(h.disk.writes).toHaveLength(0)
  })

  it('leitura pendurada: o prazo de 4 s libera a sessão sem persistência', async () => {
    const h = createHarness({ read: 'pendurada' })
    h.store.canvasReady(0)
    expect(h.snapshot().fase).toBe('carregando')
    expect(h.timers.map((timer) => timer.ms)).toEqual([ONBOARDING_READ_TIMEOUT_MS])
    h.timers[0].callback()
    await h.store.settled()
    expect(h.snapshot()).toMatchObject({ fase: 'ocioso', persistencia: 'indisponivel' })
    expect(h.disk.writes).toHaveLength(0)
  })

  it('estado de versão mais nova → somente leitura: concluir não escreve e o disco fica intacto', async () => {
    const future = { schemaVersion: 2, tours: { inicial: { status: 'concluido' } }, novo: true }
    const disk = createDisk({ value: future })
    const h = createHarness({ disk })
    h.store.canvasReady(0)
    await h.store.settled()
    expect(h.snapshot()).toMatchObject({ persistencia: 'somente-leitura', decisao: 'somente-leitura', tour: null })

    h.store.open('inicial', 'ajuda')
    h.store.complete()
    await h.store.settled()
    expect(disk.writes).toHaveLength(0)
    expect(diskValue(disk)).toEqual(future)
  })

  it('escrita recusada → indisponível, segue em memória e registra no log', async () => {
    const h = createHarness({ writeFails: true, signals: PREVIOUS_USE })
    h.store.canvasReady(0)
    await h.store.settled()
    expect(h.snapshot().persistencia).toBe('indisponivel')
    expect(h.snapshot().aviso).toBeNull()
    expect(h.logs.some((entry) => entry.message.includes('sem persistência'))).toBe(true)
  })

  it('reportFailure → desativado, sem laço nem reabertura automática; a Ajuda ainda tenta', async () => {
    const disk = createDisk()
    const session = memoryStorage()
    const h = createHarness({ disk, session })
    h.store.canvasReady(0)
    await h.store.settled()
    h.store.reportFailure(new Error('render quebrou'))
    expect(h.snapshot()).toMatchObject({ fase: 'desativado', tour: null })
    expect(session.data.has('felixo:onboarding:sessao')).toBe(false)
    expect(h.logs.filter((entry) => entry.level === 'error')).toHaveLength(1)

    const reloaded = createHarness({ disk, session })
    reloaded.store.canvasReady(0)
    await reloaded.store.settled()
    expect(reloaded.snapshot().tour).toBeNull()

    h.store.open('inicial', 'ajuda')
    expect(h.snapshot().fase).toBe('tour')
  })
})

describe('store do tutorial: ações da pessoa', () => {
  it('autoOpen falso → zero escritas automáticas e a decisão exposta; a Ajuda grava normalmente', async () => {
    const h = createHarness({ automation: { autoOpen: false, reason: 'devtools' } })
    h.store.canvasReady(0)
    await h.store.settled()
    expect(h.snapshot()).toMatchObject({ fase: 'ocioso', decisao: 'suprimido:abriria-inicial', tour: null })
    expect(h.snapshot().automacao).toEqual({ autoOpen: false, reason: 'devtools' })
    expect(h.disk.writes).toHaveLength(0)
    expect(h.marker.cleared).toBe(0)

    h.store.open('inicial', 'ajuda')
    await h.store.settled()
    expect(h.disk.writes).toHaveLength(1)
    expect(diskValue(h.disk)?.origin).toBe('primeiro-uso')
  })

  it('sem ponte → sem-ponte, nada gravado, Ajuda em memória', async () => {
    const h = createHarness({ noBridge: true })
    h.store.canvasReady(0)
    await h.store.settled()
    expect(h.snapshot()).toMatchObject({ persistencia: 'sem-ponte', decisao: 'sem-ponte', tour: null })
    h.store.open('inicial', 'ajuda')
    expect(h.snapshot().ajuda[0].status).toBe('em-andamento')
    h.store.skip('esc')
    await h.store.settled()
    expect(h.snapshot().ajuda[0].status).toBe('pulado')
  })

  it('escrita pendente não trava Próximo nem Pular', async () => {
    const release = deferred()
    const h = createHarness({ automation: { autoOpen: false, reason: 'devtools' }, writeGate: () => release.promise })
    h.store.canvasReady(0)
    await h.store.settled()
    h.store.open('inicial', 'ajuda')
    h.store.next()
    expect(h.snapshot().tour?.stepIndex).toBe(1)
    h.store.skip('botao')
    expect(h.snapshot().fase).toBe('ocioso')
    release.resolve()
    await h.store.settled()
    expect(h.disk.writes.map((write) => write.applied)).toEqual([true, true])
    expect(tourStatus(h.disk)).toBe('dispensado')
  })

  it('Voltar no primeiro passo e Próximo no último não saem do intervalo; nenhum dos dois escreve', async () => {
    const h = createHarness({ automation: { autoOpen: false, reason: 'devtools' } })
    h.store.canvasReady(0)
    h.store.open('inicial', 'ajuda')
    await h.store.settled()
    const writes = h.disk.writes.length
    h.store.back()
    expect(h.snapshot().tour?.stepIndex).toBe(0)
    for (let index = 0; index < 10; index++) h.store.next()
    expect(h.snapshot().tour?.stepIndex).toBe(5)
    await h.store.settled()
    expect(h.disk.writes).toHaveLength(writes)
  })

  it('conflito ao pular e concluir reaplica sobre o estado da outra instância sem perder o que ela acrescentou', async () => {
    for (const close of ['skip', 'complete'] as const) {
      const disk = createDisk({ value: serializeOnboardingState(claimedState()) })
      const session = memoryStorage({
        'felixo:onboarding:sessao': JSON.stringify({ v: 1, tourId: 'inicial', stepIndex: 3, trigger: 'primeiro-uso' }),
      })
      const h = createHarness({ disk, session })
      h.store.canvasReady(0)
      await h.store.settled()
      expect(h.snapshot().tour?.trigger).toBe('retomada')

      externalWrite(disk, (value) => ({
        ...value,
        knownFeatures: ['feature.ajuda', 'feature.futura'],
        tours: { ...(value?.tours as object), 'tour-externo': { status: 'concluido' } },
      }))
      if (close === 'skip') h.store.skip('botao')
      else h.store.complete()
      await h.store.settled()

      const value = diskValue(disk)
      expect(value?.knownFeatures).toEqual(['feature.ajuda', 'feature.futura'])
      expect((value?.tours as Record<string, unknown>)['tour-externo']).toEqual({ status: 'concluido' })
      expect(tourStatus(disk)).toBe(close === 'skip' ? 'dispensado' : 'concluido')
      expect(disk.writes.map((write) => write.applied)).toEqual([false, true])
    }
  })

  it('redefinir abre o inicial com foco, grava e preserva knownFeatures', async () => {
    const disk = createDisk({ value: serializeOnboardingState(completedState()) })
    const h = createHarness({ disk })
    h.store.canvasReady(1)
    await h.store.settled()
    h.store.reset()
    expect(h.snapshot().tour).toMatchObject({ tourId: 'inicial', trigger: 'ajuda', foco: 'mover', stepIndex: 0 })
    await h.store.settled()
    const value = diskValue(disk)
    expect(value?.resetAt).toBe(toIso(FIXED_NOW))
    expect(value?.knownFeatures).toEqual(['feature.ajuda'])
    expect(tourStatus(disk)).toBe('ativo')
    expect(disk.writes.every((write) => write.applied)).toBe(true)
  })

  it('Continuar do passo n abre no passo salvo', async () => {
    const h = createHarness({ disk: createDisk({ value: serializeOnboardingState(claimedState()) }) })
    h.store.canvasReady(0)
    await h.store.settled()
    h.store.open('inicial', 'ajuda', { stepId: 'terminal' })
    expect(h.snapshot().tour?.stepIndex).toBe(3)
  })

  it('alvo alternativo fica registrado no próximo commit (anchorFallbacks)', async () => {
    const h = createHarness({ automation: { autoOpen: false, reason: 'devtools' } })
    h.store.canvasReady(0)
    h.store.open('inicial', 'ajuda')
    h.store.next()
    h.store.retarget('rail-menu')
    expect(h.snapshot().tour?.ancora).toBe('rail-menu')
    h.store.skip('esc')
    await h.store.settled()
    const tours = diskValue(h.disk)?.tours as Record<string, { context: { anchorFallbacks: string[] } }>
    expect(tours.inicial.context.anchorFallbacks).toEqual(['agente:rail-menu'])
  })

  it('anúncio para a região live incrementa a sequência mesmo com texto repetido', () => {
    const h = createHarness()
    h.store.announce('Passo 2 de 6: Agente')
    h.store.announce('Passo 2 de 6: Agente')
    expect(h.snapshot().anuncio).toEqual({ texto: 'Passo 2 de 6: Agente', seq: 2, lang: 'pt-BR' })
    h.store.announce('[Ƥȧşşǿ 2]', 'en-XA')
    expect(h.snapshot().anuncio).toEqual({ texto: '[Ƥȧşşǿ 2]', seq: 3, lang: 'en-XA' })
  })

  it('a abertura captura o título do tour e o lang do documento (a camada não lê o DOM no render)', () => {
    const h = createHarness()
    h.store.open('inicial', 'ajuda')
    expect(h.snapshot().tour).toMatchObject({ titulo: 'tour.inicial.titulo', lang: 'pt-BR' })
  })

  it('reportFailure leva a pilha de componentes ao log quando o boundary a informa', () => {
    const h = createHarness()
    h.store.reportFailure(new Error('render quebrou'), '\n    at OnboardingTourLayer')
    const entry = h.logs.find((item) => item.level === 'error')
    expect(entry?.details).toMatchObject({ message: 'render quebrou', componentStack: '\n    at OnboardingTourLayer' })
  })

  it('o snapshot de servidor é constante e nunca mostra tour', () => {
    const h = createHarness()
    expect(h.store.getServerSnapshot()).toBe(h.store.getServerSnapshot())
    expect(h.store.getServerSnapshot()).toMatchObject({ fase: 'carregando', tour: null, aviso: null })
  })
})

describe('store do tutorial: ações durante a leitura', () => {
  it('abrir pela Ajuda antes da leitura terminar: a novidade espera o tour fechar em vez de ser gasta em silêncio', async () => {
    const gate = deferred()
    const h = createHarness({ signals: PREVIOUS_USE, readGate: gate })
    h.store.canvasReady(0)
    h.store.open('inicial', 'ajuda')
    gate.resolve()
    await h.store.settled()
    expect(h.snapshot().fase).toBe('tour')
    expect(h.snapshot().aviso).toBeNull()
    expect((diskValue(h.disk)?.knownFeatures as string[]).includes('feature.ajuda')).toBe(false)

    h.store.complete()
    await h.store.settled()
    expect(h.snapshot().aviso?.featureId).toBe('feature.ajuda')
    expect(tourStatus(h.disk)).toBe('concluido')
  })
})

import { describe, expect, it } from 'vitest'
import type { CardSide, StepTarget } from './onboarding-catalog'
import {
  FOCUS_OWNERS_SELECTOR,
  HIDDEN_ANCESTOR_SELECTOR,
  LAYOUT_MARGIN,
  NOT_YIELDED,
  OWN_SURFACE_SELECTOR,
  SHEET_MIN_COLUMN_WIDTH,
  SHEET_MIN_HEIGHT,
  SIDEBAR_SCROLL_GATE_INITIAL,
  TARGET_INFLATE,
  ancestorCreatesContainingBlock,
  canRevealInSidebar,
  canStealFocus,
  computeCardPlacement,
  computeRingRect,
  computeSidebarReveal,
  containingBlockReason,
  decideFocusOnOpen,
  enterSidebarScrollStep,
  focusHoldOnYield,
  hasOpenModal,
  helpMenuKeyAction,
  inflateRect,
  isCompactViewport,
  nextModalYield,
  noteSidebarScrollEvent,
  noteTourSidebarScroll,
  placementFrozen,
  rectsIntersect,
  resolveFocusAfterModal,
  resolveReturnFocus,
  resolveStepTarget,
  type CardPlacement,
  type ContainingBlockStyle,
  type Rect,
  type TargetEnv,
  type TargetNode,
  type Viewport,
} from './onboarding-layout'

// ---------------------------------------------------------------------------
// computeCardPlacement: matriz relacional (nenhuma coordenada fixa nos asserts)
// ---------------------------------------------------------------------------

const VIEWPORTS: Viewport[] = [
  { width: 320, height: 720 },
  { width: 375, height: 667 },
  { width: 417, height: 289 },
  { width: 720, height: 500 },
  { width: 1280, height: 800 },
  { width: 3840, height: 2160 },
]

type TargetCase = { nome: string; lado?: CardSide; rect: (viewport: Viewport) => Rect }

const TARGETS: TargetCase[] = [
  { nome: 'rail', lado: 'direita', rect: () => ({ left: 8, top: 140, width: 38, height: 38 }) },
  { nome: 'rail-ajuda', lado: 'direita', rect: () => ({ left: 8, top: 225, width: 38, height: 38 }) },
  {
    nome: 'sidebar',
    lado: 'direita',
    rect: (viewport) => ({ left: 64, top: 180, width: Math.min(236, viewport.width - 80), height: 34 }),
  },
  {
    nome: 'cabeçalho do inspector',
    lado: 'esquerda',
    rect: (viewport) => ({ left: Math.max(0, viewport.width - 290), top: 48, width: 288, height: 36 }),
  },
  {
    nome: 'puck',
    lado: 'esquerda',
    rect: (viewport) => ({ left: viewport.width - 92, top: viewport.height - 76, width: 80, height: 36 }),
  },
  { nome: 'minúsculo no canto superior esquerdo', rect: () => ({ left: 2, top: 2, width: 4, height: 4 }) },
  {
    nome: 'minúsculo no canto superior direito',
    rect: (viewport) => ({ left: viewport.width - 6, top: 2, width: 4, height: 4 }),
  },
  {
    nome: 'minúsculo no canto inferior esquerdo',
    rect: (viewport) => ({ left: 2, top: viewport.height - 6, width: 4, height: 4 }),
  },
  {
    nome: 'minúsculo no canto inferior direito',
    rect: (viewport) => ({ left: viewport.width - 6, top: viewport.height - 6, width: 4, height: 4 }),
  },
]

/** `NoticeToast` dos HardwareNotices: 22rem, centralizado embaixo. */
const noticeToast = (viewport: Viewport): Rect => {
  const width = Math.min(352, viewport.width - 32)
  return { left: (viewport.width - width) / 2, top: viewport.height - 16 - 132, width, height: 132 }
}

/** Toast das CLIs: canto inferior direito. */
const cliToast = (viewport: Viewport): Rect => {
  const width = Math.min(320, viewport.width - 32)
  return { left: viewport.width - 16 - width, top: viewport.height - 16 - 120, width, height: 120 }
}

const OBSTACLES: Array<{ nome: string; rects: (viewport: Viewport) => Rect[] }> = [
  { nome: 'sem obstáculo', rects: () => [] },
  { nome: 'NoticeToast embaixo no centro', rects: (viewport) => [noticeToast(viewport)] },
  { nome: 'toast das CLIs embaixo à direita', rects: (viewport) => [cliToast(viewport)] },
  { nome: 'os dois avisos', rects: (viewport) => [noticeToast(viewport), cliToast(viewport)] },
]

/** Card normal e 2× mais alto (pseudo-locale com fonte maior). */
const CARDS = [
  { nome: 'normal', height: 220 },
  { nome: '2× mais alto', height: 440 },
]

const EPSILON = 0.001

function placementRect(placement: CardPlacement): Rect {
  return { top: placement.top, left: placement.left, width: placement.width, height: placement.height }
}

function isRoomy(viewport: Viewport) {
  return viewport.width >= 720 && viewport.height >= 500
}

/** Só um alvo maior que meia janela (a região do canvas, a coluna do inspector) pode ficar sob o card. */
function isHuge(target: Rect, viewport: Viewport) {
  return target.width > viewport.width / 2 || target.height > viewport.height / 2
}

describe('computeCardPlacement (matriz relacional)', () => {
  for (const viewport of VIEWPORTS) {
    for (const targetCase of TARGETS) {
      for (const obstacleCase of OBSTACLES) {
        for (const cardCase of CARDS) {
          const label = `${viewport.width}×${viewport.height} · ${targetCase.nome} · ${obstacleCase.nome} · card ${cardCase.nome}`
          it(label, () => {
            const target = targetCase.rect(viewport)
            const obstacles = obstacleCase.rects(viewport)
            const input = {
              viewport,
              target,
              card: { width: Math.min(352, viewport.width - 24), height: cardCase.height },
              preferredSide: targetCase.lado,
              obstacles,
            }
            const placement = computeCardPlacement(input)
            const rect = placementRect(placement)

            // Dentro da janela, com margem.
            expect(rect.left).toBeGreaterThanOrEqual(LAYOUT_MARGIN - EPSILON)
            expect(rect.top).toBeGreaterThanOrEqual(LAYOUT_MARGIN - EPSILON)
            expect(rect.left + rect.width).toBeLessThanOrEqual(viewport.width - LAYOUT_MARGIN + EPSILON)
            expect(rect.top + rect.height).toBeLessThanOrEqual(viewport.height - LAYOUT_MARGIN + EPSILON)
            expect(placement.height).toBeCloseTo(Math.min(cardCase.height, placement.maxHeight), 5)
            expect(placement.height).toBeGreaterThan(0)

            // Viewport compacto → folha.
            if (isCompactViewport(viewport)) expect(placement.mode).toBe('folha')

            // Nenhum modo cruza o alvo inflado, salvo alvo maior que meia janela (T2.c).
            if (placement.mode === 'ancorado' || !isHuge(target, viewport)) {
              expect(rectsIntersect(rect, inflateRect(target, TARGET_INFLATE))).toBe(false)
            }

            // Obstáculo evitado sempre que não foi declarado coberto; com espaço, nunca coberto.
            if (!placement.coversObstacle) {
              for (const obstacle of obstacles) expect(rectsIntersect(rect, obstacle)).toBe(false)
            }
            if (isRoomy(viewport)) expect(placement.coversObstacle).toBe(false)

            // Determinismo.
            expect(computeCardPlacement(input)).toEqual(placement)
          })
        }
      }
    }
  }
})

describe('computeCardPlacement (casos nomeados)', () => {
  const desktop = { width: 1280, height: 800 }

  it('alvo do rail usa o lado preferido (direita) quando há espaço', () => {
    const placement = computeCardPlacement({
      viewport: desktop,
      target: { left: 8, top: 140, width: 38, height: 38 },
      card: { width: 352, height: 220 },
      preferredSide: 'direita',
    })
    expect(placement).toMatchObject({ mode: 'ancorado', side: 'direita' })
  })

  it('cabeçalho do inspector usa a esquerda', () => {
    const placement = computeCardPlacement({
      viewport: desktop,
      target: { left: 990, top: 48, width: 288, height: 36 },
      card: { width: 352, height: 220 },
      preferredSide: 'esquerda',
    })
    expect(placement).toMatchObject({ mode: 'ancorado', side: 'esquerda' })
  })

  it('o card ao lado da Ajuda desvia do NoticeToast embaixo no centro', () => {
    const viewport = { width: 720, height: 500 }
    const toast = noticeToast(viewport)
    const placement = computeCardPlacement({
      viewport,
      target: { left: 8, top: 225, width: 38, height: 38 },
      card: { width: 352, height: 300 },
      preferredSide: 'direita',
      obstacles: [toast],
    })
    expect(placement.mode).toBe('ancorado')
    expect(rectsIntersect(placementRect(placement), toast)).toBe(false)
  })

  it('alvo maior que meia janela (a região do canvas) vira folha', () => {
    const placement = computeCardPlacement({
      viewport: desktop,
      target: { left: 0, top: 0, width: 1280, height: 800 },
      card: { width: 352, height: 220 },
    })
    expect(placement.mode).toBe('folha')
  })

  it('sem alvo, folha na borda de baixo com a largura cheia menos as margens', () => {
    const placement = computeCardPlacement({ viewport: desktop, target: null, card: { width: 352, height: 220 } })
    expect(placement).toMatchObject({ mode: 'folha', side: 'baixo', width: desktop.width - LAYOUT_MARGIN * 2 })
  })

  it('folha na borda oposta ao centro do alvo', () => {
    const viewport = { width: 375, height: 667 }
    const card = { width: 351, height: 220 }
    const top = computeCardPlacement({ viewport, target: { left: 8, top: 40, width: 38, height: 38 }, card })
    const down = computeCardPlacement({ viewport, target: { left: 8, top: 600, width: 38, height: 38 }, card })
    expect(top.side).toBe('baixo')
    expect(down.side).toBe('cima')
  })

  it('folha com obstáculo nas duas bordas encolhe entre o alvo e o obstáculo', () => {
    const viewport = { width: 375, height: 667 }
    const target = { left: 8, top: 100, width: 38, height: 38 }
    const toast = noticeToast(viewport)
    const placement = computeCardPlacement({ viewport, target, card: { width: 351, height: 440 }, obstacles: [toast] })
    const rect = placementRect(placement)
    expect(placement.mode).toBe('folha')
    expect(placement.coversObstacle).toBe(false)
    expect(placement.height).toBeGreaterThanOrEqual(SHEET_MIN_HEIGHT)
    expect(placement.height).toBeLessThan(440)
    expect(rectsIntersect(rect, toast)).toBe(false)
    expect(rectsIntersect(rect, inflateRect(target, TARGET_INFLATE))).toBe(false)
  })

  it('sem 160 px livres a folha cobre o obstáculo e declara isso', () => {
    const viewport = { width: 417, height: 289 }
    const target = { left: 8, top: 140, width: 38, height: 38 }
    const toast = noticeToast(viewport)
    const placement = computeCardPlacement({ viewport, target, card: { width: 393, height: 440 }, obstacles: [toast] })
    expect(placement.mode).toBe('folha')
    expect(placement.coversObstacle).toBe(true)
    expect(rectsIntersect(placementRect(placement), toast)).toBe(true)
  })

  // Medidas do app real (CSS px) na janela mínima com zoom: 800×500 com zoom +3 dá
  // 463×289 e 720×500 com zoom +3 dá 416×289. Nenhuma borda da janela cabe a folha
  // sem cobrir o alvo; antes, a folha ficava por cima dele (revisão adversarial).
  it.each<[string, Viewport, Rect, { width: number; height: number }]>([
    ['Projetos em 463×289', { width: 463, height: 289 }, { left: 7, top: 131, width: 38, height: 19 }, { width: 439, height: 159 }],
    ['Projetos em 416×289', { width: 416, height: 289 }, { left: 7, top: 131, width: 38, height: 19 }, { width: 392, height: 173 }],
    ['Ajuda em 416×289', { width: 416, height: 289 }, { left: 7, top: 181, width: 38, height: 19 }, { width: 392, height: 173 }],
    ['moldura Agente em 463×289', { width: 463, height: 289 }, { left: 60, top: 137, width: 166, height: 32 }, { width: 439, height: 173 }],
    ['moldura Agente em 416×289', { width: 416, height: 289 }, { left: 60, top: 110, width: 166, height: 32 }, { width: 392, height: 173 }],
    ['Novo bloco em 416×289', { width: 416, height: 289 }, { left: 60, top: 146, width: 166, height: 32 }, { width: 392, height: 159 }],
  ])('zoom alto na janela mínima: a folha fica na coluna ao lado de %s, sem cobrir o alvo', (_nome, viewport, target, card) => {
    const placement = computeCardPlacement({ viewport, target, card, preferredSide: 'direita' })
    const rect = placementRect(placement)
    expect(placement.mode).toBe('folha')
    expect(placement.side).toBe('direita')
    expect(rectsIntersect(rect, inflateRect(target, TARGET_INFLATE))).toBe(false)
    expect(placement.width).toBeGreaterThanOrEqual(SHEET_MIN_COLUMN_WIDTH)
    expect(rect.left + rect.width).toBeLessThanOrEqual(viewport.width - LAYOUT_MARGIN + EPSILON)
    expect(rect.top).toBeGreaterThanOrEqual(LAYOUT_MARGIN - EPSILON)
    expect(rect.top + rect.height).toBeLessThanOrEqual(viewport.height - LAYOUT_MARGIN + EPSILON)
    // Remedido na largura da coluna (o texto reflui), continua na mesma coluna.
    const again = computeCardPlacement({ viewport, target, card: { width: placement.width, height: 260 }, preferredSide: 'direita' })
    expect(again).toMatchObject({ mode: 'folha', side: 'direita', left: placement.left, width: placement.width })
    expect(rectsIntersect(placementRect(again), inflateRect(target, TARGET_INFLATE))).toBe(false)
  })

  it('alvo à direita (puck) numa janela baixa usa a coluna da esquerda', () => {
    const viewport = { width: 416, height: 289 }
    const target = { left: 300, top: 120, width: 80, height: 36 }
    const placement = computeCardPlacement({ viewport, target, card: { width: 392, height: 200 }, preferredSide: 'esquerda' })
    expect(placement).toMatchObject({ mode: 'folha', side: 'esquerda' })
    expect(rectsIntersect(placementRect(placement), inflateRect(target, TARGET_INFLATE))).toBe(false)
  })

  it('sem nenhuma coluna nem borda utilizável a folha cobre o alvo (limitação declarada)', () => {
    const viewport = { width: 300, height: 200 }
    const target = { left: 100, top: 80, width: 100, height: 40 }
    const placement = computeCardPlacement({ viewport, target, card: { width: 276, height: 200 } })
    expect(placement.mode).toBe('folha')
    expect(rectsIntersect(placementRect(placement), target)).toBe(true)
  })

  it('card mais alto que a janela fica ao lado com teto e corpo rolável', () => {
    const viewport = { width: 1280, height: 600 }
    const placement = computeCardPlacement({
      viewport,
      target: { left: 8, top: 140, width: 38, height: 38 },
      card: { width: 352, height: 900 },
      preferredSide: 'direita',
    })
    expect(placement).toMatchObject({ mode: 'ancorado', side: 'direita' })
    expect(placement.maxHeight).toBe(viewport.height - LAYOUT_MARGIN * 2)
  })
})

describe('computeRingRect e computeSidebarReveal', () => {
  it('o anel contém o alvo (±2 px) e fica dentro da janela', () => {
    const viewport = { width: 1280, height: 800 }
    for (const target of [
      { left: 8, top: 140, width: 38, height: 38 },
      { left: 0, top: 0, width: 1280, height: 800 },
      { left: 1276, top: 796, width: 4, height: 4 },
    ]) {
      const ring = computeRingRect(target, viewport)
      if (!ring) throw new Error('anel ausente para um alvo na janela')
      expect(ring.left).toBeLessThanOrEqual(target.left + 2)
      expect(ring.top).toBeLessThanOrEqual(target.top + 2)
      expect(ring.left + ring.width).toBeGreaterThanOrEqual(target.left + target.width - 2)
      expect(ring.top + ring.height).toBeGreaterThanOrEqual(target.top + target.height - 2)
      expect(ring.left).toBeGreaterThanOrEqual(0)
      expect(ring.left + ring.width).toBeLessThanOrEqual(viewport.width)
    }
  })

  it('alvo que a pessoa rolou para fora da sidebar: o anel mostra só a parte visível e some sem nada à vista', () => {
    const viewport = { width: 1280, height: 600 }
    const sidebar = { left: 52, top: 100, width: 250, height: 400 }
    const metade = computeRingRect({ left: 60, top: 480, width: 200, height: 40 }, viewport, sidebar)
    expect(metade).toEqual({ left: 60, top: 480, width: 200, height: 20 })
    expect(computeRingRect({ left: 60, top: 40, width: 200, height: 30 }, viewport, sidebar)).toBeNull()
    expect(computeRingRect({ left: 60, top: 700, width: 200, height: 30 }, viewport, sidebar)).toBeNull()
    // Sem recorte (alvo fora da sidebar), o anel é o de sempre.
    expect(computeRingRect({ left: 8, top: 140, width: 38, height: 38 }, viewport, null)).toEqual({ left: 8, top: 140, width: 38, height: 38 })
  })

  it('não rola quando o alvo já está inteiro na sidebar', () => {
    const container = { left: 52, top: 100, width: 250, height: 400 }
    expect(computeSidebarReveal({ target: { left: 60, top: 150, width: 200, height: 30 }, container, scrollTop: 0 })).toBeNull()
  })

  it('rola para baixo o suficiente para o alvo abaixo da dobra aparecer inteiro', () => {
    const container = { left: 52, top: 100, width: 250, height: 400 }
    const target = { left: 60, top: 560, width: 200, height: 30 }
    const next = computeSidebarReveal({ target, container, scrollTop: 40 })
    expect(next).not.toBeNull()
    const shift = (next ?? 0) - 40
    expect(target.top - shift).toBeGreaterThanOrEqual(container.top)
    expect(target.top + target.height - shift).toBeLessThanOrEqual(container.top + container.height)
  })

  it('rola para cima sem passar de zero', () => {
    const container = { left: 52, top: 100, width: 250, height: 400 }
    expect(computeSidebarReveal({ target: { left: 60, top: 60, width: 200, height: 30 }, container, scrollTop: 20 })).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Dono da rolagem da sidebar: o tour revela o alvo até a pessoa rolar
// ---------------------------------------------------------------------------

describe('SidebarScrollGate (a rolagem da pessoa vence a do tour)', () => {
  const noPasso = (step: string) => enterSidebarScrollStep(SIDEBAR_SCROLL_GATE_INITIAL, step)

  it('passo novo: o tour pode revelar o alvo', () => {
    expect(canRevealInSidebar(noPasso('1:1'))).toBe(true)
  })

  it('o evento da rolagem do próprio tour não conta como da pessoa', () => {
    let gate = noteTourSidebarScroll(noPasso('1:1'), 28)
    gate = noteSidebarScrollEvent(gate, 28.4)
    expect(canRevealInSidebar(gate)).toBe(true)
    expect(gate.ownScrollTop).toBeNull()
  })

  it('depois que a pessoa rola (roda, barra ou foco do Tab), o tour não rola mais naquele passo', () => {
    // Reprodução da revisão: a pessoa rola até o fim (709) e o tour devolvia para 28.
    let gate = noteSidebarScrollEvent(noteSidebarScrollEvent(noteTourSidebarScroll(noPasso('1:1'), 28), 28), 709)
    expect(canRevealInSidebar(gate)).toBe(false)
    // Outro alvo no mesmo passo (retarget) continua sem rolar.
    gate = enterSidebarScrollStep(gate, '1:1')
    expect(canRevealInSidebar(gate)).toBe(false)
  })

  it('a pessoa rolou antes de o evento do tour chegar: vale a da pessoa', () => {
    const gate = noteSidebarScrollEvent(noteTourSidebarScroll(noPasso('1:1'), 28), 300)
    expect(canRevealInSidebar(gate)).toBe(false)
  })

  it('no passo seguinte o tour volta a poder revelar, e o evento atrasado do anterior não fecha o novo', () => {
    let gate = noteSidebarScrollEvent(noPasso('1:1'), 709)
    gate = noteTourSidebarScroll(enterSidebarScrollStep(gate, '1:2'), 65)
    expect(canRevealInSidebar(gate)).toBe(true)
    gate = enterSidebarScrollStep(gate, '1:3')
    gate = noteSidebarScrollEvent(gate, 65)
    expect(canRevealInSidebar(gate)).toBe(true)
  })

  it('mesmo passo de novo não mexe no estado', () => {
    const gate = noteSidebarScrollEvent(noPasso('2:1'), 10)
    expect(enterSidebarScrollStep(gate, '2:1')).toBe(gate)
  })
})

// ---------------------------------------------------------------------------
// resolveStepTarget com DOM falso
// ---------------------------------------------------------------------------

type FakeOptions = {
  rect: Rect
  connected?: boolean
  hiddenAncestor?: boolean
  ownSurface?: boolean
  visibility?: string
  opacity?: string
}

type FakeNode = TargetNode & { options: FakeOptions; children: FakeNode[] }

function fakeNode(options: FakeOptions): FakeNode {
  const node: FakeNode = {
    options,
    children: [],
    get isConnected() {
      return options.connected ?? true
    },
    closest(selector: string) {
      if (selector === HIDDEN_ANCESTOR_SELECTOR && options.hiddenAncestor) return {}
      if (selector === OWN_SURFACE_SELECTOR && options.ownSurface) return {}
      return null
    },
    contains(other: unknown) {
      return other === node || node.children.some((child) => child === other || child.contains(other))
    },
    getBoundingClientRect: () => options.rect,
  }
  return node
}

const VIEWPORT = { width: 1280, height: 800 }
const selector = (anchor: string) => `[data-felixo-tour-anchor="${anchor}"]`

function createEnv(nodes: Record<string, FakeNode>, extra: Partial<TargetEnv> = {}): TargetEnv {
  const all = Object.values(nodes)
  return {
    viewport: VIEWPORT,
    query: (value) => {
      const entry = Object.entries(nodes).find(([anchor]) => selector(anchor) === value)
      return entry ? entry[1] : null
    },
    style: (node) => ({
      visibility: (node as FakeNode).options.visibility ?? 'visible',
      opacity: (node as FakeNode).options.opacity ?? '1',
    }),
    scrollContainer: null,
    // Por padrão o ponto cai no último nó registrado que contém o ponto.
    elementFromPoint: (x, y) =>
      [...all].reverse().find(({ options: { rect } }) =>
        x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height,
      ) ?? null,
    ...extra,
  }
}

const CHAIN: StepTarget[] = [
  { anchor: 'criar-agente', body: 'passo.agente.corpo', label: 'Agente', side: 'direita' },
  { anchor: 'secao-criar', body: 'passo.agente.corpo-secao', label: 'Criar', side: 'direita' },
  { anchor: 'rail-menu', body: 'passo.agente.corpo-menu', label: 'menu do canvas', side: 'direita' },
]

const rects = {
  agente: { left: 64, top: 200, width: 230, height: 34 },
  secao: { left: 64, top: 160, width: 230, height: 28 },
  menu: { left: 8, top: 9, width: 38, height: 38 },
}

describe('resolveStepTarget (cadeia de alvos)', () => {
  it('primário visível vence', () => {
    const env = createEnv({
      'criar-agente': fakeNode({ rect: rects.agente }),
      'secao-criar': fakeNode({ rect: rects.secao }),
      'rail-menu': fakeNode({ rect: rects.menu }),
    })
    expect(resolveStepTarget({ targets: CHAIN }, env)).toMatchObject({
      anchor: 'criar-agente',
      needsReveal: false,
      fallback: false,
    })
  })

  it.each([
    ['dentro de [inert]', { hiddenAncestor: true }],
    ['desconectado', { connected: false }],
    ['com opacity 0', { opacity: '0' }],
    ['com visibility hidden', { visibility: 'hidden' }],
    ['com retângulo vazio', { rect: { left: 64, top: 200, width: 0, height: 0 } }],
    ['fora da janela', { rect: { left: -500, top: 200, width: 230, height: 34 } }],
  ])('primário %s cai no próximo da cadeia', (_nome, patch) => {
    const env = createEnv({
      'criar-agente': fakeNode({ rect: rects.agente, ...patch }),
      'secao-criar': fakeNode({ rect: rects.secao }),
      'rail-menu': fakeNode({ rect: rects.menu }),
    })
    expect(resolveStepTarget({ targets: CHAIN }, env)?.anchor).toBe('secao-criar')
  })

  it('primário ausente (seção Criar recolhida) cai no próximo sem erro', () => {
    const env = createEnv({ 'secao-criar': fakeNode({ rect: rects.secao }), 'rail-menu': fakeNode({ rect: rects.menu }) })
    expect(resolveStepTarget({ targets: CHAIN }, env)?.anchor).toBe('secao-criar')
  })

  it('primário ocluído (elementFromPoint cai em outro elemento) cai no próximo', () => {
    // O "cover" é registrado por último: o ponto do centro do primário cai nele.
    const env = createEnv({
      'criar-agente': fakeNode({ rect: rects.agente }),
      'secao-criar': fakeNode({ rect: rects.secao }),
      'rail-menu': fakeNode({ rect: rects.menu }),
      'painel-por-cima': fakeNode({ rect: rects.agente }),
    })
    expect(resolveStepTarget({ targets: CHAIN }, env)?.anchor).toBe('secao-criar')
  })

  it('um descendente do alvo no ponto conta como o próprio alvo', () => {
    const agente = fakeNode({ rect: rects.agente })
    const label = fakeNode({ rect: rects.agente })
    agente.children.push(label)
    const env = createEnv({ 'criar-agente': agente }, { elementFromPoint: () => label })
    expect(resolveStepTarget({ targets: CHAIN }, env)?.anchor).toBe('criar-agente')
  })

  it('o card do próprio tour por cima do alvo não conta como oclusão', () => {
    const env = createEnv(
      { 'criar-agente': fakeNode({ rect: rects.agente }) },
      { elementFromPoint: () => fakeNode({ rect: rects.agente, ownSurface: true }) },
    )
    expect(resolveStepTarget({ targets: CHAIN }, env)?.anchor).toBe('criar-agente')
  })

  it('alvo abaixo da dobra da sidebar pede rolagem do contêiner (needsReveal)', () => {
    const agente = fakeNode({ rect: { left: 64, top: 700, width: 230, height: 34 } })
    const container = fakeNode({ rect: { left: 52, top: 100, width: 260, height: 400 } })
    container.children.push(agente)
    const env = createEnv({ 'criar-agente': agente }, { scrollContainer: container })
    expect(resolveStepTarget({ targets: CHAIN }, env)).toMatchObject({ anchor: 'criar-agente', needsReveal: true })
  })

  it('alvo dentro da sidebar traz o recorte da área visível dela (o anel não sai da sidebar)', () => {
    const agente = fakeNode({ rect: { left: 64, top: 480, width: 230, height: 34 } })
    const container = fakeNode({ rect: { left: 52, top: 100, width: 260, height: 400 } })
    container.children.push(agente)
    const env = createEnv({ 'criar-agente': agente, 'rail-menu': fakeNode({ rect: rects.menu }) }, { scrollContainer: container })
    expect(resolveStepTarget({ targets: CHAIN }, env)).toMatchObject({
      anchor: 'criar-agente',
      clip: { left: 52, top: 100, width: 260, height: 400 },
    })
    // O menu do canvas fica fora da sidebar: sem recorte.
    const menuOnly = createEnv({ 'rail-menu': fakeNode({ rect: rects.menu }) }, { scrollContainer: container })
    expect(resolveStepTarget({ targets: CHAIN }, menuOnly)).toMatchObject({ anchor: 'rail-menu', clip: null })
  })

  it('nada resolvível: usa o último da cadeia (sempre visível) marcado como fallback', () => {
    const menu = fakeNode({ rect: rects.menu })
    const env = createEnv({ 'rail-menu': menu }, { elementFromPoint: () => null })
    expect(resolveStepTarget({ targets: CHAIN }, env)).toMatchObject({ anchor: 'rail-menu', fallback: true })
  })

  it('nada no DOM → null', () => {
    expect(resolveStepTarget({ targets: CHAIN }, createEnv({}))).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Foco
// ---------------------------------------------------------------------------

/** Elemento falso que "casa" um seletor da lista quando ele aparece no seletor consultado. */
function focusNode(tagName: string, owner?: string, extra: Record<string, unknown> = {}) {
  return {
    tagName,
    isConnected: true,
    closest: (selector: string) => (owner && selector.split(', ').includes(owner) ? {} : null),
    getClientRects: () => ({ length: 1 }),
    ...extra,
  }
}

describe('canStealFocus e decideFocusOnOpen', () => {
  const canvas = focusNode('DIV')

  it.each([
    ['nada focado (null)', null],
    ['body', focusNode('BODY')],
    ['html', focusNode('HTML')],
  ])('pode tirar o foco de %s', (_nome, active) => {
    expect(canStealFocus(active, canvas)).toBe(true)
  })

  it('pode tirar o foco da própria região do canvas', () => {
    expect(canStealFocus(canvas, canvas)).toBe(true)
  })

  it.each([
    ['input', focusNode('INPUT', 'input')],
    ['textarea', focusNode('TEXTAREA', 'textarea')],
    ['select', focusNode('SELECT', 'select')],
    ['contenteditable', focusNode('DIV', '[contenteditable]:not([contenteditable="false"])')],
    ['.xterm', focusNode('DIV', '.xterm')],
    ['.xterm-helper-textarea', focusNode('TEXTAREA', '.xterm-helper-textarea')],
    ['dentro da gaveta do terminal', focusNode('BUTTON', '[data-canvas-terminal-drawer]')],
    ['webview', focusNode('WEBVIEW', 'webview')],
    ['[role="dialog"]', focusNode('BUTTON', '[role="dialog"]')],
    ['[aria-modal="true"]', focusNode('BUTTON', '[aria-modal="true"]')],
    ['menu do Felixo (popover)', focusNode('DIV', '[data-felixo-popover-surface]')],
    ['botão comum escolhido pela pessoa', focusNode('BUTTON')],
  ])('nunca tira o foco de %s', (_nome, active) => {
    expect(canStealFocus(active, canvas)).toBe(false)
  })

  it('a lista documentada cobre todos os donos de teclado do plano', () => {
    for (const item of ['input', 'textarea', 'select', '.xterm', '.xterm-helper-textarea', 'webview']) {
      expect(FOCUS_OWNERS_SELECTOR.split(', ')).toContain(item)
    }
  })

  it('abertura automática do primeiro uso só move o foco quando pode', () => {
    expect(decideFocusOnOpen({ trigger: 'primeiro-uso', foco: 'mover', activeElement: focusNode('BODY') })).toBe(true)
    expect(
      decideFocusOnOpen({ trigger: 'primeiro-uso', foco: 'mover', activeElement: focusNode('TEXTAREA', '.xterm-helper-textarea') }),
    ).toBe(false)
  })

  it('Ajuda e "Ver" sempre movem; retomada e foco manter nunca movem', () => {
    const typing = focusNode('INPUT', 'input')
    expect(decideFocusOnOpen({ trigger: 'ajuda', foco: 'mover', activeElement: typing })).toBe(true)
    expect(decideFocusOnOpen({ trigger: 'novidade', foco: 'mover', activeElement: typing })).toBe(true)
    expect(decideFocusOnOpen({ trigger: 'retomada', foco: 'manter', activeElement: null })).toBe(false)
    expect(decideFocusOnOpen({ trigger: 'ajuda', foco: 'manter', activeElement: null })).toBe(false)
  })
})

describe('resolveReturnFocus', () => {
  const help = focusNode('BUTTON')
  const canvas = focusNode('DIV')
  const body = focusNode('BODY')

  it('volta ao elemento salvo na abertura quando ele ainda serve', () => {
    const saved = focusNode('BUTTON')
    expect(resolveReturnFocus({ focusWasInside: true, current: body, saved, helpTrigger: help, canvas })).toBe(saved)
  })

  it('salvo desconectado → botão Ajuda → canvas', () => {
    const gone = focusNode('BUTTON', undefined, { isConnected: false })
    expect(resolveReturnFocus({ focusWasInside: true, current: body, saved: gone, helpTrigger: help, canvas })).toBe(help)
    expect(resolveReturnFocus({ focusWasInside: true, current: body, saved: gone, helpTrigger: null, canvas })).toBe(canvas)
  })

  it('salvo dentro de [inert] ou invisível não serve', () => {
    const inert = focusNode('BUTTON', HIDDEN_ANCESTOR_SELECTOR.split(', ')[0])
    const inertNode = { ...inert, closest: (selector: string) => (selector === HIDDEN_ANCESTOR_SELECTOR ? {} : null) }
    const invisible = focusNode('BUTTON', undefined, { getClientRects: () => ({ length: 0 }) })
    expect(resolveReturnFocus({ focusWasInside: true, current: null, saved: inertNode, helpTrigger: help, canvas })).toBe(help)
    expect(resolveReturnFocus({ focusWasInside: true, current: null, saved: invisible, helpTrigger: help, canvas })).toBe(help)
  })

  it('o body salvo na abertura automática não serve: vai para a Ajuda', () => {
    expect(resolveReturnFocus({ focusWasInside: true, current: body, saved: body, helpTrigger: help, canvas })).toBe(help)
  })

  it('foco já fora do card → não devolve', () => {
    const saved = focusNode('BUTTON')
    expect(resolveReturnFocus({ focusWasInside: false, current: body, saved, helpTrigger: help, canvas })).toBeNull()
    const elsewhere = focusNode('INPUT', 'input')
    expect(resolveReturnFocus({ focusWasInside: true, current: elsewhere, saved, helpTrigger: help, canvas })).toBeNull()
  })
})

describe('diálogo modal por cima do tour (nextModalYield e resolveFocusAfterModal)', () => {
  const body = focusNode('BODY')
  const proximo = focusNode('BUTTON')
  const card = { ...focusNode('DIV', '[role="dialog"]'), contains: (node: unknown) => node === card || node === proximo }
  const terminal = focusNode('TEXTAREA', '.xterm-helper-textarea')

  it('cede quando o modal abre e guarda o controle do tour que tinha o foco', () => {
    const cedeu = nextModalYield(NOT_YIELDED, { modalAberto: true, ativo: proximo, superficie: card })
    expect(cedeu).toEqual({ cedido: true, foco: proximo })
    expect(nextModalYield(NOT_YIELDED, { modalAberto: true, ativo: card, superficie: card }).foco).toBe(card)
  })

  it('foco fora do tour não é guardado: fechar o diálogo não o puxa para o card', () => {
    const cedeu = nextModalYield(NOT_YIELDED, { modalAberto: true, ativo: terminal, superficie: card })
    expect(cedeu).toEqual({ cedido: true, foco: null })
    expect(nextModalYield(NOT_YIELDED, { modalAberto: true, ativo: null, superficie: card }).foco).toBeNull()
    expect(resolveFocusAfterModal({ saved: cedeu.foco, current: body, surface: card })).toBeNull()
  })

  it('sem mudança devolve o mesmo estado (a conferência periódica não re-renderiza)', () => {
    expect(nextModalYield(NOT_YIELDED, { modalAberto: false, ativo: proximo, superficie: card })).toBe(NOT_YIELDED)
    const cedeu = nextModalYield(NOT_YIELDED, { modalAberto: true, ativo: proximo, superficie: card })
    // Com o modal ainda aberto, o foco que passou para outro lugar não troca o que foi guardado.
    expect(nextModalYield(cedeu, { modalAberto: true, ativo: terminal, superficie: card })).toBe(cedeu)
  })

  it('retoma quando o modal fecha', () => {
    const cedeu = nextModalYield(NOT_YIELDED, { modalAberto: true, ativo: proximo, superficie: card })
    expect(nextModalYield(cedeu, { modalAberto: false, ativo: body, superficie: card })).toEqual(NOT_YIELDED)
  })

  it('o foco volta ao mesmo botão quando ninguém o pôs em outro lugar', () => {
    expect(resolveFocusAfterModal({ saved: proximo, current: body, surface: card })).toBe(proximo)
    expect(resolveFocusAfterModal({ saved: proximo, current: null, surface: card })).toBe(proximo)
    expect(resolveFocusAfterModal({ saved: card, current: body, surface: card })).toBe(card)
  })

  it('o foco que o diálogo devolveu (ou que a pessoa levou) fica onde está', () => {
    expect(resolveFocusAfterModal({ saved: proximo, current: terminal, surface: card })).toBeNull()
    expect(resolveFocusAfterModal({ saved: proximo, current: focusNode('BUTTON'), surface: card })).toBeNull()
  })

  it('controle que saiu do card → o próprio card; card desmontado → nada', () => {
    const saiu = focusNode('BUTTON', undefined, { isConnected: false })
    expect(resolveFocusAfterModal({ saved: saiu, current: body, surface: card })).toBe(card)
    const outroCard = { ...card, isConnected: false }
    expect(resolveFocusAfterModal({ saved: proximo, current: body, surface: outroCard })).toBeNull()
    expect(resolveFocusAfterModal({ saved: proximo, current: body, surface: null })).toBeNull()
  })

  // No body, o React Flow trata Delete e Backspace como teclas do canvas: com um
  // bloco selecionado, o foco cedido ao body apagava o bloco por baixo do diálogo.
  const espera = focusNode('DIV', '.nokey')

  it('ao ceder, o foco que era do tour vai para o ponto de espera, nunca para o body', () => {
    const cedeu = nextModalYield(NOT_YIELDED, { modalAberto: true, ativo: proximo, superficie: card })
    expect(focusHoldOnYield(cedeu, espera)).toBe(espera)
    const doCard = nextModalYield(NOT_YIELDED, { modalAberto: true, ativo: card, superficie: card })
    expect(focusHoldOnYield(doCard, espera)).toBe(espera)
  })

  it('foco que não era do tour, ou tour que não cedeu, fica onde está', () => {
    const noTerminal = nextModalYield(NOT_YIELDED, { modalAberto: true, ativo: terminal, superficie: card })
    expect(focusHoldOnYield(noTerminal, espera)).toBeNull()
    expect(focusHoldOnYield(NOT_YIELDED, espera)).toBeNull()
  })

  it('o foco que esperou volta ao mesmo botão: a espera não conta como "levado para outro lugar"', () => {
    expect(resolveFocusAfterModal({ saved: proximo, current: espera, surface: card, hold: espera })).toBe(proximo)
    const saiu = focusNode('BUTTON', undefined, { isConnected: false })
    expect(resolveFocusAfterModal({ saved: saiu, current: espera, surface: card, hold: espera })).toBe(card)
  })

  it('saindo da espera (Tab, clique), o foco fica onde a pessoa o levou', () => {
    expect(resolveFocusAfterModal({ saved: proximo, current: terminal, surface: card, hold: espera })).toBeNull()
    expect(resolveFocusAfterModal({ saved: proximo, current: focusNode('BUTTON'), surface: card, hold: espera })).toBeNull()
    // Sem ponto de espera informado, um elemento qualquer continua sendo "levado".
    expect(resolveFocusAfterModal({ saved: proximo, current: espera, surface: card })).toBeNull()
  })
})

describe('menu Ajuda pelo teclado (portal no fim do body)', () => {
  const [iniciar, rever, redefinir] = ['iniciar', 'rever', 'redefinir']
  const focusables = [iniciar, rever, redefinir]
  const key = (overrides: Partial<Parameters<typeof helpMenuKeyAction<string>>[0]>) =>
    helpMenuKeyAction<string>({
      key: 'Tab',
      shiftKey: false,
      defaultPrevented: false,
      inScope: true,
      focusables,
      active: rever,
      ...overrides,
    })

  it('Tab no último controle fecha o menu (o foco volta à Ajuda, não ao topo do app)', () => {
    expect(key({ active: redefinir })).toBe('tab')
  })

  it('Shift+Tab no primeiro controle fecha o menu (não cai no aviso ao lado)', () => {
    expect(key({ active: iniciar, shiftKey: true })).toBe('tab')
  })

  it('entre os controles o Tab e o Shift+Tab seguem normais', () => {
    expect(key({ active: iniciar })).toBeNull()
    expect(key({ active: rever })).toBeNull()
    expect(key({ active: rever, shiftKey: true })).toBeNull()
    expect(key({ active: redefinir, shiftKey: true })).toBeNull()
  })

  it('Esc com o foco no menu ou no botão fecha; fora do escopo, não', () => {
    expect(key({ key: 'Escape' })).toBe('escape')
    expect(key({ key: 'Escape', active: null })).toBe('escape')
    expect(key({ key: 'Escape', inScope: false })).toBeNull()
    expect(key({ active: redefinir, inScope: false })).toBeNull()
  })

  it('tecla já tratada, foco fora dos controles e outras teclas não fecham', () => {
    expect(key({ key: 'Escape', defaultPrevented: true })).toBeNull()
    expect(key({ active: redefinir, defaultPrevented: true })).toBeNull()
    expect(key({ active: 'botao-ajuda' })).toBeNull()
    expect(key({ active: null })).toBeNull()
    expect(key({ key: 'ArrowDown', active: redefinir })).toBeNull()
    expect(key({ key: 'Enter', active: redefinir })).toBeNull()
  })

  it('com um controle só, Tab e Shift+Tab saem do menu', () => {
    expect(key({ focusables: [redefinir], active: redefinir })).toBe('tab')
    expect(key({ focusables: [redefinir], active: redefinir, shiftKey: true })).toBe('tab')
  })
})

describe('hasOpenModal e ancestorCreatesContainingBlock', () => {
  it('detecta diálogo modal pelo [aria-modal="true"]', () => {
    const withModal = { querySelector: (value: string) => (value === '[aria-modal="true"]' ? {} : null) }
    const without = { querySelector: () => null }
    expect(hasOpenModal(withModal)).toBe(true)
    expect(hasOpenModal(without)).toBe(false)
    expect(hasOpenModal(null)).toBe(false)
  })

  type Chain = { parentElement: Chain | null; style: ContainingBlockStyle }
  const chain = (...styles: ContainingBlockStyle[]): Chain => {
    let parent: Chain | null = null
    for (const style of styles.reverse()) parent = { parentElement: parent, style }
    return { parentElement: parent, style: {} }
  }
  const styleOf = (node: Chain) => node.style

  it('sem nada nos ancestrais → falso', () => {
    expect(ancestorCreatesContainingBlock(chain({ transform: 'none' }, { filter: 'none', willChange: 'auto' }), styleOf)).toBe(false)
  })

  it.each<[string, ContainingBlockStyle]>([
    ['transform', { transform: 'matrix(1, 0, 0, 1, 0, 0)' }],
    ['filter', { filter: 'blur(2px)' }],
    ['perspective', { perspective: '800px' }],
    ['contain', { contain: 'paint' }],
    ['isolation', { isolation: 'isolate' }],
    ['will-change', { willChange: 'transform' }],
    ['backdrop-filter', { backdropFilter: 'blur(4px)' }],
  ])('%s num ancestral → verdadeiro', (reason, style) => {
    expect(containingBlockReason(style)).toBe(reason)
    expect(ancestorCreatesContainingBlock(chain({}, style), styleOf)).toBe(true)
  })

  it('will-change de opacidade e contain de tamanho não prendem o fixed', () => {
    expect(containingBlockReason({ willChange: 'opacity', contain: 'size' })).toBeNull()
  })
})

describe('placementFrozen (diálogo modal por cima do tour)', () => {
  it('o fundo de um diálogo modal cobre todos os alvos: sem congelar, o card cairia no reserva', () => {
    // O AgentQuestionDialog tem um fundo `fixed inset-0`: o centro de qualquer alvo cai nele.
    const fundo = fakeNode({ rect: { left: 0, top: 0, width: VIEWPORT.width, height: VIEWPORT.height } })
    const env = createEnv(
      {
        'criar-agente': fakeNode({ rect: rects.agente }),
        'secao-criar': fakeNode({ rect: rects.secao }),
        'rail-menu': fakeNode({ rect: rects.menu }),
      },
      { elementFromPoint: () => fundo },
    )
    expect(resolveStepTarget({ targets: CHAIN }, env)).toMatchObject({ anchor: 'rail-menu', fallback: true })
  })

  it('com o diálogo aberto, o que já está posicionado fica onde está', () => {
    expect(placementFrozen({ modalAberto: true, posicionado: true })).toBe(true)
  })

  it('sem diálogo, o posicionamento segue normal', () => {
    expect(placementFrozen({ modalAberto: false, posicionado: true })).toBe(false)
    expect(placementFrozen({ modalAberto: false, posicionado: false })).toBe(false)
  })

  it('a primeira posição sai mesmo com o diálogo aberto (o card nunca fica sem lugar)', () => {
    expect(placementFrozen({ modalAberto: true, posicionado: false })).toBe(false)
  })
})

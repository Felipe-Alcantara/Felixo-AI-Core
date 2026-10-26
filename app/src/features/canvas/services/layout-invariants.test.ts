import { describe, expect, it } from 'vitest'
import {
  COMBINED_FLOOR_WIDTH,
  DRAWER_MIN_WIDTH,
  INSPECTOR_RESERVED_WIDTH,
  MIN_GUARANTEED_CANVAS_STRIP,
  PANEL_MIN_WIDTH,
  TOOLBAR_WIDTH,
  checkWorstCaseLayout,
  detectLiveLayoutClamp,
  isWorstCaseLayoutSafe,
} from './layout-invariants'
import { canvasSurfaceLayoutWarning, freeCanvasArea, miniMapSize, splitHorizontalSpace } from './canvas-surfaces'

// Bateria de breakpoints a partir de COMBINED_FLOOR_WIDTH (barra 176 + piso
// do painel 260 + piso da gaveta 440 = 876px — corrigido em 12/09/2026: o
// piso da gaveta usado aqui era 300, mas o real em TerminalDrawer.tsx sempre
// foi 440; a divergência escondia uma faixa de canvas espremida bem abaixo
// do piso pretendido mesmo quando "cabia" segundo a conta errada): abaixo
// dele, painel de ferramenta e gaveta do terminal abertos juntos já são uma
// sobreposição intencional por desenho (ver o comentário na constante) — não
// faz sentido testar "seguro" ali. A partir dele, inclui o notebook modesto
// citado em panel-sizing.ts (1366x768) e referências maiores. Se o pior caso
// é seguro nos extremos e no meio, é seguro em qualquer coisa entre eles —
// os componentes reais (clamp, fração, piso) não têm degrau não-monotônico
// entre esses pontos.
const BREAKPOINTS: Array<{ label: string; width: number; height: number }> = [
  { label: 'menor largura sem sobreposição intencional', width: COMBINED_FLOOR_WIDTH, height: 640 },
  { label: 'notebook modesto (relato do painel)', width: 1366, height: 768 },
  { label: 'monitor grande', width: 1920, height: 1080 },
]

describe('pior caso simultâneo (sidebar + painel + gaveta + inspector) nunca sobrepõe', () => {
  for (const { label, width, height } of BREAKPOINTS) {
    it(`fica seguro em ${label} (${width}x${height})`, () => {
      const violations = checkWorstCaseLayout({ width, height })
      expect(violations).toEqual([])
      expect(isWorstCaseLayoutSafe({ width, height })).toBe(true)
    })
  }

  it('viewport menor que qualquer piso ainda devolve violações claras, não lança', () => {
    // Abaixo disto nenhuma combinação de pisos cabe de verdade — a invariante
    // existe pra isso aparecer como violação nomeada, não como exceção nem
    // como sobreposição silenciosa.
    const violations = checkWorstCaseLayout({ width: 200, height: 300 })

    expect(violations.length).toBeGreaterThan(0)
    expect(violations.map((violation) => violation.rule)).toContain(
      'barra+painel+gaveta+inspector-cabem-na-largura',
    )
  })

  it('abaixo do piso combinado, a sobreposição de painel+gaveta é a intencional documentada, não outra', () => {
    // Confirma que, no único intervalo em que o pior caso NÃO é seguro por
    // desenho, a violação é exatamente a esperada (a de largura) — outra
    // regra falhando ali seria um problema novo escondido atrás do já
    // conhecido.
    const violations = checkWorstCaseLayout({ width: COMBINED_FLOOR_WIDTH - 1, height: 768 })

    expect(violations.map((violation) => violation.rule)).toEqual([
      'barra+painel+gaveta+inspector-cabem-na-largura',
    ])
  })
})

// Zoom de página do Electron (`electron/services/window-zoom-shortcuts.cjs`):
// níveis de -3 a +3, fator do Chromium = 1,2^nível. O renderer enxerga a janela
// já em pixels CSS (largura / fator), então o zoom é só um viewport menor ou
// maior; os pixels da janela mudam de significado, as contas não. Medido no app
// real em 1304 px: +3 vira 754×403 e -3 vira 2253×1202.
const NIVEIS_DE_ZOOM = [-3, -2, -1, 0, 1, 2, 3]
const JANELAS = [
  { label: 'janela mínima do app (720×500)', width: 720, height: 500 },
  { label: 'janela padrão (1320×760)', width: 1320, height: 760 },
  { label: 'monitor grande (1920×1080)', width: 1920, height: 1080 },
]
const viewportComZoom = ({ width, height }: { width: number; height: number }, nivel: number) => ({
  width: Math.round(width / 1.2 ** nivel),
  height: Math.round(height / 1.2 ** nivel),
})
const OCUPACAO_NOS_PISOS = {
  toolbar: TOOLBAR_WIDTH,
  panel: PANEL_MIN_WIDTH,
  drawer: DRAWER_MIN_WIDTH,
  inspector: INSPECTOR_RESERVED_WIDTH,
}

describe('zoom de página: o mesmo layout em um viewport menor ou maior', () => {
  it('em qualquer janela e zoom, painel e gaveta ficam em ou acima dos pisos e as contas são finitas', () => {
    for (const janela of JANELAS) {
      for (const nivel of NIVEIS_DE_ZOOM) {
        const viewport = viewportComZoom(janela, nivel)
        const { panel, drawer } = splitHorizontalSpace(
          viewport.width, TOOLBAR_WIDTH, 380, PANEL_MIN_WIDTH, 800, DRAWER_MIN_WIDTH, undefined, INSPECTOR_RESERVED_WIDTH,
        )
        const livre = freeCanvasArea(viewport, { toolbar: TOOLBAR_WIDTH, panel, drawer, inspector: INSPECTOR_RESERVED_WIDTH })
        const minimapa = miniMapSize(livre.width)
        const contexto = `${janela.label}, zoom ${nivel} → ${viewport.width}×${viewport.height}`

        expect(panel, contexto).toBeGreaterThanOrEqual(PANEL_MIN_WIDTH)
        expect(drawer, contexto).toBeGreaterThanOrEqual(DRAWER_MIN_WIDTH)
        expect(Number.isFinite(livre.width), contexto).toBe(true)
        expect(livre.width, contexto).toBeGreaterThanOrEqual(0)
        if (minimapa) expect(minimapa.width, contexto).toBeLessThanOrEqual(livre.width)
        expect(() => checkWorstCaseLayout(viewport), contexto).not.toThrow()
      }
    }
  })

  it('onde os pisos cabem não há violação; onde não cabem, a de largura é a sobreposição intencional', () => {
    for (const janela of JANELAS) {
      for (const nivel of NIVEIS_DE_ZOOM) {
        const viewport = viewportComZoom(janela, nivel)
        const regras = checkWorstCaseLayout(viewport).map((violacao) => violacao.rule)
        const contexto = `${janela.label}, zoom ${nivel} → ${viewport.width}×${viewport.height}`

        if (viewport.width >= COMBINED_FLOOR_WIDTH && viewport.height >= 440) expect(regras, contexto).toEqual([])
        if (viewport.width < COMBINED_FLOOR_WIDTH) {
          expect(regras, contexto).toContain('barra+painel+gaveta+inspector-cabem-na-largura')
        }
      }
    }
  })

  it('o aviso de pouco espaço liga exatamente quando os pisos deixam de caber', () => {
    const limite = COMBINED_FLOOR_WIDTH + MIN_GUARANTEED_CANVAS_STRIP

    expect(canvasSurfaceLayoutWarning({ width: limite, height: 800 }, OCUPACAO_NOS_PISOS)).toBeNull()
    expect(canvasSurfaceLayoutWarning({ width: limite - 1, height: 800 }, OCUPACAO_NOS_PISOS)).toMatch(/horizontal/)
  })

  it('mais zoom nunca desliga o aviso: depois que aparece, fica até o zoom voltar', () => {
    for (const janela of JANELAS) {
      let avisou = false
      for (const nivel of NIVEIS_DE_ZOOM) {
        const aviso = canvasSurfaceLayoutWarning(viewportComZoom(janela, nivel), OCUPACAO_NOS_PISOS)
        if (avisou) expect(aviso, `${janela.label}, zoom ${nivel}`).not.toBeNull()
        if (aviso) avisou = true
      }
    }
  })

  it('zoom máximo na janela mínima: avisa e segura os pisos, sem NaN (417×289 CSS px)', () => {
    const viewport = viewportComZoom(JANELAS[0], 3)
    const { panel, drawer } = splitHorizontalSpace(
      viewport.width, TOOLBAR_WIDTH, 380, PANEL_MIN_WIDTH, 800, DRAWER_MIN_WIDTH, undefined, INSPECTOR_RESERVED_WIDTH,
    )

    expect(viewport).toEqual({ width: 417, height: 289 })
    expect({ panel, drawer }).toEqual({ panel: PANEL_MIN_WIDTH, drawer: DRAWER_MIN_WIDTH })
    expect(canvasSurfaceLayoutWarning(viewport, { toolbar: TOOLBAR_WIDTH, panel, drawer, inspector: INSPECTOR_RESERVED_WIDTH })).toMatch(
      /Pouco espa/,
    )
  })
})

describe('diagnóstico do estado ao vivo (detectLiveLayoutClamp)', () => {
  it('painel sozinho, folgado, nunca é clamp', () => {
    expect(
      detectLiveLayoutClamp({
        viewport: { width: 1366, height: 768 },
        occupancy: { toolbar: 288, panel: 300, drawer: 0, inspector: 288 },
      }),
    ).toBeNull()
  })

  it('painel e gaveta abertos de verdade, sem caber, é clamp real', () => {
    const clamp = detectLiveLayoutClamp({
      viewport: { width: 700, height: 768 },
      occupancy: { toolbar: 288, panel: 260, drawer: 300, inspector: 0 },
    })

    expect(clamp?.rule).toBe('painel+gaveta-espremem-a-faixa-de-canvas')
  })

  it('gaveta sozinha (sem painel), mesmo apertada, não é o clamp de painel+gaveta', () => {
    // Só a gaveta ocupando quase tudo não é o cenário "os dois disputando":
    // não há painel pra disputar espaço.
    expect(
      detectLiveLayoutClamp({
        viewport: { width: 400, height: 768 },
        occupancy: { toolbar: 288, panel: 0, drawer: 300, inspector: 0 },
      }),
    ).toBeNull()
  })

  it('painel fechado (largura 0) nunca é clamp, mesmo com inspector expandido', () => {
    expect(
      detectLiveLayoutClamp({
        viewport: { width: 900, height: 500 },
        occupancy: { toolbar: 288, panel: 0, drawer: 0, inspector: 288 },
      }),
    ).toBeNull()
  })

  it('inspector expandido soma na conta de painel+gaveta sobrepostos', () => {
    // Painel e gaveta cabiam sozinhos ao lado da sidebar, mas o inspector
    // expandido é o que faz a soma estourar a tela — mesma regra, mais um
    // ocupante real.
    const semInspector = detectLiveLayoutClamp({
      viewport: { width: 1000, height: 768 },
      occupancy: { toolbar: 288, panel: 260, drawer: 300, inspector: 0 },
    })
    const comInspector = detectLiveLayoutClamp({
      viewport: { width: 1000, height: 768 },
      occupancy: { toolbar: 288, panel: 260, drawer: 300, inspector: 288 },
    })

    expect(semInspector).toBeNull()
    expect(comInspector?.rule).toBe('painel+gaveta-sobrepostos-de-verdade')
  })
})

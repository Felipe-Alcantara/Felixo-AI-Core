import { describe, expect, it } from 'vitest'
import {
  COMBINED_FLOOR_WIDTH,
  checkWorstCaseLayout,
  detectLiveLayoutClamp,
  isWorstCaseLayoutSafe,
} from './layout-invariants'

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
  { label: 'notebook pequeno', width: 1024, height: 640 },
  { label: 'notebook modesto (relato do painel)', width: 1366, height: 768 },
  { label: 'monitor grande', width: 1920, height: 1080 },
]

describe('pior caso simultâneo (barra + painel + gaveta + dock cheio) nunca sobrepõe', () => {
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
      'barra+painel+gaveta-cabem-na-largura',
    )
  })

  it('abaixo do piso combinado, a sobreposição de painel+gaveta é a intencional documentada, não outra', () => {
    // Confirma que, no único intervalo em que o pior caso NÃO é seguro por
    // desenho, a violação é exatamente a esperada (a de largura) — outra
    // regra falhando ali seria um problema novo escondido atrás do já
    // conhecido.
    const violations = checkWorstCaseLayout({ width: COMBINED_FLOOR_WIDTH - 1, height: 768 })

    expect(violations.map((violation) => violation.rule)).toEqual([
      'barra+painel+gaveta-cabem-na-largura',
    ])
  })
})

describe('diagnóstico do estado ao vivo (detectLiveLayoutClamp)', () => {
  it('painel sozinho, folgado, nunca é clamp', () => {
    expect(
      detectLiveLayoutClamp({
        viewport: { width: 1366, height: 768 },
        occupancy: { toolbar: 176, panel: 300, drawer: 0 },
        dockTop: Number.POSITIVE_INFINITY,
      }),
    ).toBeNull()
  })

  it('painel e gaveta abertos de verdade, sem caber, é clamp real', () => {
    const clamp = detectLiveLayoutClamp({
      viewport: { width: 700, height: 768 },
      occupancy: { toolbar: 176, panel: 260, drawer: 300 },
      dockTop: Number.POSITIVE_INFINITY,
    })

    expect(clamp?.rule).toBe('painel+gaveta-espremem-a-faixa-de-canvas')
  })

  it('gaveta sozinha (sem painel), mesmo apertada, não é o clamp de painel+gaveta', () => {
    // Só a gaveta ocupando quase tudo não é o cenário "os dois disputando":
    // não há painel pra disputar espaço.
    expect(
      detectLiveLayoutClamp({
        viewport: { width: 400, height: 768 },
        occupancy: { toolbar: 176, panel: 0, drawer: 300 },
        dockTop: Number.POSITIVE_INFINITY,
      }),
    ).toBeNull()
  })

  it('painel espremido pelo dock (altura), sem gaveta, é clamp real', () => {
    const clamp = detectLiveLayoutClamp({
      viewport: { width: 1366, height: 500 },
      occupancy: { toolbar: 176, panel: 300, drawer: 0 },
      dockTop: 150, // dock cobrindo quase tudo, painel fica sem altura útil
    })

    expect(clamp?.rule).toBe('painel-esquerdo-espremido-pelo-dock')
  })

  it('sem dock (dockTop infinito), painel nunca é espremido por ele', () => {
    expect(
      detectLiveLayoutClamp({
        viewport: { width: 1366, height: 500 },
        occupancy: { toolbar: 176, panel: 300, drawer: 0 },
        dockTop: Number.POSITIVE_INFINITY,
      }),
    ).toBeNull()
  })

  it('painel fechado (largura 0) nunca é clamp, mesmo com dock baixo', () => {
    expect(
      detectLiveLayoutClamp({
        viewport: { width: 1366, height: 500 },
        occupancy: { toolbar: 176, panel: 0, drawer: 0 },
        dockTop: 150,
      }),
    ).toBeNull()
  })
})

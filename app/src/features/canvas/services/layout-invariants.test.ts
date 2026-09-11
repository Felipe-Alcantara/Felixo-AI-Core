import { describe, expect, it } from 'vitest'
import {
  COMBINED_FLOOR_WIDTH,
  checkWorstCaseLayout,
  isWorstCaseLayoutSafe,
} from './layout-invariants'

// Bateria de breakpoints a partir de COMBINED_FLOOR_WIDTH (736px): abaixo
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

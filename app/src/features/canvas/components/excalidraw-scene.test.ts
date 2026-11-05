import { describe, expect, it } from 'vitest'
import type { ExcalidrawScene } from './ExcalidrawCanvas'
import { sceneToPersist } from './excalidraw-scene'

const retangulo = { id: 'a', type: 'rectangle', x: 10, y: 20, version: 3, versionNonce: 99, updated: 1_000 }

/** Uma cena com `n` elementos mínimos (o resto do formato do Excalidraw não importa aqui). */
function scene(n: number, viewBackgroundColor = '#ffffff'): ExcalidrawScene {
  return {
    elements: Array.from({ length: n }, (_, i) => ({ ...retangulo, id: `e${i}` })) as unknown as ExcalidrawScene['elements'],
    appState: { viewBackgroundColor },
  }
}

describe('cena do bloco Excalidraw', () => {
  it('cena vazia sobre bloco vazio (novo ou já gravado como vazio) não grava', () => {
    expect(sceneToPersist(scene(0), '')).toBeNull()
    // Bloco recém-criado: o campo ainda nem existe.
    expect(sceneToPersist(scene(0), undefined)).toBeNull()
  })

  it('a mesma cena que já está gravada não grava de novo (o ciclo do onChange sem edição)', () => {
    const gravada = JSON.stringify(scene(2))
    expect(sceneToPersist(scene(2), gravada)).toBeNull()
  })

  it('uma edição de verdade grava o texto novo', () => {
    const gravada = JSON.stringify(scene(1))
    expect(sceneToPersist(scene(2), gravada)).toBe(JSON.stringify(scene(2)))
    // Primeiro desenho num bloco vazio.
    expect(sceneToPersist(scene(1), '')).toBe(JSON.stringify(scene(1)))
    expect(sceneToPersist(scene(1), undefined)).toBe(JSON.stringify(scene(1)))
  })

  it('apagar tudo grava a cena vazia (senão o desenho apagado voltaria na próxima abertura)', () => {
    expect(sceneToPersist(scene(0), JSON.stringify(scene(3)))).toBe('')
  })

  it('mexer só na cor de fundo também é uma edição', () => {
    const gravada = JSON.stringify(scene(1, '#ffffff'))
    expect(sceneToPersist(scene(1, '#ffeb99'), gravada)).toBe(JSON.stringify(scene(1, '#ffeb99')))
  })

  it('mover um elemento (a versão e o carimbo mudam) é uma edição, e a mesma versão não é', () => {
    const gravada = JSON.stringify(scene(1))
    const movida = scene(1)
    ;(movida.elements as unknown as { x: number; version: number; updated: number }[])[0] = {
      ...(movida.elements[0] as unknown as { x: number; version: number; updated: number }),
      x: 50,
      version: 4,
      updated: 2_000,
    }
    expect(sceneToPersist(movida, gravada)).toBe(JSON.stringify(movida))
    expect(sceneToPersist(scene(1), gravada)).toBeNull()
  })
})

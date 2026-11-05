import type { ExcalidrawScene } from './ExcalidrawCanvas'

/**
 * O que o bloco Excalidraw grava de uma cena, ou `null` quando ela é igual à
 * que já está gravada.
 *
 * O `onChange` do Excalidraw dispara a cada atualização do componente, não só a
 * cada edição: gravar a cena incondicionalmente fechava um ciclo (grava, o
 * estado do canvas muda, o bloco renderiza de novo, o `onChange` dispara) que
 * rodava cerca de uma vez por segundo com o canvas parado, sempre com a mesma
 * cena e só o `updatedAt` novo (task 3e891f95-497e-815b-b675-d1d696a7968e).
 *
 * A comparação é pelo texto exato que seria gravado: sem elementos a cena
 * vale `''`, e `saved` indefinido (bloco novo) também.
 */
export function sceneToPersist(scene: ExcalidrawScene, saved: string | undefined): string | null {
  const next = scene.elements.length ? JSON.stringify(scene) : ''
  return next === (saved ?? '') ? null : next
}

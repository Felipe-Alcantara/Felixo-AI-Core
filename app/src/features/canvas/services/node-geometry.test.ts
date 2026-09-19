import { describe, expect, it } from 'vitest'
import type { Node } from '@xyflow/react'
import type { CanvasNodeType } from '../types'
import {
  DEFAULT_SIZE,
  NODE_MIN_SIZE,
  findFreeNodePosition,
  findFreeNodePositionNearNode,
  findFreeNodePositions,
  getDefaultNodeSize,
} from './node-geometry'

const SIZE = { width: 100, height: 100 }

describe('findFreeNodePositions', () => {
  it('returns an empty list for count 0', () => {
    expect(findFreeNodePositions([], 0, SIZE)).toEqual([])
  })

  it('matches findFreeNodePosition for a single node', () => {
    const nodes: Node[] = [
      { id: 'a', type: 'terminal', position: { x: 0, y: 0 }, width: 100, height: 100, data: {} },
    ]
    expect(findFreeNodePositions(nodes, 1, SIZE)).toEqual([findFreeNodePosition(nodes, SIZE)])
  })

  it('places four terminals as a 2 by 2 matrix', () => {
    expect(findFreeNodePositions([], 4, SIZE)).toEqual([
      { x: 120, y: 120 },
      { x: 252, y: 120 },
      { x: 120, y: 252 },
      { x: 252, y: 252 },
    ])
  })

  it('grows the matrix by columns and rows instead of one long line', () => {
    expect(findFreeNodePositions([], 5, SIZE)).toEqual([
      { x: 120, y: 120 },
      { x: 252, y: 120 },
      { x: 384, y: 120 },
      { x: 120, y: 252 },
      { x: 252, y: 252 },
    ])
  })

  it('prioritizes a matrix that fits entirely in the visible canvas', () => {
    expect(
      findFreeNodePositions([], 4, SIZE, { x: 0, y: 0, width: 400, height: 400 }),
    ).toEqual([
      { x: 40, y: 88 },
      { x: 172, y: 88 },
      { x: 40, y: 220 },
      { x: 172, y: 220 },
    ])
  })

  it('moves the complete matrix past blocks that already exist on the canvas', () => {
    const existing: Node[] = [
      { id: 'a', type: 'terminal', position: { x: 120, y: 120 }, width: 100, height: 100, data: {} },
    ]

    expect(findFreeNodePositions(existing, 4, SIZE)).toEqual([
      { x: 252, y: 120 },
      { x: 384, y: 120 },
      { x: 252, y: 252 },
      { x: 384, y: 252 },
    ])
  })
})

describe('findFreeNodePositionNearNode', () => {
  it('places the new block beside its terminal when that space is free', () => {
    const terminal: Node = {
      id: 'terminal-1',
      type: 'terminal',
      position: { x: 120, y: 120 },
      width: 100,
      height: 100,
      data: {},
    }

    expect(findFreeNodePositionNearNode([terminal], terminal.id, SIZE)).toEqual({
      x: 252,
      y: 120,
    })
  })

  it('tries another side when the first neighboring position is occupied', () => {
    const terminal: Node = {
      id: 'terminal-1',
      type: 'terminal',
      position: { x: 120, y: 120 },
      width: 100,
      height: 100,
      data: {},
    }
    const right: Node = {
      id: 'right',
      type: 'note',
      position: { x: 252, y: 120 },
      width: 100,
      height: 100,
      data: {},
    }

    expect(findFreeNodePositionNearNode([terminal, right], terminal.id, SIZE)).toEqual({
      x: -12,
      y: 120,
    })
  })
})

describe('tamanho padrão × mínimo de cada bloco', () => {
  // Larguras de janela: de um celular deitado ao monitor grande.
  const LARGURAS = [320, 480, 800, 1024, 1280, 1366, 1600, 1920, 2560, 3840]
  const TIPOS = Object.keys(DEFAULT_SIZE) as CanvasNodeType[]

  it('nenhum bloco nasce menor que o próprio mínimo, em nenhuma largura de janela', () => {
    for (const tipo of TIPOS) {
      for (const largura of LARGURAS) {
        const nasce = getDefaultNodeSize(tipo, largura)
        const minimo = NODE_MIN_SIZE[tipo]
        expect(nasce.width, `${tipo} @${largura}`).toBeGreaterThanOrEqual(minimo.width)
        expect(nasce.height, `${tipo} @${largura}`).toBeGreaterThanOrEqual(minimo.height)
      }
    }
  })

  it('todo tipo de bloco tem um mínimo declarado, e o mínimo cabe no tamanho padrão de tela grande', () => {
    for (const tipo of TIPOS) {
      const minimo = NODE_MIN_SIZE[tipo]
      expect(minimo, tipo).toBeDefined()
      expect(minimo.width).toBeLessThanOrEqual(DEFAULT_SIZE[tipo].width)
      expect(minimo.height).toBeLessThanOrEqual(DEFAULT_SIZE[tipo].height)
    }
  })

  it('o Tarefas Notion cabe numa janela de 800 px (o mínimo antigo, 760×460, cobria quase tudo)', () => {
    expect(NODE_MIN_SIZE.notionTasks.width).toBeLessThanOrEqual(520)
    expect(NODE_MIN_SIZE.notionTasks.height).toBeLessThanOrEqual(360)
  })

  it('em tela grande o tamanho padrão continua o de sempre (o piso só age onde o bloco encolheria demais)', () => {
    expect(getDefaultNodeSize('terminal', 1920)).toEqual(DEFAULT_SIZE.terminal)
    expect(getDefaultNodeSize('notionTasks', 1920)).toEqual(DEFAULT_SIZE.notionTasks)
  })
})

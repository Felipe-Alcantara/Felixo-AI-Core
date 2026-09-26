import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Node } from '@xyflow/react'
import type { CanvasNodeType } from '../types'
import { SIDE_HANDLE_NODE_TYPES, edgeHandlesBetween } from './edge-handle-routing'

function block(id: string, type: CanvasNodeType, x: number, y: number): Node {
  return { id, type, position: { x, y }, width: 200, height: 100, data: {} }
}

describe('edgeHandlesBetween', () => {
  it('roteia pelos lados que se encaram quando os dois blocos têm handles laterais', () => {
    expect(
      edgeHandlesBetween(block('t', 'terminal', 0, 0), block('f', 'file', 400, 0)),
    ).toEqual({ sourceHandle: 's-right', targetHandle: 't-left' })
    expect(
      edgeHandlesBetween(block('f', 'file', 0, 400), block('t', 'terminal', 0, 0)),
    ).toEqual({ sourceHandle: 's-top', targetHandle: 't-bottom' })
  })

  // Regressão: a conexão arquivo→Tarefas Notion era gravada com `t-top`, um
  // handle que o bloco Notion não tem. O React Flow descartava a conexão:
  // contada na barra de status, mas sem desenho e sem como clicar para apagar.
  it('usa o handle único de entrada de um bloco sem handles laterais', () => {
    expect(
      edgeHandlesBetween(block('f', 'file', 0, 0), block('n', 'notionTasks', 0, 400)),
    ).toEqual({ sourceHandle: 's-bottom', targetHandle: null })
  })

  it('usa o handle único de saída de um bloco sem handles laterais', () => {
    expect(
      edgeHandlesBetween(block('n', 'note', 400, 400), block('f', 'file', 400, 0)),
    ).toEqual({ sourceHandle: null, targetHandle: 't-bottom' })
  })

  it('não inventa handle nenhum entre dois blocos sem handles laterais', () => {
    expect(
      edgeHandlesBetween(block('n', 'note', 0, 0), block('d', 'drawing', 400, 0)),
    ).toEqual({ sourceHandle: null, targetHandle: null })
  })
})

describe('SIDE_HANDLE_NODE_TYPES', () => {
  // Um arquivo de componente por tipo de bloco (`nodeTypes` em CanvasView.tsx).
  // O Record obriga a incluir aqui todo tipo novo de bloco.
  const COMPONENT_FILES: Record<CanvasNodeType, string> = {
    terminal: 'TerminalNode.tsx',
    note: 'NoteNode.tsx',
    group: 'GroupNode.tsx',
    file: 'FileNode.tsx',
    webpage: 'WebpageNode.tsx',
    notionTasks: 'NotionTasksNode.tsx',
    drawing: 'DrawingNode.tsx',
    excalidrawDrawing: 'ExcalidrawDrawingNode.tsx',
  }

  // A lista e os componentes andam juntos: um tipo na lista sem os handles
  // `s-`/`t-` desenhados some com as conexões dele; um componente com eles
  // fora da lista perde o roteamento pelo lado mais próximo.
  it.each(Object.entries(COMPONENT_FILES))(
    '%s está na lista se e somente se o componente desenha handles s-/t- com id',
    (type, file) => {
      const source = readFileSync(new URL(`../components/${file}`, import.meta.url), 'utf8')
      const drawsSideHandles = source.includes('id={`s-${') && source.includes('id={`t-${')
      expect(drawsSideHandles).toBe(SIDE_HANDLE_NODE_TYPES.has(type))
    },
  )
})

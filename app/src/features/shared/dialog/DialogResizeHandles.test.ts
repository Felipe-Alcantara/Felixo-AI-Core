import { describe, expect, it, vi } from 'vitest'
import { DialogResizeHandles } from './DialogResizeHandles'
import type { ResizableDialog } from './useResizableDialog'
import { acharTodos } from '../test-support/react-tree'

function montar() {
  const dialog = {
    frameProps: { ref: () => {} },
    resizing: false,
    startResize: vi.fn(),
    resizeBy: vi.fn(),
    reset: vi.fn(),
  } as unknown as ResizableDialog<HTMLDivElement>
  const arvore = DialogResizeHandles({ dialog })
  const alca = (nome: string) => acharTodos(arvore, (e) => e.props['data-felixo-dialog-handle'] === nome)[0]
  const tecla = (nome: string, key: string) => {
    const preventDefault = vi.fn()
    alca(nome).props.onKeyDown({ key, preventDefault })
    return preventDefault
  }
  return { dialog, alca, tecla }
}

describe('DialogResizeHandles (teclado e mouse)', () => {
  it('são três alças focáveis: direita, de baixo e o canto', () => {
    const { alca } = montar()
    for (const nome of ['right', 'bottom', 'corner']) {
      expect(alca(nome).props.role).toBe('separator')
      expect(alca(nome).props.tabIndex).toBe(0)
    }
  })

  it('a alça direita ajusta só a largura: → alarga e ← estreita, ↑↓ não fazem nada', () => {
    const { dialog, tecla } = montar()
    tecla('right', 'ArrowRight')
    tecla('right', 'ArrowLeft')
    tecla('right', 'ArrowDown')
    const eixos = { horizontal: true, vertical: false }
    expect(dialog.resizeBy).toHaveBeenNthCalledWith(1, { dx: 24, dy: 0 }, eixos)
    expect(dialog.resizeBy).toHaveBeenNthCalledWith(2, { dx: -24, dy: 0 }, eixos)
    // ↓ não muda a largura: a chamada leva dx = 0 e dy = 0 (o eixo vertical está desligado).
    expect(dialog.resizeBy).toHaveBeenNthCalledWith(3, { dx: 0, dy: 0 }, eixos)
  })

  it('a alça de baixo ajusta só a altura', () => {
    const { dialog, tecla } = montar()
    tecla('bottom', 'ArrowDown')
    tecla('bottom', 'ArrowUp')
    const eixos = { horizontal: false, vertical: true }
    expect(dialog.resizeBy).toHaveBeenNthCalledWith(1, { dx: 0, dy: 24 }, eixos)
    expect(dialog.resizeBy).toHaveBeenNthCalledWith(2, { dx: 0, dy: -24 }, eixos)
  })

  it('o canto ajusta os dois eixos', () => {
    const { dialog, tecla } = montar()
    tecla('corner', 'ArrowRight')
    tecla('corner', 'ArrowDown')
    const eixos = { horizontal: true, vertical: true }
    expect(dialog.resizeBy).toHaveBeenNthCalledWith(1, { dx: 24, dy: 0 }, eixos)
    expect(dialog.resizeBy).toHaveBeenNthCalledWith(2, { dx: 0, dy: 24 }, eixos)
  })

  it('Home e Enter voltam ao tamanho original, e o duplo clique também', () => {
    const { dialog, alca, tecla } = montar()
    const homeEvitou = tecla('corner', 'Home')
    tecla('right', 'Enter')
    alca('bottom').props.onDoubleClick()
    expect(dialog.reset).toHaveBeenCalledTimes(3)
    expect(homeEvitou).toHaveBeenCalled()
    expect(dialog.resizeBy).not.toHaveBeenCalled()
  })

  it('outras teclas passam: Tab segue o foco e nada é redimensionado', () => {
    const { dialog, tecla } = montar()
    const evitou = tecla('right', 'Tab')
    expect(evitou).not.toHaveBeenCalled()
    expect(dialog.resizeBy).not.toHaveBeenCalled()
    expect(dialog.reset).not.toHaveBeenCalled()
  })

  it('o arrasto com o mouse começa no eixo da alça', () => {
    const { dialog, alca } = montar()
    const evento = { clientX: 10 }
    alca('bottom').props.onMouseDown(evento)
    expect(dialog.startResize).toHaveBeenCalledWith(evento, { horizontal: false, vertical: true })
  })

  it('clicar numa alça não fecha o modal (o clique não sobe)', () => {
    const { alca } = montar()
    const stopPropagation = vi.fn()
    alca('right').props.onClick({ stopPropagation })
    expect(stopPropagation).toHaveBeenCalled()
  })
})

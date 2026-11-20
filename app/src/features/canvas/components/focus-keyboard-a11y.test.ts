import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { proximoItemDoMenu } from '../services/menu-keyboard'
import { OnboardingErrorBoundary } from '../../onboarding/OnboardingErrorBoundary'

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

describe('foco, teclado e nomes acessíveis do canvas', () => {
  it('Presets de agente fecha por closeActiveTool, que devolve o foco ao botão que o abriu', () => {
    const code = source('./CanvasToolPanels.tsx')
    expect(code).toContain('<LazyAgentPresetsPanel onClose={closeActiveTool}')
    // Nenhum painel recebe o onClose cru do host (o foco cairia no body, onde Delete/Backspace são do canvas).
    expect(code.match(/<Lazy\w+Panel[^>]*\bonClose=\{onClose\}/g)).toBeNull()
  })

  it('o botão Desligar do bloco Arquivo aparece com o foco do teclado', () => {
    expect(source('./FileNode.tsx')).toContain('opacity-0 hover:bg-black/20 hover:text-theme-error focus-visible:opacity-100')
  })

  it('Editar e Excluir visualização (Notion) aparecem pelo foco, não só pelo hover', () => {
    const code = source('./tools/NotionTasksPanel.tsx')
    expect(code).toContain('hidden items-center gap-0.5 group-focus-within:flex group-hover:flex')
    expect(code).toContain('focus-visible:opacity-100 group-hover:opacity-100" href={task.url}')
  })

  it('a sidebar expandida não tem dois botões com o mesmo nome (a marca ganhou um nome próprio)', () => {
    const code = source('./CanvasToolbar.tsx')
    expect(code).toContain('aria-label="Recolher coluna do canvas"')
    expect(code.match(/aria-label="Recolher sidebar"/g)).toBeNull()
    expect(code).toContain("'Recolher sidebar'") // o do trilho, o único com esse nome
  })

  it('a árvore do Git tem itens: treeitem com nível, e aria-selected no arquivo', () => {
    const code = source('./tools/GitExplorer.tsx')
    expect(code.match(/role="treeitem"/g)).toHaveLength(2)
    expect(code.match(/aria-level=\{depth \+ 1\}/g)).toHaveLength(2)
    expect(code).toContain('aria-selected={selectedPath === node.path}')
  })

  it('o menu de cor leva o foco para dentro, anda por setas, devolve o foco e fecha com a roda', () => {
    const code = source('./NodeColorMenu.tsx')
    expect(code).toContain('onKeyDown={aoTeclar}')
    expect(code).toMatch(/\.focus\(\)/)
    expect(code).toContain("window.addEventListener('wheel'")
    expect(code).toContain('anterior.focus()')
  })
})

describe('percurso por setas de um menu', () => {
  it('anda com as quatro setas e dá a volta nas pontas', () => {
    expect(proximoItemDoMenu('ArrowRight', 0, 3)).toBe(1)
    expect(proximoItemDoMenu('ArrowDown', 2, 3)).toBe(0)
    expect(proximoItemDoMenu('ArrowLeft', 0, 3)).toBe(2)
    expect(proximoItemDoMenu('ArrowUp', 1, 3)).toBe(0)
  })

  it('Home e End vão às pontas; outra tecla ou menu vazio não navegam', () => {
    expect(proximoItemDoMenu('Home', 2, 5)).toBe(0)
    expect(proximoItemDoMenu('End', 0, 5)).toBe(4)
    expect(proximoItemDoMenu('a', 0, 5)).toBeNull()
    expect(proximoItemDoMenu('ArrowDown', 0, 0)).toBeNull()
  })

  it('sem item focado (índice -1), a seta para a frente cai no primeiro e a para trás no último', () => {
    expect(proximoItemDoMenu('ArrowRight', -1, 4)).toBe(0)
    expect(proximoItemDoMenu('ArrowLeft', -1, 4)).toBe(2) // (-1 - 1 + 4) % 4: o foco entra pelo fim
  })
})

describe('menu Ajuda: falha de render', () => {
  it('o boundary avisa quem abriu o menu, para fechar o estado em vez de deixar aria-expanded sem menu', () => {
    const onFailure = vi.fn()
    const reportFailure = vi.fn()
    const boundary = new OnboardingErrorBoundary({
      store: { reportFailure },
      resetKey: 1,
      onFailure,
      children: null,
    })
    boundary.componentDidCatch(new Error('menu quebrou'), { componentStack: 'at Menu' })
    expect(reportFailure).toHaveBeenCalledTimes(1)
    expect(onFailure).toHaveBeenCalledTimes(1)
  })

  it('a barra liga o fechamento ao boundary', () => {
    expect(source('./CanvasToolbar.tsx')).toContain("onFailure={() => help.close('fora')}")
  })
})

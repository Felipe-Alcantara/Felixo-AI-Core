// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({
  store: {
    restart: vi.fn(),
    getTranscript: vi.fn(() => ({ text: 'historico', screenOnly: false })),
    getShellHistory: vi.fn(() => ({ text: '' })),
    fit: vi.fn(),
    moveTo: vi.fn<(id: string, container: HTMLElement) => boolean>(() => true),
    focus: vi.fn(),
    copy: vi.fn(async () => ''),
    scrollClaude: vi.fn(),
  },
  snapshot: { activity: 'idle', generation: 1 } as Record<string, unknown>,
  reportDrawerWidth: vi.fn(),
}))

// Sessão, superfícies e xterm vivem em outros arquivos: o teste olha só os controles da gaveta.
vi.mock('../terminal/terminal-session-context', () => ({
  useTerminalSessions: () => estado.store,
  useSessionSnapshot: () => estado.snapshot,
}))
vi.mock('../hooks/canvas-surfaces-context', () => ({
  useCanvasSurfaces: () => ({ occupancy: { panel: 0, drawer: 480, toolbar: 288, inspector: 0 }, reportDrawerWidth: estado.reportDrawerWidth, viewport: { width: 1280, height: 800 } }),
}))
vi.mock('./terminal-fit-lifecycle', () => ({ attachTerminalFitLifecycle: () => () => {} }))
vi.mock('../hooks/useClaudeScrollRail', () => ({ useClaudeScrollRail: () => ({ scrolledUp: false }) }))
vi.mock('./TerminalArchivePanel', () => ({
  TerminalArchivePanel: ({ ptySessionId, onClose }: { ptySessionId: string; onClose: () => void }) => (
    <div role="region" aria-label="Histórico arquivado do terminal" data-pty={ptySessionId}>
      <button type="button" onClick={onClose}>Voltar ao terminal</button>
    </div>
  ),
}))

import { TerminalDrawer, type TerminalDrawerPane } from './TerminalDrawer'
import { presetMosaic } from './terminal-mosaic'
import { instalarLocalStorageEmMemoria } from '../../shared/test-support/jsdom-storage'
import { instalarShimsDeLayout } from '../../shared/test-support/jsdom-shims'

instalarShimsDeLayout()

function painel(extra: Partial<TerminalDrawerPane> = {}): TerminalDrawerPane {
  return { sessionId: 'no-1', title: 'Agente', ...extra }
}

function montar(pane: TerminalDrawerPane = painel()) {
  const props = {
    onFocusPane: vi.fn(),
    onClosePane: vi.fn(),
    onLayoutChange: vi.fn(),
    onToggleZoom: vi.fn(),
    onClose: vi.fn(),
  }
  render(<TerminalDrawer panes={[pane]} focusedId={pane.sessionId} layout="colunas" zoomed={false} {...props} />)
  return props
}

async function clicar(nome: string | RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: nome }))
  })
  await act(async () => {
    await Promise.resolve()
  })
}

describe('TerminalDrawer (controles)', () => {
  let storage: Storage
  beforeEach(() => {
    storage = instalarLocalStorageEmMemoria()
    Object.values(estado.store).forEach((fn) => fn.mockClear())
    estado.reportDrawerWidth.mockClear()
  })
  afterEach(() => cleanup())

  describe('Abrir em outra janela', () => {
    function janelaFalsa() {
      class Observador {
        observe() {}
        disconnect() {}
      }
      const ouvintes = new Map<string, Set<() => void>>()
      return {
        document: document.implementation.createHTMLDocument('aux'),
        requestAnimationFrame: () => 1,
        cancelAnimationFrame: () => {},
        ResizeObserver: Observador,
        close: vi.fn(),
        addEventListener: (nome: string, fn: () => void) => {
          if (!ouvintes.has(nome)) ouvintes.set(nome, new Set())
          ouvintes.get(nome)?.add(fn)
        },
        removeEventListener: (nome: string, fn: () => void) => ouvintes.get(nome)?.delete(fn),
        emitir: (nome: string) => ouvintes.get(nome)?.forEach((fn) => fn()),
      }
    }

    afterEach(() => vi.restoreAllMocks())

    it('destaca o terminal: avisa no painel, e Trazer de volta devolve o xterm e fecha a janela', async () => {
      const janela = janelaFalsa()
      const abrir = vi.spyOn(window, 'open').mockReturnValue(janela as unknown as Window)
      montar()

      await clicar('Abrir o terminal em outra janela')

      expect(abrir).toHaveBeenCalledWith('about:blank', 'felixo-aux-t-no-1')
      expect(screen.getByText('Este terminal está em outra janela.')).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Abrir o terminal em outra janela' })).toBeNull()

      await clicar('Trazer de volta')

      // Ida (para a janela) e volta (para o painel, no documento principal), nessa ordem.
      expect(estado.store.moveTo).toHaveBeenCalledTimes(2)
      expect(estado.store.moveTo.mock.calls[0][1].ownerDocument).toBe(janela.document)
      expect(estado.store.moveTo.mock.calls[1][1].ownerDocument).toBe(document)
      expect(janela.close).toHaveBeenCalledTimes(1)
      expect(screen.queryByText('Este terminal está em outra janela.')).toBeNull()
      expect(screen.getByRole('button', { name: 'Abrir o terminal em outra janela' })).toBeTruthy()
    })

    it('fechar a janela pelo X devolve o terminal ao painel sozinho', async () => {
      const janela = janelaFalsa()
      vi.spyOn(window, 'open').mockReturnValue(janela as unknown as Window)
      montar()
      await clicar('Abrir o terminal em outra janela')

      await act(async () => {
        janela.emitir('pagehide')
      })

      expect(estado.store.moveTo).toHaveBeenCalledWith('no-1', expect.any(HTMLElement))
      expect(screen.queryByText('Este terminal está em outra janela.')).toBeNull()
    })

    it('picture-in-picture abre a janela pip-<sessão> e o botão do cabeçalho vira Trazer de volta', async () => {
      const janela = janelaFalsa()
      const abrir = vi.spyOn(window, 'open').mockReturnValue(janela as unknown as Window)
      montar()

      await clicar('Abrir o terminal em picture-in-picture')

      expect(abrir).toHaveBeenCalledWith('about:blank', 'felixo-aux-pip-no-1')
      expect(screen.getByText('Este terminal está em picture-in-picture.')).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Abrir o terminal em picture-in-picture' })).toBeNull()

      await clicar('Trazer o terminal de volta')

      expect(janela.close).toHaveBeenCalledTimes(1)
      expect(screen.getByRole('button', { name: 'Abrir o terminal em picture-in-picture' })).toBeTruthy()
    })

    it('janela negada pelo sistema: o terminal fica no painel', async () => {
      vi.spyOn(window, 'open').mockReturnValue(null)
      montar()

      await clicar('Abrir o terminal em outra janela')

      expect(screen.queryByText('Este terminal está em outra janela.')).toBeNull()
      expect(estado.store.moveTo).not.toHaveBeenCalled()
    })

    it('fechar o painel com a janela aberta não deixa a janela órfã', async () => {
      const janela = janelaFalsa()
      vi.spyOn(window, 'open').mockReturnValue(janela as unknown as Window)
      montar()
      await clicar('Abrir o terminal em outra janela')

      cleanup()

      expect(janela.close).toHaveBeenCalledTimes(1)
      // Só o `moveTo` de ida (para a janela): desmontou, então não há volta para um painel que já não existe.
      expect(estado.store.moveTo).toHaveBeenCalledTimes(1)
      expect(estado.store.moveTo.mock.calls[0][1].ownerDocument).toBe(janela.document)
    })
  })

  describe('Mosaico', () => {
    function montarMosaico(ids: string[], preset: 'colunas' | 'grade' = 'colunas', extra: Record<string, unknown> = {}) {
      const props = {
        onFocusPane: vi.fn(),
        onClosePane: vi.fn(),
        onLayoutChange: vi.fn(),
        onToggleZoom: vi.fn(),
        onClose: vi.fn(),
        onResizeSplit: vi.fn(),
        onAddPane: vi.fn(),
        ...extra,
      }
      render(
        <TerminalDrawer
          panes={ids.map((id) => painel({ sessionId: id, title: `Agente ${id}` }))}
          tree={presetMosaic(ids, preset)!}
          focusedId={ids[0]}
          layout={preset}
          zoomed={false}
          addablePanes={[{ id: 'z', title: 'Agente z' }, { id: 'y', title: 'Agente y' }]}
          {...props}
        />,
      )
      return props
    }
    const caixa = (id: string) => (document.querySelector(`[data-felixo-mosaic-pane="${id}"]`) as HTMLElement).style

    it('cada agente ocupa o seu retângulo do mosaico, em porcentagem, sem célula vazia', () => {
      montarMosaico(['a', 'b'], 'colunas')
      expect(caixa('a')).toMatchObject({ left: '0%', top: '0%', width: '50%', height: '100%' })
      expect(caixa('b')).toMatchObject({ left: '50%', top: '0%', width: '50%', height: '100%' })
      cleanup()

      montarMosaico(['a', 'b', 'c'], 'grade')
      // Grade com 3: dois em cima e o terceiro na linha de baixo inteira.
      expect(caixa('a')).toMatchObject({ width: '50%', height: '50%' })
      expect(caixa('c')).toMatchObject({ left: '0%', top: '50%', width: '100%', height: '50%' })
    })

    it('a divisória tem nome e o teclado grava a nova proporção (5%, Shift 15%, Home ao meio)', () => {
      const props = montarMosaico(['a', 'b'])
      const divisoria = screen.getByRole('separator', { name: 'Redimensionar entre Agente a e Agente b' })
      expect(divisoria.getAttribute('aria-valuenow')).toBe('50')

      fireEvent.keyDown(divisoria, { key: 'ArrowRight' })
      expect(props.onResizeSplit).toHaveBeenLastCalledWith('', 0.55)
      fireEvent.keyDown(divisoria, { key: 'ArrowLeft', shiftKey: true })
      expect(props.onResizeSplit.mock.lastCall?.[1]).toBeCloseTo(0.35)
      fireEvent.keyDown(divisoria, { key: 'Home' })
      expect(props.onResizeSplit).toHaveBeenLastCalledWith('', 0.5)
      // A seta da outra direção não é desta divisória (lado a lado: só esquerda e direita).
      props.onResizeSplit.mockClear()
      fireEvent.keyDown(divisoria, { key: 'ArrowDown' })
      expect(props.onResizeSplit).not.toHaveBeenCalled()
    })

    it('o + do painel lista os agentes fora da gaveta e o escolhido divide aquele painel', async () => {
      const props = montarMosaico(['a', 'b'])
      const mais = screen.getAllByRole('button', { name: 'Abrir outro agente ao lado deste' })
      expect(mais).toHaveLength(2)

      await act(async () => {
        fireEvent.click(mais[1])
      })
      const opcoes = screen.getAllByRole('menuitem')
      // Em ordem alfabética.
      expect(opcoes.map((opcao) => opcao.textContent)).toEqual(['Agente y', 'Agente z'])

      await act(async () => {
        fireEvent.click(opcoes[1])
      })
      expect(props.onAddPane).toHaveBeenCalledWith('z', 'b', expect.objectContaining({ x: 0, y: 0 }))
      expect(screen.queryByRole('menu')).toBeNull()
    })

    it('o menu do + fecha com Esc e devolve o foco ao botão', async () => {
      montarMosaico(['a', 'b'])
      const mais = screen.getAllByRole('button', { name: 'Abrir outro agente ao lado deste' })[0]
      await act(async () => {
        fireEvent.click(mais)
      })
      const menu = screen.getByRole('menu', { name: 'Agentes para abrir ao lado' })
      await act(async () => {
        fireEvent.keyDown(menu, { key: 'Escape' })
      })
      expect(screen.queryByRole('menu')).toBeNull()
      expect(document.activeElement).toBe(mais)
    })

    it('estreita demais para o arranjo (painel abaixo do piso): empilha e avisa', () => {
      // A gaveta do teste tem 480 px: três colunas dariam 160 px cada.
      montarMosaico(['a', 'b', 'c'], 'colunas')
      expect(screen.getByText('empilhados: maximize para lado a lado')).toBeTruthy()
      expect(caixa('a')).toMatchObject({ left: '0%', width: '100%' })
      expect(caixa('c')).toMatchObject({ left: '0%', width: '100%' })
      // Empilhado, não há divisória para arrastar (a árvore guardada continua a mesma).
      expect(screen.queryByRole('separator', { name: /Redimensionar entre/ })).toBeNull()
    })

    it('tela cheia cobre a janela; o Esc volta ao tamanho de antes e só o segundo Esc fecha', async () => {
      const props = montarMosaico(['a', 'b'])
      const regiao = document.querySelector('[data-canvas-terminal-drawer]') as HTMLElement

      await clicar('Terminais em tela cheia')
      expect(regiao.classList.contains('felixo-terminal-drawer--fullscreen')).toBe(true)
      expect(screen.getByRole('button', { name: 'Sair da tela cheia' }).getAttribute('aria-pressed')).toBe('true')

      await act(async () => {
        fireEvent.keyDown(regiao, { key: 'Escape' })
      })
      expect(regiao.classList.contains('felixo-terminal-drawer--fullscreen')).toBe(false)
      expect(props.onClose).not.toHaveBeenCalled()
    })
  })

  describe('Recolher e Expandir', () => {
    it('Recolher vira Expandir, recolhe a gaveta e lembra a escolha', async () => {
      montar()
      const botao = screen.getByRole('button', { name: 'Recolher terminal' })
      expect(botao.getAttribute('aria-expanded')).toBe('true')

      await clicar('Recolher terminal')

      expect(screen.getByRole('button', { name: 'Expandir terminal' }).getAttribute('aria-expanded')).toBe('false')
      expect(storage.length).toBeGreaterThan(0)
      // Recolhida, sobra o trilho: Maximizar e Fixar saem.
      expect(screen.queryByRole('button', { name: /Maximizar terminal|Restaurar largura/ })).toBeNull()
      expect(screen.queryByRole('button', { name: /Fixar terminal|Desafixar terminal/ })).toBeNull()
    })

    it('Expandir traz a gaveta de volta com os controles', async () => {
      montar()
      await clicar('Recolher terminal')

      await clicar('Expandir terminal')

      expect(screen.getByRole('button', { name: 'Recolher terminal' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Maximizar terminal' })).toBeTruthy()
    })

    it('a escolha de recolher sobrevive ao fechar e abrir a gaveta', async () => {
      montar()
      await clicar('Recolher terminal')
      cleanup()

      montar()

      expect(screen.getByRole('button', { name: 'Expandir terminal' })).toBeTruthy()
    })
  })

  describe('Maximizar e Restaurar', () => {
    it('Maximizar ocupa a janela quase toda e vira Restaurar largura; clicar de novo desfaz', async () => {
      montar()
      const botao = screen.getByRole('button', { name: 'Maximizar terminal' })
      expect(botao.getAttribute('aria-pressed')).toBe('false')

      await clicar('Maximizar terminal')

      expect(screen.getByRole('button', { name: 'Restaurar largura' }).getAttribute('aria-pressed')).toBe('true')
      expect(estado.reportDrawerWidth).toHaveBeenLastCalledWith(window.innerWidth - 120)

      await clicar('Restaurar largura')

      expect(screen.getByRole('button', { name: 'Maximizar terminal' }).getAttribute('aria-pressed')).toBe('false')
      expect(estado.reportDrawerWidth).toHaveBeenLastCalledWith(expect.any(Number))
      expect(estado.reportDrawerWidth).not.toHaveBeenLastCalledWith(window.innerWidth - 120)
    })

    it('recolher um terminal maximizado tira o maximizado', async () => {
      montar()
      await clicar('Maximizar terminal')

      await clicar('Recolher terminal')
      await clicar('Expandir terminal')

      expect(screen.getByRole('button', { name: 'Maximizar terminal' }).getAttribute('aria-pressed')).toBe('false')
    })
  })

  describe('Histórico arquivado', () => {
    it('abre o painel do arquivo deste terminal por cima, deixa o xterm vivo inerte e marca o botão', async () => {
      montar()
      const botao = screen.getByRole('button', { name: 'Histórico arquivado' })
      expect(botao.getAttribute('aria-pressed')).toBe('false')
      expect(screen.queryByRole('region', { name: 'Histórico arquivado do terminal' })).toBeNull()

      await clicar('Histórico arquivado')

      const regiao = await screen.findByRole('region', { name: 'Histórico arquivado do terminal' })
      expect(regiao.getAttribute('data-pty')).toBe('canvas:no-1')
      expect(screen.getByRole('button', { name: 'Histórico arquivado' }).getAttribute('aria-pressed')).toBe('true')
      expect(document.querySelector('[data-felixo-terminal-mount]')?.hasAttribute('inert')).toBe(true)
    })

    it('clicar no botão de novo fecha o painel', async () => {
      montar()
      await clicar('Histórico arquivado')
      await screen.findByRole('region', { name: 'Histórico arquivado do terminal' })

      await clicar('Histórico arquivado')

      expect(screen.queryByRole('region', { name: 'Histórico arquivado do terminal' })).toBeNull()
      expect(document.querySelector('[data-felixo-terminal-mount]')?.hasAttribute('inert')).toBe(false)
    })

    it('"Voltar ao terminal" fecha o painel e devolve o foco ao terminal vivo', async () => {
      montar()
      await clicar('Histórico arquivado')
      await screen.findByRole('region', { name: 'Histórico arquivado do terminal' })
      estado.store.focus.mockClear()

      await clicar('Voltar ao terminal')

      expect(screen.queryByRole('region', { name: 'Histórico arquivado do terminal' })).toBeNull()
      expect(estado.store.focus).toHaveBeenCalledWith('no-1')
    })

    it('recolhida, a gaveta não mostra o painel do arquivo', async () => {
      montar()
      await clicar('Histórico arquivado')
      await screen.findByRole('region', { name: 'Histórico arquivado do terminal' })

      await clicar('Recolher terminal')

      expect(screen.queryByRole('region', { name: 'Histórico arquivado do terminal' })).toBeNull()
    })
  })

  describe('Ver arquivo em modo renderizado', () => {
    it('só existe quando quem monta a gaveta sabe abrir o bloco de arquivo', () => {
      montar()
      expect(screen.queryByRole('button', { name: 'Ver arquivo em modo renderizado' })).toBeNull()
    })

    it('abre o arquivo que o editor do terminal está editando', async () => {
      const onOpenFilePreview = vi.fn()
      montar(painel({ onOpenFilePreview, restartOptions: { command: 'nano', args: ['notas.md'], cwd: '/tmp/proj' } } as Partial<TerminalDrawerPane>))

      await clicar('Ver arquivo em modo renderizado')

      expect(onOpenFilePreview).toHaveBeenCalledWith('/tmp/proj/notas.md', 'notas.md')
    })

    it('acha o arquivo no histórico do shell quando o editor foi digitado à mão', async () => {
      const onOpenFilePreview = vi.fn()
      estado.store.getShellHistory.mockReturnValue({ text: '$ vim /etc/hosts' })
      montar(painel({ onOpenFilePreview, restartOptions: { cwd: '/tmp' } } as Partial<TerminalDrawerPane>))

      await clicar('Ver arquivo em modo renderizado')

      expect(onOpenFilePreview).toHaveBeenCalledWith('/etc/hosts', 'hosts')
      estado.store.getShellHistory.mockReturnValue({ text: '' })
    })

    it('sem nenhum arquivo aberto no editor, diz isso e não abre nada', async () => {
      const onOpenFilePreview = vi.fn()
      montar(painel({ onOpenFilePreview, restartOptions: { command: 'bash', args: [], cwd: '/tmp' } } as Partial<TerminalDrawerPane>))

      await clicar('Ver arquivo em modo renderizado')

      expect(onOpenFilePreview).not.toHaveBeenCalled()
      expect(screen.getByText('Não achei nenhum arquivo aberto com nano/vim neste terminal.')).toBeTruthy()
    })
  })
})

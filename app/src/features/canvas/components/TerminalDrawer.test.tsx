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
  useCanvasSurfaces: () => ({ occupancy: { panel: 0, drawer: 0, toolbar: 288, inspector: 0 }, reportDrawerWidth: estado.reportDrawerWidth, viewport: { width: 1280, height: 800 } }),
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

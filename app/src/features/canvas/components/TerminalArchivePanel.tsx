import { useCallback, useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import {
  ARCHIVE_VIEW_SCROLLBACK,
  archiveViewHasMore,
  archiveViewText,
  describeArchiveView,
  prependArchivePage,
  readArchivePage,
  type ArchiveView,
} from '../terminal/terminal-output-archive'

type TerminalArchivePanelProps = {
  ptySessionId: string
  onClose: () => void
}

/**
 * Histórico arquivado da gaveta: a saída inteira do terminal, lida do arquivo
 * em disco, num xterm só de leitura por cima do terminal vivo (que segue
 * rodando e recebendo tudo por baixo). Um xterm, e não texto puro, porque a
 * saída é crua: só ele aplica os retornos de carro, as cores e os redesenhos
 * das CLIs do jeito que a pessoa viu.
 */
export function TerminalArchivePanel({ ptySessionId, onClose }: TerminalArchivePanelProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const [view, setView] = useState<ArchiveView | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Depois de "Carregar mais" a pessoa quer ver o trecho que chegou, no topo.
  const scrollToTopRef = useRef(false)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const terminal = new Terminal({
      disableStdin: true,
      cursorBlink: false,
      scrollback: ARCHIVE_VIEW_SCROLLBACK,
      // Limpar a tela (ESC[2J: o ConPTY ao abrir, as TUIs ao redesenhar) manda
      // o que estava nela para o histórico em vez de apagar: aqui é histórico.
      scrollOnEraseInDisplay: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      theme: { background: '#0b0f14' },
      // A saída pode ter vindo de um .fxcanvas importado: link OSC 8 não abre daqui.
      linkHandler: { activate: () => {} },
    })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(mount)
    const fit = () => {
      try {
        fitAddon.fit()
      } catch {
        // Painel sem tamanho (gaveta recolhendo): o próximo resize ajusta.
      }
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(mount)
    terminalRef.current = terminal
    return () => {
      observer.disconnect()
      terminalRef.current = null
      terminal.dispose()
    }
  }, [])

  // A cauda, ao abrir. O estado só muda na resposta, e a resposta de um
  // painel já fechado (ou de outro bloco) é descartada.
  useEffect(() => {
    let cancelled = false
    readArchivePage(ptySessionId).then(
      (read) => {
        if (cancelled) return
        scrollToTopRef.current = false
        setView(prependArchivePage(null, read))
      },
      (loadError: unknown) => {
        if (!cancelled) setError(readErrorMessage(loadError))
      },
    )
    return () => {
      cancelled = true
    }
  }, [ptySessionId])

  const loadMore = useCallback(async () => {
    const before = view?.pages[0]?.start
    if (before === undefined) return
    setLoading(true)
    setError(null)
    try {
      const read = await readArchivePage(ptySessionId, before)
      scrollToTopRef.current = true
      setView((current) => prependArchivePage(current, read))
    } catch (loadError) {
      setError(readErrorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }, [ptySessionId, view])

  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal || !view) return
    // O xterm não insere linhas acima das que já tem: a janela é reescrita
    // inteira, do trecho mais antigo ao mais novo.
    terminal.reset()
    const scrollToTop = scrollToTopRef.current
    terminal.write(archiveViewText(view), () => {
      if (scrollToTop) terminal.scrollToTop()
    })
  }, [view])

  const hasMore = archiveViewHasMore(view)

  return (
    <div
      role="region"
      aria-label="Histórico arquivado do terminal"
      data-felixo-terminal-archive
      className="absolute inset-0 z-10 flex flex-col bg-(--f-core-black-surface)"
    >
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-1.5 text-[11px] text-zinc-400">
        <p className="mr-auto leading-relaxed" role="status">
          {describeArchiveView(view)}
        </p>
        <button
          type="button"
          disabled={!hasMore || loading}
          onClick={() => void loadMore()}
          className="felixo-btn rounded-sm px-2 py-0.5 text-xs text-zinc-200 hover:bg-white/10 disabled:opacity-50"
        >
          {loading ? 'Carregando…' : 'Carregar mais'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="felixo-btn rounded-sm px-2 py-0.5 text-xs text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
        >
          Voltar ao terminal
        </button>
      </div>
      {error && (
        <p role="alert" className="border-b border-white/10 px-3 py-1.5 text-xs text-theme-error">
          {error}
        </p>
      )}
      <div ref={mountRef} className="min-h-0 flex-1 overflow-hidden px-1 pb-2 pt-1" />
    </div>
  )
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Não foi possível ler o Histórico arquivado.'
}

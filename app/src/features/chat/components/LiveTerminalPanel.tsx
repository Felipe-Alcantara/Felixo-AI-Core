import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

type LiveTerminalPanelProps = {
  /** Stable id for this PTY session; one terminal node = one session. */
  sessionId: string
  /** Binary to run; defaults to the user shell on the backend when omitted. */
  command?: string
  args?: string[]
  cwd?: string
  className?: string
}

/**
 * A real terminal node: renders raw PTY bytes with xterm.js and forwards
 * keystrokes back to the pseudo-terminal. No output parsing — what the CLI
 * prints is exactly what shows up, so interactive agents behave natively.
 */
export function LiveTerminalPanel({
  sessionId,
  command,
  args,
  cwd,
  className,
}: LiveTerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'starting' | 'running' | 'exited' | 'error'>(
    'starting',
  )
  const [statusMessage, setStatusMessage] = useState('')

  useEffect(() => {
    const container = containerRef.current
    const pty = window.felixo?.pty

    if (!container || !pty) {
      setStatus('error')
      setStatusMessage('Terminal indisponivel: bridge PTY nao encontrada.')
      return
    }

    let disposed = false
    const terminal = new Terminal({
      convertEol: false,
      cursorBlink: true,
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      theme: { background: '#0b0f14' },
    })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(container)

    const safeFit = () => {
      try {
        fitAddon.fit()
      } catch {
        // Container may be hidden/zero-sized momentarily; ignore.
      }
    }

    safeFit()

    // PTY output → screen.
    const offData = pty.onData((event) => {
      if (event.sessionId === sessionId) {
        terminal.write(event.data)
      }
    })

    const offExit = pty.onExit((event) => {
      if (event.sessionId !== sessionId) {
        return
      }

      setStatus('exited')
      setStatusMessage(`Processo encerrado (codigo ${event.exitCode}).`)
    })

    // Keyboard → PTY.
    const onDataDisposable = terminal.onData((data) => {
      void pty.write({ sessionId, data })
    })

    // View resize → PTY resize, so the CLI redraws for the real size.
    const pushResize = () => {
      safeFit()
      void pty.resize({
        sessionId,
        cols: terminal.cols,
        rows: terminal.rows,
      })
    }

    const resizeObserver = new ResizeObserver(() => pushResize())
    resizeObserver.observe(container)

    void pty
      .spawn({
        sessionId,
        command,
        args,
        cwd,
        cols: terminal.cols,
        rows: terminal.rows,
      })
      .then((result) => {
        if (disposed) {
          return
        }

        if (result?.ok) {
          setStatus('running')
          terminal.focus()
        } else {
          setStatus('error')
          setStatusMessage(result?.message ?? 'Falha ao iniciar o terminal.')
        }
      })

    return () => {
      disposed = true
      offData()
      offExit()
      onDataDisposable.dispose()
      resizeObserver.disconnect()
      void pty.kill({ sessionId, force: true })
      terminal.dispose()
    }
  }, [sessionId, command, args, cwd])

  return (
    <div className={`flex h-full flex-col overflow-hidden rounded-lg bg-[#0b0f14] ${className ?? ''}`}>
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5 text-xs text-white/60">
        <span className="font-mono">{command ?? 'shell'}</span>
        <span className={statusColor(status)}>{statusLabel(status)}</span>
      </div>
      <div ref={containerRef} className="min-h-0 flex-1" />
      {statusMessage && (
        <div className="border-t border-white/10 px-3 py-1 text-xs text-white/50">
          {statusMessage}
        </div>
      )}
    </div>
  )
}

function statusLabel(status: 'starting' | 'running' | 'exited' | 'error') {
  switch (status) {
    case 'starting':
      return 'iniciando…'
    case 'running':
      return 'ativo'
    case 'exited':
      return 'encerrado'
    case 'error':
      return 'erro'
  }
}

function statusColor(status: 'starting' | 'running' | 'exited' | 'error') {
  switch (status) {
    case 'running':
      return 'text-emerald-400'
    case 'error':
      return 'text-red-400'
    case 'exited':
      return 'text-white/40'
    default:
      return 'text-amber-400'
  }
}

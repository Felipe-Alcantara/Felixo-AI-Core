import { Component, type ErrorInfo, type ReactNode } from 'react'

type RendererRecoveryBoundaryProps = {
  children: ReactNode
}

type RendererRecoveryBoundaryState = {
  hasError: boolean
}

/**
 * A render exception must not leave the Electron window as an unexplained
 * black rectangle. Reloading the renderer keeps the main process, PTYs and
 * app profile alive, so recovery does not require restarting the whole app.
 */
export class RendererRecoveryBoundary extends Component<
  RendererRecoveryBoundaryProps,
  RendererRecoveryBoundaryState
> {
  state: RendererRecoveryBoundaryState = { hasError: false }

  static getDerivedStateFromError(): RendererRecoveryBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[felixo] falha ao renderizar a interface:', error, info.componentStack)
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <main className="flex h-screen w-screen items-center justify-center bg-zinc-950 px-6 text-zinc-100">
        <section className="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-900 p-6 shadow-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-emerald-300">
            Felixo AI Core
          </p>
          <h1 className="mt-3 text-lg font-semibold">A interface não conseguiu carregar</h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            A sessão do app continua aberta. Recarregue somente a interface para
            tentar novamente, sem encerrar os terminais.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-white"
          >
            Recarregar interface
          </button>
        </section>
      </main>
    )
  }
}

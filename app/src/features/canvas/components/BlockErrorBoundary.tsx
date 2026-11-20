import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = {
  /** Como o bloco se chama na mensagem ("Tarefas Notion"). */
  rotulo: string
  /** Chamado antes de renderizar de novo (renova o `lazy`). */
  aoTentarDeNovo?: () => void
  /** Função, não elemento: depois de "Tentar de novo" ela é lida outra vez e pega o componente renovado. */
  children: () => ReactNode
}

type State = { erro: boolean }

/**
 * Um bloco de canvas que carrega código sob demanda (Tarefas Notion, Excalidraw) não pode derrubar o canvas inteiro
 * quando o chunk falha ao baixar ou o render lança: os painéis de ferramenta já têm o `ToolPanelErrorBoundary`, os
 * blocos não tinham. O erro fica dentro do bloco, com "Tentar de novo". O filho é uma função, lida de novo depois do
 * retry para pegar o `lazy` renovado (ver `lazy-recarregavel.ts`).
 */
export class BlockErrorBoundary extends Component<Props, State> {
  state: State = { erro: false }

  static getDerivedStateFromError(): State {
    return { erro: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    // Só o nome do bloco e o tipo do erro: a mensagem do import pode carregar caminho local.
    console.error(`[felixo] falha ao carregar o bloco "${this.props.rotulo}":`, error instanceof Error ? error.name : 'erro', info.componentStack?.split('\n')[1]?.trim() ?? '')
  }

  private tentarDeNovo = () => {
    this.props.aoTentarDeNovo?.()
    this.setState({ erro: false })
  }

  render() {
    if (!this.state.erro) return this.props.children()
    return (
      <div
        role="alert"
        className="nodrag nowheel nopan flex h-full min-h-24 w-full flex-col items-center justify-center gap-2 bg-zinc-900 p-3 text-center text-xs text-zinc-300"
      >
        <p>Não foi possível carregar {this.props.rotulo}.</p>
        <p className="text-zinc-500">O resto do canvas segue funcionando.</p>
        <button
          type="button"
          className="felixo-btn rounded-sm bg-zinc-700 px-3 py-1.5 text-zinc-100 hover:bg-zinc-600"
          onClick={this.tentarDeNovo}
        >
          Tentar de novo
        </button>
      </div>
    )
  }
}

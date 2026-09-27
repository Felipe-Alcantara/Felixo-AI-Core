import { Component, type ErrorInfo, type ReactNode } from 'react'
import type { OnboardingStore } from './onboarding-store'

type Props = {
  store: Pick<OnboardingStore, 'reportFailure'>
  /** Uma abertura nova (Ajuda) tenta de novo: o boundary volta a renderizar os filhos. */
  resetKey: number | string
  children: ReactNode
}

type State = { hasError: boolean }

/**
 * Isola o tutorial do resto do canvas (molde do `ToolPanelErrorBoundary`): uma
 * falha na camada, no chunk preguiçoso ou no menu da Ajuda vira "nada na tela",
 * nunca a tela "A interface não conseguiu carregar". A store desativa o tour na
 * sessão e registra a falha no QA Logger (escopo `renderer:onboarding`).
 */
export class OnboardingErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    this.props.store.reportFailure(error, info.componentStack ?? null)
  }

  componentDidUpdate(previous: Props) {
    if (previous.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false })
    }
  }

  render() {
    return this.state.hasError ? null : this.props.children
  }
}

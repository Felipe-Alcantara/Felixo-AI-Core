import type { SystemDesignConfig } from './types'

export type SystemDesignStatusTone = 'ok' | 'warn' | 'muted'

export type SystemDesignStatusView = {
  headline: string
  detail: string | null
  tone: SystemDesignStatusTone
}

type PresentationOptions = {
  /** Injetável nos testes; o padrão usa o locale do sistema. */
  formatDate?: (iso: string) => string
}

const defaultFormatDate = (iso: string) => new Date(iso).toLocaleString('pt-BR')

function shortSha(sha: string): string {
  return sha.slice(0, 7)
}

/** "Felixo System Design · main" — a fonte configurada agora. */
export function describeConfiguredSource(config: SystemDesignConfig): string {
  if (!config.repoUrl) return '—'
  return `${config.label} · ${config.branch}`
}

/**
 * Diz, em uma frase e um detalhe, qual conteúdo os agentes estão recebendo.
 *
 * A distinção que importa é entre a fonte CONFIGURADA e a fonte ENTREGUE: logo
 * depois de trocar a URL, ou quando a sincronização falha, o conteúdo em cache
 * ainda é o da fonte anterior — e a tela não pode afirmar o contrário.
 */
export function describeSystemDesignStatus(
  config: SystemDesignConfig,
  { formatDate = defaultFormatDate }: PresentationOptions = {},
): SystemDesignStatusView {
  const delivered = config.delivered
  const deliveredLabel = delivered
    ? `${delivered.label} · ${delivered.branch} @ ${shortSha(delivered.sha)}`
    : null
  const deliveredWhen =
    delivered?.syncedAt ? ` (sincronizado em ${formatDate(delivered.syncedAt)})` : ''

  switch (config.syncState) {
    case 'disabled':
      return {
        headline: 'Desligado',
        detail: 'Os agentes não recebem o System Design.',
        tone: 'muted',
      }
    case 'never-synced':
      return {
        headline: 'Ainda não sincronizado',
        detail: config.repoUrl
          ? `Sincronize para entregar ${describeConfiguredSource(config)} aos agentes.`
          : null,
        tone: 'muted',
      }
    case 'synced':
      return {
        headline: 'Sincronizado',
        detail: deliveredLabel ? `Os agentes recebem ${deliveredLabel}${deliveredWhen}.` : null,
        tone: 'ok',
      }
    case 'offline-fallback':
      return {
        headline: 'Sem acesso à fonte — usando o último conteúdo',
        detail: deliveredLabel
          ? `A última sincronização falhou. Os agentes seguem recebendo ${deliveredLabel}${deliveredWhen}.`
          : 'A última sincronização falhou.',
        tone: 'warn',
      }
    case 'pending-source-change':
      return {
        headline: 'Fonte alterada, ainda não sincronizada',
        detail: deliveredLabel
          ? `Até a próxima sincronização, os agentes seguem recebendo ${deliveredLabel}${deliveredWhen}, não ${describeConfiguredSource(config)}.`
          : null,
        tone: 'warn',
      }
  }
}

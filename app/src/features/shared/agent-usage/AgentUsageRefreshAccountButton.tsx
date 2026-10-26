import { RefreshCw } from 'lucide-react'
import { describeAgentUsageAccountRefresh, type AgentUsageAccount } from './agent-usage'

/** Botão "Atualizar" de uma conta; o texto de ajuda diz se ele lê a pasta dela ou o login da máquina. */
export function AgentUsageRefreshAccountButton({
  account,
  refreshing,
  disabled = false,
  onRefresh,
}: {
  account: AgentUsageAccount
  refreshing: boolean
  /** Rodada completa em andamento: ela já lê esta conta. */
  disabled?: boolean
  onRefresh: (account: AgentUsageAccount) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onRefresh(account)}
      disabled={disabled || refreshing}
      aria-busy={refreshing}
      title={describeAgentUsageAccountRefresh(account)}
      aria-label={`Atualizar a conta "${account.identityDisplay ?? account.label}"`}
      data-felixo-agent-usage-refresh-account=""
      className="felixo-btn flex shrink-0 items-center rounded-sm p-1 text-zinc-500 hover:bg-white/8 hover:text-zinc-200 disabled:opacity-50"
    >
      <RefreshCw size={12} aria-hidden="true" className={refreshing ? 'animate-spin' : undefined} />
    </button>
  )
}

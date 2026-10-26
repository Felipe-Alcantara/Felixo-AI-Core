import { AgentUsageRefreshAccountButton } from '../../../shared/agent-usage/AgentUsageRefreshAccountButton'
import {
  AGENT_USAGE_STATUS_CLASSES,
  formatAgentUsageNumber,
  formatAgentUsageReset,
  formatAgentUsageStatus,
  type AgentUsageAccount,
  type AgentUsageProviderSummary,
  type AgentUsageSummaryCell,
} from '../../../shared/agent-usage/agent-usage'

/**
 * Resumo de um provedor no painel "Limites e uso": um grupo de linhas por
 * conta — o identificador na largura inteira e, logo abaixo, plano, quanto
 * sobra em cada janela da conta e o selo de status. É a leitura rápida para
 * comparar contas do mesmo provedor; o /status completo de cada uma fica
 * recolhido logo abaixo.
 *
 * O nome não divide a linha com os números: com plano, quatro janelas e
 * status lado a lado, sobravam poucos pixels para ele no painel estreito e o
 * e-mail quebrava letra por letra.
 */
export function ProviderSummaryTable({
  providerName,
  summary,
  onRefreshAccount,
  refreshingIds,
  refreshDisabled,
}: {
  providerName: string
  summary: AgentUsageProviderSummary
  onRefreshAccount: (account: AgentUsageAccount) => void
  refreshingIds: ReadonlySet<string>
  /** Rodada completa em andamento: ela já lê todas as contas. */
  refreshDisabled: boolean
}) {
  if (summary.rows.length === 0) {
    return null
  }

  // Plano + uma coluna por janela + status.
  const columnCount = summary.columns.length + 2

  return (
    <table className="mt-2 w-full table-fixed border-collapse text-[11px]">
      <caption className="sr-only">Resumo das contas do {providerName}</caption>
      <thead>
        <tr className="text-left text-[10px] text-zinc-500">
          {/* Plano e status com largura fixa; as janelas dividem o resto. */}
          <th scope="col" className="w-12 py-1 pr-2 font-normal">Plano</th>
          {summary.columns.map((column) => (
            <th key={column.key} scope="col" className="py-1 pr-2 font-normal">
              {column.label}
            </th>
          ))}
          <th scope="col" className="w-[5.25rem] py-1 text-right font-normal">Status</th>
        </tr>
      </thead>
      {summary.rows.map((row) => (
        // Um <tbody> por conta: o nome é o cabeçalho (rowgroup) dos números
        // dela, e o leitor de tela continua lendo "conta → janela → valor".
        <tbody key={row.account.id}>
          <tr className="border-t border-white/6">
            <th scope="rowgroup" colSpan={columnCount} className="pt-1.5 text-left font-normal">
              <div className="flex items-start gap-1.5">
                <span
                  className="block min-w-0 flex-1 whitespace-normal wrap-break-word text-zinc-200"
                  title={accountName(row.account)}
                >
                  {accountName(row.account)}
                </span>
                <AgentUsageRefreshAccountButton
                  account={row.account}
                  refreshing={refreshingIds.has(row.account.id)}
                  disabled={refreshDisabled}
                  onRefresh={onRefreshAccount}
                />
              </div>
              {row.warning && (
                <span className="mt-0.5 block text-[10px] leading-snug text-(--color-warning)">
                  {row.warning}
                </span>
              )}
              {/* Idade do número e motivo da rodada: sem isto o último valor conhecido
                  parece leitura nova, e a conta sem sessão parece só "Indisponível". */}
              {row.notice && (
                <span
                  data-felixo-agent-usage-notice
                  className={`mt-0.5 block text-[10px] leading-snug ${row.lastKnown ? 'text-(--color-warning)' : 'text-zinc-500'}`}
                >
                  {row.notice}
                </span>
              )}
            </th>
          </tr>
          <tr className="align-top">
            <td className="py-1.5 pr-2">
              {row.plan ? (
                <span className="rounded-sm bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)] px-1.5 py-0.5 text-[10px] uppercase text-(--color-warning)">
                  {row.plan}
                </span>
              ) : (
                <span className="text-zinc-600">—</span>
              )}
            </td>
            {summary.columns.map((column) => (
              <td key={column.key} className={`py-1.5 pr-2 ${row.lastKnown ? 'opacity-60' : ''}`}>
                <SummaryCell cell={row.cells[column.key]} />
              </td>
            ))}
            <td className="py-1.5 text-right">
              <span
                className={`inline-block rounded-sm border px-1.5 py-0.5 text-[10px] ${AGENT_USAGE_STATUS_CLASSES[row.status]}`}
              >
                {formatAgentUsageStatus(row.status)}
              </span>
            </td>
          </tr>
        </tbody>
      ))}
    </table>
  )
}

/** Sem a janela na rodada, a célula diz que não há número — nunca zero. */
function SummaryCell({ cell }: { cell: AgentUsageSummaryCell | null }) {
  if (!cell) {
    return (
      <span className="text-zinc-600" title="A CLI não publicou esta janela para a conta.">
        —
      </span>
    )
  }

  const reset = formatAgentUsageReset(cell.resetAt)
  return (
    <span className={remainingToneClass(cell.usedPercent)} title={reset ?? undefined}>
      {formatAgentUsageNumber(Math.round(cell.remaining * 10) / 10, '%')} livre
      {reset && <span className="sr-only">, {reset}</span>}
    </span>
  )
}

/** Mesma régua das barras: âmbar a partir de 60% usado, vermelho a partir de 90%. */
function remainingToneClass(usedPercent: number): string {
  if (usedPercent >= 90) {
    return 'text-theme-error'
  }
  if (usedPercent >= 60) {
    return 'text-(--color-warning)'
  }
  return 'text-zinc-100'
}

function accountName(account: AgentUsageAccount): string {
  return account.identityDisplay ?? account.label
}

/**
 * O /status do Codex mostra também a conversa aberta. O painel é da conta,
 * então esses campos ficam de fora de propósito — o aviso diz quais e por quê
 * (decisão da task "Limites — mostrar no painel todas as informações do
 * /status do Codex", registrada no README).
 */
export function CodexSessionFieldsNotice() {
  return (
    <p className="mt-2 text-[10px] leading-snug text-zinc-600">
      O /status do Codex também mostra dados da conversa aberta em cada
      terminal: pasta, permissões da pasta, Agents.md, nome e modo da conversa,
      ID da sessão e janela de contexto. Eles ficam fora deste painel de
      propósito, porque pertencem ao terminal, não à conta.
    </p>
  )
}

import {
  getAgentUsageStatusDetails,
  type AgentUsageSample,
  type AgentUsageStatusDetailValue,
} from './agent-usage'

const DETAIL_LABELS: Record<string, string> = {
  status: 'Status',
  usage: 'Uso',
  version: 'Versão',
  sessionName: 'Nome da sessão',
  sessionId: 'ID da sessão',
  sessionKind: 'Tipo de sessão',
  peerAddress: 'Endereço do peer',
  cwd: 'Pasta atual',
  loginMethod: 'Método de login',
  organization: 'Organização',
  email: 'E-mail',
  web: 'Web',
  model: 'Modelo',
  settingSources: 'Fontes de configuração',
  lines: 'Informações publicadas',
  sessionStats: 'Estatísticas da sessão',
  totalCost: 'Custo total',
  totalDurationApi: 'Duração total da API',
  totalDurationWall: 'Duração total (relógio)',
  totalCodeChanges: 'Alterações de código',
  usageByModel: 'Uso por modelo',
  currentSession: 'Sessão atual',
  currentWeek: 'Semana atual (todos os modelos)',
  used: 'Usado',
  resetAt: 'Reset em',
  resetText: 'Reset informado pela CLI',
  promotion: 'Promoção',
  explanation: 'Explicação',
  attribution: 'Atribuição',
  activity: 'Fatores das últimas 24 h',
  usageCredits: 'Créditos de uso',
}

/**
 * Exibe o retorno seguro do `/status` sem despejar a saída bruta do PTY.
 * `open` é intencional: a informação pedida pelo painel fica visível em cada
 * conta/perfil, enquanto o resumo continua no topo do cartão.
 */
export function AgentUsageStatusDetailsView({
  sample,
}: {
  sample: AgentUsageSample | null
}) {
  const details = getAgentUsageStatusDetails(sample)
  if (!details) {
    return null
  }

  return (
    <details open className="mt-2 rounded-md border border-white/[0.06] bg-black/15 px-2 py-1.5">
      <summary className="cursor-pointer text-[10px] font-medium text-zinc-400">
        Dados completos do /status
      </summary>
      <div className="mt-2 border-t border-white/[0.06] pt-2">
        <DetailValue value={details} />
      </div>
    </details>
  )
}

function DetailValue({
  value,
  depth = 0,
}: {
  value: AgentUsageStatusDetailValue
  depth?: number
}) {
  if (Array.isArray(value)) {
    return (
      <ul className="space-y-0.5 text-[10px] text-zinc-500">
        {value.map((item, index) => (
          <li key={`${index}-${String(item)}`} className="break-words">
            {typeof item === 'object' ? <DetailValue value={item} depth={depth + 1} /> : String(item)}
          </li>
        ))}
      </ul>
    )
  }

  if (typeof value === 'object' && value !== null) {
    return (
      <div className={depth > 0 ? 'ml-2 space-y-1 border-l border-white/[0.06] pl-2' : 'space-y-1'}>
        {Object.entries(value).map(([key, item]) => (
          key === 'lines' ? (
            <details key={key} open className="rounded border border-white/[0.05] px-1.5 py-1">
              <summary className="cursor-pointer text-[10px] text-zinc-600">
                Texto completo publicado pela CLI
              </summary>
              <div className="mt-1">
                <DetailValue value={item} depth={depth + 1} />
              </div>
            </details>
          ) : (
            <div key={key} className="min-w-0">
              <span className="text-[10px] text-zinc-600">{DETAIL_LABELS[key] ?? key}: </span>
              <DetailValue value={item} depth={depth + 1} />
            </div>
          )
        ))}
      </div>
    )
  }

  return <span className="break-words text-[10px] text-zinc-500">{String(value)}</span>
}

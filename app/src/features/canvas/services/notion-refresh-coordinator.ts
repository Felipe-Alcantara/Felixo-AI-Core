export type RefreshRunner = () => Promise<void>

/**
 * Coordena chamadas de refresh concorrentes (load manual, timer de
 * auto-sync, busca digitada, troca de filtro) pro mesmo painel: nunca deixa
 * duas rodarem em paralelo — um `trigger` chamado enquanto outro já está em
 * andamento não dispara um segundo round-trip, só atualiza qual é a
 * "próxima execução pendente" — e nunca perde o pedido mais recente: quando
 * a execução em andamento termina, se algum `trigger` chegou nesse meio
 * tempo, roda de novo automaticamente com o runner mais recente (que já
 * fecha sobre os valores atuais de conexão/tabela/busca/filtro).
 *
 * Deliberadamente sem AbortController: as chamadas são round-trips de IPC
 * (Electron `invoke`), não `fetch`, e não têm um jeito de cancelamento real
 * no meio do caminho — o coordinator resolve o problema por outro lado,
 * garantindo que a PRÓXIMA chamada nunca fica bloqueada atrás de uma
 * anterior nem dispara em paralelo com ela.
 */
export function createRefreshCoordinator() {
  let latestRun: RefreshRunner | null = null
  // A promise compartilhada pelo ciclo em andamento — todo `trigger` chamado
  // enquanto ela existe recebe a MESMA promise de volta, então quem chama
  // sempre sabe quando a sincronização de verdade (a sua, ou uma mais nova
  // que a superou) terminou, em vez de um "aceito" vazio e imediato.
  let runningCycle: Promise<void> | null = null

  function trigger(run: RefreshRunner): Promise<void> {
    latestRun = run
    if (runningCycle) return runningCycle
    runningCycle = runLoop().finally(() => {
      runningCycle = null
    })
    return runningCycle
  }

  async function runLoop(): Promise<void> {
    while (latestRun) {
      const current = latestRun
      latestRun = null
      await current()
    }
  }

  return { trigger }
}

export type NotionRefreshTarget = { connectionId: string; dataSourceId: string }

/**
 * Se a conexão/tabela ativa mudou entre o início de um fetch (o `captured`
 * no momento da chamada) e agora (`current`, lido de uma ref sempre
 * atualizada). Uma resposta cujo alvo já mudou deve ser descartada em vez de
 * sobrescrever o estado da tabela nova que o painel já está mostrando.
 */
export function targetChanged(captured: NotionRefreshTarget, current: NotionRefreshTarget): boolean {
  return captured.connectionId !== current.connectionId || captured.dataSourceId !== current.dataSourceId
}

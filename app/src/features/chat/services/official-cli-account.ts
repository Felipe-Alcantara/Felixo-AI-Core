/**
 * Traduz o estado de conta de uma CLI oficial em texto para a interface.
 *
 * Fica fora do componente porque é onde mora a parte que precisa estar certa:
 * o que dizer quando a CLI não informa identidade, e o que prometer (ou não)
 * sobre terminais que já estão rodando com a conta antiga.
 */

export type OfficialCliAccountStatus = {
  authStatus?: 'logged_in' | 'logged_out' | 'unknown'
  method?: string
  account?: string
  plan?: string
  organization?: string
  output?: string
  message?: string
}

export type OfficialCliAccountSession = {
  sessionId: string
  elementId: string | null
  cwd: string
  startedAt: number | null
}

/**
 * Uma linha descrevendo quem está autenticado.
 *
 * Quando a CLI não imprime identidade, a frase diz isso — em vez de deixar a
 * pessoa concluir que "conectado" significa "conectado na conta que eu acho".
 */
export function formatAccountIdentity(
  cliName: string,
  status: OfficialCliAccountStatus,
): string {
  if (status.authStatus === 'logged_out') {
    return `${cliName}: nenhuma conta autenticada.`
  }

  if (status.authStatus !== 'logged_in') {
    const detail = status.output?.trim() || status.message?.trim()
    return detail
      ? `${cliName}: a CLI não informou um estado reconhecido — ${detail}`
      : `${cliName}: a CLI não informou o estado da conta.`
  }

  const details = [
    status.account,
    status.plan ? `plano ${status.plan}` : null,
    status.organization,
    !status.account && status.method ? `via ${status.method}` : null,
  ].filter((detail): detail is string => Boolean(detail))

  if (details.length === 0) {
    return `${cliName}: conectado. A CLI não expõe qual conta está em uso.`
  }

  return `${cliName}: conectado — ${details.join(', ')}.`
}

/**
 * O que vai acontecer com os terminais abertos quando a conta for trocada.
 *
 * A promessa é deliberadamente limitada. O canvas preserva o nó, o diretório e
 * o histórico do terminal porque o id da PTY não depende do componente; isso
 * não é o mesmo que preservar a autorização de um processo que já nasceu
 * autenticado com outra conta. Nada aqui afirma que uma sessão em andamento
 * continuará funcionando — só que ela não será encerrada pelo app.
 */
export function describeSwitchImpact(
  cliName: string,
  sessions: OfficialCliAccountSession[],
): string[] {
  const lines = [
    `A conta atual de ${cliName} será desconectada e o login oficial abrirá em um terminal do sistema.`,
  ]

  if (sessions.length === 0) {
    lines.push('Nenhum terminal do canvas está rodando esta CLI agora.')
    return lines
  }

  lines.push(
    sessions.length === 1
      ? '1 terminal do canvas está rodando esta CLI e continuará aberto — o app não encerra nenhum processo.'
      : `${sessions.length} terminais do canvas estão rodando esta CLI e continuarão abertos — o app não encerra nenhum processo.`,
  )
  lines.push(
    'Um processo que já estava autenticado pode perder a autorização no meio do trabalho. Quando isso acontecer, reinicie o terminal pelo próprio cartão: o nó, o diretório e o histórico são preservados; o contexto interno da CLI, não.',
  )

  return lines
}

/** Rótulo curto de um terminal afetado, para a lista da confirmação. */
export function formatSessionLabel(session: OfficialCliAccountSession): string {
  const directory = session.cwd?.trim()
  const name = directory
    ? directory.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || directory
    : 'diretório não informado'

  return session.elementId ? `${name} · ${session.elementId}` : name
}

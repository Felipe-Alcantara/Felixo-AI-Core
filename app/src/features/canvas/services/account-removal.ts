import type {
  CliAccountAffectedSession,
  CliAccountRemoveOptions,
  CliAccountRemoveResult,
} from '../../shared/types/cli-accounts'

/**
 * Remoção de conta confirmada, sem React: o componente só entrega a pergunta
 * e a ponte. A trava de verdade fica no processo principal (a remoção só
 * acontece com `confirmed: true` cobrindo todos os terminais vivos na conta);
 * aqui fica a ordem dos passos e o texto que nomeia os blocos afetados.
 */

export type AccountRemovalOutcome =
  | { status: 'removed' }
  | { status: 'cancelled' }
  | { status: 'failed'; message: string }

const GENERIC_FAILURE = 'Não foi possível remover a conta.'

function defaultFormatTime(startedAt: number): string {
  return new Date(startedAt).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Rótulo curto do terminal afetado: a pasta em que ele roda e quando abriu. */
export function formatAffectedTerminal(
  session: CliAccountAffectedSession,
  formatTime: (startedAt: number) => string = defaultFormatTime,
): string {
  const directory = session.cwd.trim()
  const name = directory
    ? directory.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || directory
    : 'diretório não informado'

  return session.startedAt === null ? name : `${name} · aberto às ${formatTime(session.startedAt)}`
}

/**
 * Texto da confirmação. Promete só o que é verdade: o app não encerra os
 * terminais (decisão 6), mas a pasta de login some debaixo deles, então a CLI
 * que já estava aberta pode parar de funcionar no meio do trabalho.
 */
export function describeAccountRemoval(
  accountLabel: string,
  sessions: readonly CliAccountAffectedSession[],
  formatTime?: (startedAt: number) => string,
): string {
  const lines = [`Remover a conta "${accountLabel}"? A pasta de login dela será apagada.`]

  if (sessions.length === 0) {
    lines.push('Nenhum terminal está aberto nesta conta agora.')
    return lines.join('\n')
  }

  lines.push(
    sessions.length === 1
      ? '1 terminal está aberto nesta conta:'
      : `${sessions.length} terminais estão abertos nesta conta:`,
  )
  lines.push(...sessions.map((session) => `• ${formatAffectedTerminal(session, formatTime)}`))
  lines.push(
    sessions.length === 1
      ? 'Ele continua aberto — o app não encerra processo —, mas perde o login e a CLI pode parar no meio do trabalho.'
      : 'Eles continuam abertos — o app não encerra processo —, mas perdem o login e a CLI pode parar no meio do trabalho.',
  )

  return lines.join('\n')
}

/**
 * Pergunta ao processo principal quem está na conta, confirma nomeando esses
 * terminais e só então pede a remoção, dizendo quais terminais a pessoa viu.
 * Se outro terminal abriu na conta durante a pergunta, o principal recusa e
 * nada é apagado.
 */
export async function removeAccountWithConfirmation({
  accountLabel,
  remove,
  confirm,
  formatTime,
}: {
  accountLabel: string
  remove: (options?: CliAccountRemoveOptions) => Promise<CliAccountRemoveResult | undefined>
  confirm: (message: string) => boolean | Promise<boolean>
  formatTime?: (startedAt: number) => string
}): Promise<AccountRemovalOutcome> {
  const preview = await remove()

  if (preview?.ok && preview.removed === false) {
    return { status: 'failed', message: 'A conta não existe mais.' }
  }

  if (!preview?.requiresConfirmation) {
    return { status: 'failed', message: preview?.message ?? GENERIC_FAILURE }
  }

  const sessions = preview.sessions ?? []

  if (!(await confirm(describeAccountRemoval(accountLabel, sessions, formatTime)))) {
    return { status: 'cancelled' }
  }

  const result = await remove({
    confirmed: true,
    acknowledgedSessionIds: sessions.map((session) => session.sessionId),
  })

  if (result?.ok && result.removed === true) {
    return { status: 'removed' }
  }

  if (result?.requiresConfirmation) {
    return {
      status: 'failed',
      message:
        'Outro terminal abriu nesta conta enquanto você confirmava. Nada foi apagado; remova de novo para ver a lista atualizada.',
    }
  }

  return { status: 'failed', message: result?.message ?? GENERIC_FAILURE }
}

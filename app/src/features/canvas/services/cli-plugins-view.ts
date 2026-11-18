import type { CliPluginEntry, CliPluginProvider } from '../../shared/types/cli-plugins'

/** A lista do marketplace do Claude passa de 3.000 itens: a tela mostra um trecho e a busca afunila. */
export const PLUGIN_ROWS_LIMIT = 100

export type PluginAction = 'install' | 'remove' | 'enable' | 'disable' | 'update'

export function filterPlugins(entries: readonly CliPluginEntry[], query: string, limit = PLUGIN_ROWS_LIMIT) {
  const needle = query.trim().toLowerCase()
  const matches = needle
    ? entries.filter((entry) =>
        `${entry.name} ${entry.description} ${entry.marketplace}`.toLowerCase().includes(needle),
      )
    : entries
  return { rows: matches.slice(0, limit), total: matches.length }
}

const PROVIDER_NAMES: Record<CliPluginProvider, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  gemini: 'Gemini CLI',
}

/** Só o escopo `user` é do app; o que vem de projeto ou `local` fica para a CLI. */
export function canChangeEntry(entry: CliPluginEntry): boolean {
  return entry.scope === null || entry.scope === 'user'
}

/**
 * Texto da confirmação. A instalação e a atualização trazem o aviso de que o
 * plugin roda código na máquina, com a origem e a conta onde passa a valer.
 */
export function describeConfirmation(params: {
  action: PluginAction
  providerId: CliPluginProvider
  accountLabel: string
  target: string
  origin: string
}): { title: string; body: string; confirmLabel: string } {
  const { action, providerId, accountLabel, target, origin } = params
  const where = `${PROVIDER_NAMES[providerId]}, ${accountLabel}`
  const from = origin ? ` Origem: ${origin}.` : ' A CLI não informou a origem.'
  const code =
    ' Plugins e extensões executam código de terceiros nesta máquina, podem ler os projetos abertos e registrar servidores MCP e hooks.'
  switch (action) {
    case 'install':
      return {
        title: `Instalar ${target}?`,
        body: `Vale só para ${where}.${from}${code}`,
        confirmLabel: 'Instalar',
      }
    case 'update':
      return {
        title: `Atualizar ${target}?`,
        body: `A versão nova também roda código de terceiros (${where}).${from}`,
        confirmLabel: 'Atualizar',
      }
    case 'enable':
      return { title: `Ligar ${target}?`, body: `Volta a rodar nos terminais novos de ${where}.`, confirmLabel: 'Ligar' }
    case 'disable':
      return {
        title: `Desligar ${target}?`,
        body: `Deixa de valer nos terminais novos de ${where}; nada é apagado.`,
        confirmLabel: 'Desligar',
      }
    case 'remove':
      return {
        title: `Remover ${target}?`,
        body: `Desinstala de ${where}. Os terminais já abertos continuam como estão.`,
        confirmLabel: 'Remover',
      }
  }
}

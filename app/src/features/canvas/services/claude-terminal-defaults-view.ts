import type {
  ClaudeConfigOption,
  ClaudeConfigValue,
  ClaudeTerminalDefaultsChange,
  ClaudeTerminalDefaultsState,
} from '../../shared/types/claude-terminal-defaults'

/** Escolha de uma opção: segue o nível de cima, usa o padrão do Claude ou um valor. */
export const CHOICE_INHERIT = '__inherit'
export const CHOICE_CLAUDE_DEFAULT = '__claude'
const VALUE_PREFIX = 'v:'

export type DefaultsScope = { accountId: string | null }
export type OptionOrigin = 'account' | 'app' | 'claude'

export function valueChoice(value: ClaudeConfigValue): string {
  return `${VALUE_PREFIX}${String(value)}`
}

/** O que o seletor mostra hoje para a opção, no escopo escolhido. */
export function currentChoice(
  state: ClaudeTerminalDefaultsState,
  scope: DefaultsScope,
  option: ClaudeConfigOption,
): string {
  if (scope.accountId === null) {
    const value = state.global[option.key]
    return value === undefined ? CHOICE_INHERIT : valueChoice(value)
  }
  const value = state.accounts[scope.accountId]?.[option.key]
  if (value === undefined) return CHOICE_INHERIT
  return value === null ? CHOICE_CLAUDE_DEFAULT : valueChoice(value)
}

/** De onde vem o valor que um terminal novo daquela conta recebe. */
export function optionOrigin(
  state: ClaudeTerminalDefaultsState,
  scope: DefaultsScope,
  key: string,
): OptionOrigin {
  const exception = scope.accountId === null ? undefined : state.accounts[scope.accountId]?.[key]
  if (exception === null) return 'claude'
  if (exception !== undefined) return 'account'
  return state.global[key] === undefined ? 'claude' : 'app'
}

export function describeOrigin(origin: OptionOrigin): string {
  if (origin === 'account') return 'Exceção desta conta'
  if (origin === 'app') return 'Padrão do app'
  return 'Padrão do Claude'
}

/** Converte a escolha do seletor na mudança que o processo principal grava. */
export function changeForChoice(
  option: ClaudeConfigOption,
  scope: DefaultsScope,
  choice: string,
): ClaudeTerminalDefaultsChange | null {
  const base = { key: option.key, ...(scope.accountId === null ? {} : { accountId: scope.accountId }) }
  if (choice === CHOICE_INHERIT) return { ...base, clear: true }
  if (choice === CHOICE_CLAUDE_DEFAULT) return scope.accountId === null ? null : { ...base, value: null }
  if (!choice.startsWith(VALUE_PREFIX)) return null
  const match = option.options.find((candidate) => valueChoice(candidate.value) === choice)
  return match ? { ...base, value: match.value } : null
}

export function formatClaudeDefault(option: ClaudeConfigOption): string {
  if (option.claudeDefault === null) return 'sem padrão fixo'
  return option.options.find((candidate) => candidate.value === option.claudeDefault)?.label ?? String(option.claudeDefault)
}

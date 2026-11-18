export type ClaudeConfigValue = boolean | string

export type ClaudeConfigOption = {
  key: string
  label: string
  /** `settings`: chave do `--settings`; `global`: do `~/.claude.json` (só com flag ou variável da CLI). */
  source: 'settings' | 'global'
  type: 'boolean' | 'enum'
  options: readonly { value: ClaudeConfigValue; label: string }[]
  /** Padrão do próprio Claude (`null`: sem padrão fixo). */
  claudeDefault: ClaudeConfigValue | null
  editable: boolean
  /** Só nas opções que o app não consegue aplicar. */
  note?: string
  /** Custo ou risco a mostrar junto da opção (modo fast: crédito pago). */
  warning?: string
}

export type ClaudeTerminalDefaultsState = {
  global: Record<string, ClaudeConfigValue>
  /** `null` na conta: usar o padrão do Claude em vez do global. */
  accounts: Record<string, Record<string, ClaudeConfigValue | null>>
}

export type ClaudeTerminalDefaultsChange = {
  key: string
  /** Ausente: padrão global. */
  accountId?: string
  value?: ClaudeConfigValue | null
  clear?: boolean
}

/**
 * Contrato dos plugins e extensões das CLIs (preload `window.felixo.cliPlugins`).
 * Espelha `electron/services/cli-plugins-service.cjs`.
 */

export type CliPluginProvider = 'claude' | 'codex' | 'gemini'

export type CliPluginEntry = {
  /** `nome@marketplace` no Claude e no Codex; só o nome no Gemini. */
  id: string
  name: string
  description: string
  version: string
  marketplace: string
  /** De onde o código vem (repositório, caminho); vazio quando a CLI não informa. */
  origin: string
  installed: boolean
  /** `null` quando a CLI não informa se está ligado. */
  enabled: boolean | null
  /** `user` é o único escopo que o app altera. */
  scope: string | null
}

export type CliPluginCapabilities = {
  available: boolean
  marketplaces: boolean
  toggle: boolean
  update: boolean
  installBySource: boolean
}

export type CliPluginListResult =
  | { ok: false; message?: string }
  | {
      ok: true
      capabilities: CliPluginCapabilities
      installed: CliPluginEntry[]
      available: CliPluginEntry[]
      marketplaces: Array<{ name: string; origin: string }>
    }

export type CliPluginTarget = { providerId: CliPluginProvider; accountId?: string }

export type CliPluginChange = CliPluginTarget & {
  pluginId?: string
  /** Gemini: endereço https do repositório da extensão. */
  source?: string
  enabled?: boolean
  /** Só `true` executa; a interface o envia depois da confirmação da pessoa. */
  confirmed: boolean
}

export type CliPluginChangeResult = { ok: boolean; message?: string; requiresConfirmation?: boolean }

export type CliPluginsBridge = {
  list: (params: CliPluginTarget & { includeAvailable?: boolean }) => Promise<CliPluginListResult>
  install: (params: CliPluginChange) => Promise<CliPluginChangeResult>
  remove: (params: CliPluginChange) => Promise<CliPluginChangeResult>
  setEnabled: (params: CliPluginChange) => Promise<CliPluginChangeResult>
  update: (params: CliPluginChange) => Promise<CliPluginChangeResult>
}

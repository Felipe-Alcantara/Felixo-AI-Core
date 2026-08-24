/** Pre-built prompt ("automation") shared by the chat and the canvas. */

import automationScopes from '../../../../electron/services/storage/automation-scopes.json'

export type AutomationScope =
  | 'chat'
  | 'code'
  | 'docs'
  | 'git'
  | 'notion'
  | 'planning'
  | 'security'

/**
 * Every scope, in the order the pickers show them.
 *
 * A lista vem de `automation-scopes.json`, do lado Electron, e nao de uma copia
 * escrita aqui: ela ja esteve duplicada em quatro lugares que discordavam entre
 * si, e um prompt salvo com um topico que este seletor oferecia era descartado
 * mais adiante sem nenhum aviso. O JSON e a fonte de verdade para o codigo dos
 * dois lados; a uniao `AutomationScope` acima e o `CHECK` do SQLite continuam
 * escritos a mao (TypeScript nao deriva uniao de JSON, e SQL nao le JSON), e um
 * teste de guarda quebra se qualquer um dos tres sair de sintonia.
 */
export const AUTOMATION_SCOPES = automationScopes.scopes as AutomationScope[]

/** Human labels for the scopes, in the app's language. */
export const AUTOMATION_SCOPE_LABELS: Record<AutomationScope, string> = {
  chat: 'Chat',
  code: 'Código',
  docs: 'Docs',
  git: 'Git',
  notion: 'Notion',
  planning: 'Planejamento',
  security: 'Segurança',
}

export type AutomationDefinition = {
  id: string
  name: string
  description: string
  prompt: string
  scope: AutomationScope
  isDefault?: boolean
  createdAt?: string
  updatedAt?: string
}

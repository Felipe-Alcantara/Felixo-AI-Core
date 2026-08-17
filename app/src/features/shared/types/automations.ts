/** Pre-built prompt ("automation") shared by the chat and the canvas. */

export type AutomationScope =
  | 'chat'
  | 'code'
  | 'docs'
  | 'git'
  | 'notion'
  | 'planning'
  | 'security'

/**
 * Every scope, in the order the pickers show them. Single source of truth:
 * the panels used to keep their own copies of this list, so a scope added to
 * the type could compile fine and still be missing from a dropdown.
 */
export const AUTOMATION_SCOPES: AutomationScope[] = [
  'chat',
  'code',
  'docs',
  'git',
  'notion',
  'planning',
  'security',
]

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

/** Pre-built prompt ("automation") shared by the chat and the canvas. */

export type AutomationScope = 'chat' | 'code' | 'docs' | 'git' | 'planning'

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

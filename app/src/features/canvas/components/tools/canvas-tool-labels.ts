import type { CanvasTool } from './CanvasToolsMenu'

/**
 * Rótulo de exibição de cada ferramenta. Módulo próprio (em vez de morar em
 * `CanvasToolPanels.tsx`) porque esse arquivo só pode exportar componentes —
 * uma constante ali quebra o fast refresh (react-refresh/only-export-components).
 */
export const TOOL_LABELS: Record<CanvasTool, string> = {
  search: 'Busca',
  projects: 'Projetos',
  notes: 'Notas',
  models: 'Modelos',
  prompts: 'Prompts',
  skills: 'Skills',
  git: 'Source Control',
  fetchAll: 'Fetch All',
  notionTasks: 'Tarefas Notion',
  agentUsage: 'Limites e uso',
  orchestrator: 'Orquestrador',
  qaLogger: 'QA Logger',
  settings: 'Configurações',
}

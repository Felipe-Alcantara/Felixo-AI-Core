import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { ChatSession } from '../types'
import { AppSidebar } from './AppSidebar'
import { DeleteSessionButton } from './DeleteSessionButton'
import { SearchPanel } from './SearchPanel'

function session(index: number): ChatSession {
  const updatedAt = new Date(Date.UTC(2026, 8, 20 - index, 12)).toISOString()
  return {
    id: `chat-${index}`,
    title: `Conversa ${index}`,
    messages: [],
    createdAt: updatedAt,
    updatedAt,
  }
}

function deleteLabel(title: string) {
  // renderToStaticMarkup escapa as aspas do atributo.
  return `aria-label="Excluir conversa &quot;${title}&quot;"`
}

function countOccurrences(markup: string, fragment: string) {
  return markup.split(fragment).length - 1
}

function renderSidebar(sessions: ChatSession[]) {
  const noop = () => {}
  return renderToStaticMarkup(
    createElement(AppSidebar, {
      models: [],
      sessions,
      projects: [],
      activeProjectIds: new Set<string>(),
      isOpen: true,
      onNewIdea: noop,
      onOpenModelSettings: noop,
      onOpenProjects: noop,
      onOpenAutomations: noop,
      onOpenSkills: noop,
      onOpenCode: noop,
      onOpenExport: noop,
      onOpenFelixoSettings: noop,
      onOpenNotes: noop,
      onOpenOrchestratorSettings: noop,
      onOpenAgentUsage: noop,
      onToggleSidebar: noop,
      onSelectSession: noop,
      onDeleteSession: noop,
      onToggleProject: noop,
      onOpenModelSettingsFor: noop,
      onRemoveModel: noop,
    }),
  )
}

describe('excluir conversa pela interface', () => {
  it('a lixeira entrega a conversa da própria linha para quem exclui', () => {
    const onDelete = vi.fn()
    const target = session(1)
    const button = DeleteSessionButton({ session: target, onDelete }) as ReactElement<{
      onClick: () => void
    }>

    button.props.onClick()

    expect(onDelete).toHaveBeenCalledExactlyOnceWith(target)
  })

  it('cada linha de "Recentes" tem a própria lixeira, com o título no rótulo acessível', () => {
    const markup = renderSidebar([session(1), session(2)])

    // Cada conversa aparece em "Recentes" e na busca (montada, mas oculta).
    expect(countOccurrences(markup, deleteLabel('Conversa 1'))).toBe(2)
    expect(countOccurrences(markup, deleteLabel('Conversa 2'))).toBe(2)
    expect(markup).toContain('title="Excluir conversa"')
  })

  it('conversa além das cinco recentes só se exclui pela busca, e a busca oferece isso', () => {
    const sessions = [1, 2, 3, 4, 5, 6, 7].map(session)
    const sidebarMarkup = renderSidebar(sessions)
    const searchMarkup = renderToStaticMarkup(
      createElement(SearchPanel, {
        sessions,
        isOpen: true,
        onClose: () => {},
        onSelectSession: () => {},
        onDeleteSession: () => {},
      }),
    )

    expect(countOccurrences(sidebarMarkup, deleteLabel('Conversa 5'))).toBe(2)
    expect(countOccurrences(sidebarMarkup, deleteLabel('Conversa 7'))).toBe(1)
    for (const item of sessions) {
      expect(countOccurrences(searchMarkup, deleteLabel(item.title))).toBe(1)
    }
  })
})

/**
 * O arranjo da gaveta: quais agentes estão vivos lado a lado, qual tem o foco e
 * como se dividem. Lógica pura e sem React (o `vitest` do repositório só roda
 * `.ts`; mesmo padrão de `terminal-fit-lifecycle.ts`). O `CanvasView` guarda
 * este estado; o `TerminalDrawer` só o desenha.
 *
 * O painel em foco é o "terminal aberto" do resto do canvas (Prompts, Skills,
 * ditado, dock e notificações): `expandedTerminalId` é derivado de `focused`.
 */

import {
  insertMosaicPane,
  mosaicPaneIds,
  presetMosaic,
  removeMosaicPane,
  replaceMosaicPane,
  setMosaicRatio,
  swapMosaicPanes,
  type MosaicNode,
  type MosaicRect,
} from './terminal-mosaic'

/** Teto de painéis vivos: cada um é um xterm desenhando (renderer DOM, sem WebGL). */
export const MAX_DRAWER_PANES = 8

export type DrawerLayout = 'colunas' | 'linhas' | 'grade'
/** `auto`: mosaico livre (cada agente novo divide o painel ao lado do qual entrou). */
export type DrawerLayoutChoice = 'auto' | DrawerLayout

export type DrawerPanes = {
  /** Ids dos blocos, na ordem de leitura do mosaico. De 1 a `MAX_DRAWER_PANES`. */
  panes: string[]
  /** O mosaico: árvore de divisões cujas folhas são `panes`. */
  tree: MosaicNode
  focused: string
  /** Ids por uso, do mais antigo ao mais recente (último = em foco). */
  recent: string[]
  /** O último arranjo pronto escolhido (o botão aparece marcado); arrastar não o desmarca. */
  layout: DrawerLayoutChoice
  /** O painel em foco ocupa a gaveta inteira; os outros continuam vivos. */
  zoomed: boolean
}

export type DrawerPanesAction =
  /**
   * `sideBySide`: entra no mosaico dividindo `beside` (sem ele, o painel em
   * foco). `area` é o tamanho da gaveta: dela sai o lado mais comprido.
   */
  | { type: 'open'; id: string; sideBySide?: boolean; beside?: string; area?: MosaicRect }
  | { type: 'close-pane'; id: string }
  | { type: 'focus'; id: string }
  | { type: 'set-layout'; layout: DrawerLayoutChoice; area?: MosaicRect }
  | { type: 'toggle-zoom' }
  /** Arrastar a divisória `path` do mosaico. */
  | { type: 'resize'; path: string; ratio: number }
  /** Troca dois painéis de lugar. */
  | { type: 'swap'; a: string; b: string }

const withTree = (state: DrawerPanes, tree: MosaicNode): DrawerPanes => ({ ...state, tree, panes: mosaicPaneIds(tree) })

function touch(recent: string[], id: string): string[] {
  return [...recent.filter((other) => other !== id), id]
}

/** Devolve `null` quando o último painel fecha (a gaveta fecha junto). */
export function reduceDrawerPanes(
  state: DrawerPanes | null,
  action: DrawerPanesAction,
): DrawerPanes | null {
  switch (action.type) {
    case 'open': {
      if (!state) {
        return {
          panes: [action.id],
          tree: { kind: 'pane', id: action.id },
          focused: action.id,
          recent: [action.id],
          layout: 'auto',
          zoomed: false,
        }
      }
      if (state.panes.includes(action.id)) {
        return { ...state, focused: action.id, recent: touch(state.recent, action.id) }
      }
      let tree: MosaicNode
      let recent = state.recent
      if (!action.sideBySide) {
        // Clique comum: o agente entra no lugar do painel em foco (com um painel
        // só, é a troca de sempre), no mesmo pedaço do mosaico.
        tree = replaceMosaicPane(state.tree, state.focused, action.id)
        recent = recent.filter((id) => id !== state.focused)
      } else if (state.panes.length < MAX_DRAWER_PANES) {
        const beside = action.beside && state.panes.includes(action.beside) ? action.beside : state.focused
        tree = insertMosaicPane(state.tree, action.id, { target: beside, area: action.area })
      } else {
        // No teto, sai o painel sem foco usado há mais tempo (o novo fica no lugar dele).
        const victim = state.recent.find((id) => id !== state.focused && state.panes.includes(id))
        const replaced = victim ?? state.panes.find((id) => id !== state.focused)!
        tree = replaceMosaicPane(state.tree, replaced, action.id)
        recent = recent.filter((id) => id !== replaced)
      }
      return { ...withTree(state, tree), focused: action.id, recent: touch(recent, action.id) }
    }
    case 'close-pane': {
      if (!state || !state.panes.includes(action.id)) return state
      const tree = removeMosaicPane(state.tree, action.id)
      if (!tree) return null
      const recent = state.recent.filter((id) => id !== action.id)
      const focused = state.focused === action.id ? recent[recent.length - 1] : state.focused
      const next = withTree(state, tree)
      return { ...next, recent, focused, zoomed: next.panes.length > 1 && state.zoomed }
    }
    case 'focus':
      if (!state || !state.panes.includes(action.id) || state.focused === action.id) return state
      return { ...state, focused: action.id, recent: touch(state.recent, action.id) }
    case 'set-layout': {
      if (!state) return state
      // Repetir o mesmo arranjo também refaz (desfaz o que foi arrastado), exceto o auto sem nada a refazer.
      if (state.layout === action.layout && action.layout === 'auto') return state
      const tree = presetMosaic(state.panes, action.layout, action.area)
      return tree ? { ...withTree(state, tree), layout: action.layout } : state
    }
    case 'toggle-zoom':
      return state && state.panes.length > 1 ? { ...state, zoomed: !state.zoomed } : state
    case 'resize': {
      if (!state) return state
      const tree = setMosaicRatio(state.tree, action.path, action.ratio)
      return tree === state.tree ? state : { ...state, tree }
    }
    case 'swap': {
      if (!state) return state
      const tree = swapMosaicPanes(state.tree, action.a, action.b)
      return tree === state.tree ? state : withTree(state, tree)
    }
  }
}

/** Direção de navegação entre painéis; o vizinho sai da geometria do mosaico (`neighborMosaicPane`). */
export type PaneDirection = 'left' | 'right' | 'up' | 'down'

/** Atalhos do painel (não conflitam com o Alt+↑/↓ do diff do Claude Code). */
export type DrawerPaneShortcut =
  | { type: 'move'; direction: PaneDirection }
  | { type: 'zoom' }

export function drawerPaneShortcut(event: {
  key: string
  altKey: boolean
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
}): DrawerPaneShortcut | null {
  if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) return null
  const direction: Record<string, PaneDirection> = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'up',
    ArrowDown: 'down',
  }
  if (direction[event.key]) return { type: 'move', direction: direction[event.key] }
  return event.key.toLowerCase() === 'z' ? { type: 'zoom' } : null
}

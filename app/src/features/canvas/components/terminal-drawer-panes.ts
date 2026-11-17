/**
 * O arranjo da gaveta: quais agentes estão vivos lado a lado, qual tem o foco e
 * como se dividem. Lógica pura e sem React (o `vitest` do repositório só roda
 * `.ts`; mesmo padrão de `terminal-fit-lifecycle.ts`). O `CanvasView` guarda
 * este estado; o `TerminalDrawer` só o desenha.
 *
 * O painel em foco é o "terminal aberto" do resto do canvas (Prompts, Skills,
 * ditado, dock e notificações): `expandedTerminalId` é derivado de `focused`.
 */

/** Teto de painéis vivos: cada um é um xterm desenhando. */
export const MAX_DRAWER_PANES = 4

/** Largura mínima de um painel lado a lado (a TUI do Claude Code pede ~80 colunas). */
export const MIN_PANE_WIDTH = 440

export type DrawerLayout = 'colunas' | 'linhas' | 'grade'
/** `auto`: 2 painéis em colunas, 3 ou 4 em grade 2x2. */
export type DrawerLayoutChoice = 'auto' | DrawerLayout

export type DrawerPanes = {
  /** Ids dos blocos, na ordem de exibição. De 1 a `MAX_DRAWER_PANES`. */
  panes: string[]
  focused: string
  /** Ids por uso, do mais antigo ao mais recente (último = em foco). */
  recent: string[]
  layout: DrawerLayoutChoice
  /** O painel em foco ocupa a gaveta inteira; os outros continuam vivos. */
  zoomed: boolean
}

export type DrawerPanesAction =
  | { type: 'open'; id: string; sideBySide?: boolean }
  | { type: 'close-pane'; id: string }
  | { type: 'focus'; id: string }
  | { type: 'set-layout'; layout: DrawerLayoutChoice }
  | { type: 'toggle-zoom' }

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
        return { panes: [action.id], focused: action.id, recent: [action.id], layout: 'auto', zoomed: false }
      }
      if (state.panes.includes(action.id)) {
        return { ...state, focused: action.id, recent: touch(state.recent, action.id) }
      }
      let panes: string[]
      let recent = state.recent
      if (!action.sideBySide) {
        // Clique comum: o agente entra no lugar do painel em foco (com um painel
        // só, é a troca de sempre).
        panes = state.panes.map((id) => (id === state.focused ? action.id : id))
        recent = recent.filter((id) => id !== state.focused)
      } else if (state.panes.length < MAX_DRAWER_PANES) {
        panes = [...state.panes, action.id]
      } else {
        // No teto, sai o painel sem foco usado há mais tempo.
        const victim = state.recent.find((id) => id !== state.focused && state.panes.includes(id))
        const replaced = victim ?? state.panes.find((id) => id !== state.focused)!
        panes = state.panes.map((id) => (id === replaced ? action.id : id))
        recent = recent.filter((id) => id !== replaced)
      }
      return { ...state, panes, focused: action.id, recent: touch(recent, action.id) }
    }
    case 'close-pane': {
      if (!state || !state.panes.includes(action.id)) return state
      const panes = state.panes.filter((id) => id !== action.id)
      if (panes.length === 0) return null
      const recent = state.recent.filter((id) => id !== action.id)
      const focused = state.focused === action.id ? recent[recent.length - 1] : state.focused
      return { ...state, panes, recent, focused, zoomed: panes.length > 1 && state.zoomed }
    }
    case 'focus':
      if (!state || !state.panes.includes(action.id) || state.focused === action.id) return state
      return { ...state, focused: action.id, recent: touch(state.recent, action.id) }
    case 'set-layout':
      return state && state.layout !== action.layout ? { ...state, layout: action.layout } : state
    case 'toggle-zoom':
      return state && state.panes.length > 1 ? { ...state, zoomed: !state.zoomed } : state
  }
}

export type DrawerGeometry = {
  cols: number
  rows: number
  /** Pediu lado a lado, mas a largura não comporta: os painéis empilham. */
  stacked: boolean
}

/** Grade em que os painéis são desenhados, pela largura que a gaveta tem. */
export function resolveDrawerGeometry(
  state: Pick<DrawerPanes, 'layout' | 'zoomed'> & { count: number },
  widthPx: number,
): DrawerGeometry {
  const { count } = state
  if (count <= 1 || state.zoomed) return { cols: 1, rows: 1, stacked: false }
  const layout: DrawerLayout =
    state.layout === 'auto' ? (count === 2 ? 'colunas' : 'grade') : state.layout
  const wantedCols = layout === 'colunas' ? count : layout === 'grade' ? 2 : 1
  if (wantedCols > 1 && widthPx / wantedCols < MIN_PANE_WIDTH) {
    return { cols: 1, rows: count, stacked: true }
  }
  return { cols: wantedCols, rows: Math.ceil(count / wantedCols), stacked: false }
}

export type PaneDirection = 'left' | 'right' | 'up' | 'down'

/**
 * Painel vizinho na direção pedida, na ordem em que a grade os desenha. Sem
 * vizinho, devolve o próprio (não dá a volta, como o `select-pane -L` do tmux).
 * Num painel último e sozinho na linha (grade com 3), ele cobre as duas colunas.
 */
export function neighborPane(
  ids: string[],
  cols: number,
  current: string,
  direction: PaneDirection,
): string {
  const index = ids.indexOf(current)
  if (index === -1 || ids.length <= 1) return current
  const lastRow = Math.floor((ids.length - 1) / cols)
  const spansRow = index === ids.length - 1 && index % cols === 0 && cols > 1
  const row = Math.floor(index / cols)
  const col = index % cols
  let target = index
  if (direction === 'left') target = spansRow || col === 0 ? index : index - 1
  if (direction === 'right') target = spansRow || index + 1 >= ids.length || col === cols - 1 ? index : index + 1
  if (direction === 'up') target = row === 0 ? index : index - cols
  if (direction === 'down') {
    if (row >= lastRow) target = index
    else target = index + cols >= ids.length ? ids.length - 1 : index + cols
  }
  return ids[target] ?? current
}

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

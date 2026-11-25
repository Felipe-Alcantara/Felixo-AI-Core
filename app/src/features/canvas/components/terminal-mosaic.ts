/**
 * Mosaico de terminais, no modelo dos gerenciadores de janela "tiling" do Linux
 * (i3, bspwm, sway): os painéis são as folhas de uma árvore de divisões, e a
 * área inteira é sempre ocupada — não existe célula vazia. Cada divisão guarda
 * só a direção e a proporção, então redimensionar é mudar um número e a mesma
 * árvore serve para qualquer tamanho de gaveta.
 *
 * Lógica pura e sem React (mesmo padrão de `terminal-drawer-panes.ts`).
 */

/** `row`: os dois lados ficam lado a lado (divisória vertical). `column`: um em cima do outro. */
export type MosaicDirection = 'row' | 'column'

export type MosaicNode =
  | { kind: 'pane'; id: string }
  | { kind: 'split'; direction: MosaicDirection; ratio: number; first: MosaicNode; second: MosaicNode }

export type MosaicRect = { x: number; y: number; width: number; height: number }

export type MosaicPaneRect = MosaicRect & { id: string }

export type MosaicDivider = {
  /** Caminho até a divisão: 'f'/'s' por nível (primeiro/segundo filho); '' é a raiz. */
  path: string
  direction: MosaicDirection
  /** A faixa arrastável entre os dois lados. */
  rect: MosaicRect
  /** A área que a divisão reparte: é contra ela que o arrasto vira proporção. */
  area: MosaicRect
  ratio: number
  /** O primeiro agente de cada lado: dá nome à divisória ("entre X e Y"). */
  before: string
  after: string
}

/** Abaixo disto a TUI das CLIs quebra; o arrasto e os presets respeitam o piso quando a área comporta. */
export const MOSAIC_MIN_PANE = { width: 240, height: 120 }

/** Espessura da faixa entre painéis (a área de arrasto). */
export const MOSAIC_DIVIDER = 6

const MIN_RATIO = 0.1
const MAX_RATIO = 0.9

export type MosaicPreset = 'auto' | 'colunas' | 'linhas' | 'grade'

const pane = (id: string): MosaicNode => ({ kind: 'pane', id })

const split = (direction: MosaicDirection, ratio: number, first: MosaicNode, second: MosaicNode): MosaicNode => ({
  kind: 'split',
  direction,
  ratio,
  first,
  second,
})

/** Ids na ordem de leitura (esquerda para a direita, de cima para baixo). */
export function mosaicPaneIds(tree: MosaicNode | null): string[] {
  if (!tree) return []
  return tree.kind === 'pane' ? [tree.id] : [...mosaicPaneIds(tree.first), ...mosaicPaneIds(tree.second)]
}

function splitArea(area: MosaicRect, direction: MosaicDirection, ratio: number, divider: number) {
  if (direction === 'row') {
    const usable = Math.max(0, area.width - divider)
    const firstWidth = Math.round(usable * ratio)
    return {
      first: { x: area.x, y: area.y, width: firstWidth, height: area.height },
      gap: { x: area.x + firstWidth, y: area.y, width: divider, height: area.height },
      second: { x: area.x + firstWidth + divider, y: area.y, width: usable - firstWidth, height: area.height },
    }
  }
  const usable = Math.max(0, area.height - divider)
  const firstHeight = Math.round(usable * ratio)
  return {
    first: { x: area.x, y: area.y, width: area.width, height: firstHeight },
    gap: { x: area.x, y: area.y + firstHeight, width: area.width, height: divider },
    second: { x: area.x, y: area.y + firstHeight + divider, width: area.width, height: usable - firstHeight },
  }
}

/**
 * Onde cada painel e cada divisória ficam dentro de `area`. Os retângulos dos
 * painéis e das faixas cobrem a área inteira, sem sobra e sem sobreposição.
 */
export function layoutMosaic(
  tree: MosaicNode | null,
  area: MosaicRect,
  divider = MOSAIC_DIVIDER,
): { panes: MosaicPaneRect[]; dividers: MosaicDivider[] } {
  const panes: MosaicPaneRect[] = []
  const dividers: MosaicDivider[] = []
  const walk = (node: MosaicNode, rect: MosaicRect, path: string) => {
    if (node.kind === 'pane') {
      panes.push({ id: node.id, ...rect })
      return
    }
    const parts = splitArea(rect, node.direction, node.ratio, divider)
    dividers.push({
      path,
      direction: node.direction,
      rect: parts.gap,
      area: rect,
      ratio: node.ratio,
      before: mosaicPaneIds(node.first)[0],
      after: mosaicPaneIds(node.second)[0],
    })
    walk(node.first, parts.first, `${path}f`)
    walk(node.second, parts.second, `${path}s`)
  }
  if (tree) walk(tree, area, '')
  return { panes, dividers }
}

/** Lado mais comprido manda, como no bspwm: área larga divide lado a lado, alta divide em pilha. */
function directionFor(rect: MosaicRect): MosaicDirection {
  return rect.width >= rect.height ? 'row' : 'column'
}

function mapPane(tree: MosaicNode, id: string, fn: (leaf: MosaicNode) => MosaicNode): MosaicNode {
  if (tree.kind === 'pane') return tree.id === id ? fn(tree) : tree
  const first = mapPane(tree.first, id, fn)
  const second = mapPane(tree.second, id, fn)
  return first === tree.first && second === tree.second ? tree : { ...tree, first, second }
}

/**
 * Põe `id` no mosaico dividindo o painel `target` ao meio (sem alvo: o maior
 * painel). O novo fica à direita ou embaixo. `area` é o tamanho da gaveta: dela
 * sai o lado mais comprido do alvo; sem ela, a divisão alterna pela profundidade.
 */
export function insertMosaicPane(
  tree: MosaicNode | null,
  id: string,
  { target, area }: { target?: string; area?: MosaicRect } = {},
): MosaicNode {
  if (!tree) return pane(id)
  if (mosaicPaneIds(tree).includes(id)) return tree
  const reference = area ?? { x: 0, y: 0, width: 1600, height: 900 }
  const rects = layoutMosaic(tree, reference).panes
  const alvo =
    rects.find((rect) => rect.id === target) ??
    [...rects].sort((a, b) => b.width * b.height - a.width * a.height)[0]
  return mapPane(tree, alvo.id, (leaf) => split(directionFor(alvo), 0.5, leaf, pane(id)))
}

/** Tira o painel; o irmão dele herda o espaço inteiro da divisão. `null` quando era o último. */
export function removeMosaicPane(tree: MosaicNode | null, id: string): MosaicNode | null {
  if (!tree) return null
  if (tree.kind === 'pane') return tree.id === id ? null : tree
  const first = removeMosaicPane(tree.first, id)
  const second = removeMosaicPane(tree.second, id)
  if (!first) return second
  if (!second) return first
  return first === tree.first && second === tree.second ? tree : { ...tree, first, second }
}

/** O agente `next` ocupa o lugar exato de `current` (mesma divisão, mesmo tamanho). */
export function replaceMosaicPane(tree: MosaicNode, current: string, next: string): MosaicNode {
  if (mosaicPaneIds(tree).includes(next)) return tree
  return mapPane(tree, current, () => pane(next))
}

/** Troca dois painéis de lugar (arrastar um sobre o outro, ou Alt+Shift+seta com Ctrl). */
export function swapMosaicPanes(tree: MosaicNode, a: string, b: string): MosaicNode {
  if (a === b) return tree
  const ids = mosaicPaneIds(tree)
  if (!ids.includes(a) || !ids.includes(b)) return tree
  const walk = (node: MosaicNode): MosaicNode => {
    if (node.kind === 'pane') return node.id === a ? pane(b) : node.id === b ? pane(a) : node
    return { ...node, first: walk(node.first), second: walk(node.second) }
  }
  return walk(tree)
}

/**
 * Proporção que o arrasto pede para a divisão em `path`, já presa ao intervalo
 * em que os dois lados mantêm o piso (`MOSAIC_MIN_PANE`). Se a área não comporta
 * o piso dos dois lados, divide ao meio.
 */
export function clampMosaicRatio(divider: Pick<MosaicDivider, 'direction' | 'area'>, ratio: number, size = MOSAIC_DIVIDER): number {
  const length = (divider.direction === 'row' ? divider.area.width : divider.area.height) - size
  const floor = divider.direction === 'row' ? MOSAIC_MIN_PANE.width : MOSAIC_MIN_PANE.height
  if (length <= 0) return 0.5
  const min = Math.max(MIN_RATIO, floor / length)
  const max = Math.min(MAX_RATIO, 1 - floor / length)
  if (min > max) return 0.5
  return Math.min(max, Math.max(min, ratio))
}

export function setMosaicRatio(tree: MosaicNode, path: string, ratio: number): MosaicNode {
  const walk = (node: MosaicNode, rest: string): MosaicNode => {
    if (node.kind === 'pane') return node
    if (rest === '') return node.ratio === ratio ? node : { ...node, ratio }
    const [step, ...tail] = rest
    const next = tail.join('')
    return step === 'f' ? { ...node, first: walk(node.first, next) } : { ...node, second: walk(node.second, next) }
  }
  return walk(tree, path)
}

/** Fileira de painéis do mesmo tamanho na direção dada (proporções 1/n, 1/(n-1)...). */
function chain(ids: string[], direction: MosaicDirection): MosaicNode {
  if (ids.length === 1) return pane(ids[0])
  return split(direction, 1 / ids.length, pane(ids[0]), chain(ids.slice(1), direction))
}

function chainNodes(nodes: MosaicNode[], direction: MosaicDirection): MosaicNode {
  if (nodes.length === 1) return nodes[0]
  return split(direction, 1 / nodes.length, nodes[0], chainNodes(nodes.slice(1), direction))
}

/**
 * Monta a árvore de um arranjo pronto. `grade` usa ⌈√n⌉ colunas e a última
 * linha estica os painéis que sobram (3 agentes: dois em cima, um embaixo na
 * largura toda) — nunca deixa célula vazia. `auto` repete a entrada um a um,
 * dividindo sempre o maior painel.
 */
export function presetMosaic(ids: string[], preset: MosaicPreset, area?: MosaicRect): MosaicNode | null {
  if (ids.length === 0) return null
  if (preset === 'colunas') return chain(ids, 'row')
  if (preset === 'linhas') return chain(ids, 'column')
  if (preset === 'grade') {
    const cols = Math.ceil(Math.sqrt(ids.length))
    const rows: MosaicNode[] = []
    for (let start = 0; start < ids.length; start += cols) rows.push(chain(ids.slice(start, start + cols), 'row'))
    return chainNodes(rows, 'column')
  }
  let tree: MosaicNode | null = null
  for (const id of ids) tree = insertMosaicPane(tree, id, { area })
  return tree
}

export type MosaicMove = 'left' | 'right' | 'up' | 'down'

/**
 * O painel vizinho na direção pedida, pela geometria (como o `focus left` do
 * i3): entre os que encostam naquele lado, o que mais se sobrepõe. Sem vizinho,
 * devolve o próprio (não dá a volta).
 */
export function neighborMosaicPane(
  tree: MosaicNode,
  area: MosaicRect,
  current: string,
  direction: MosaicMove,
): string {
  const { panes } = layoutMosaic(tree, area)
  const from = panes.find((rect) => rect.id === current)
  if (!from) return current
  const tolerance = MOSAIC_DIVIDER + 2
  const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0))
  let best: { id: string; score: number } | null = null
  for (const rect of panes) {
    if (rect.id === current) continue
    const horizontal = direction === 'left' || direction === 'right'
    const gap = horizontal
      ? direction === 'left'
        ? from.x - (rect.x + rect.width)
        : rect.x - (from.x + from.width)
      : direction === 'up'
        ? from.y - (rect.y + rect.height)
        : rect.y - (from.y + from.height)
    const touches = gap >= 0 && gap <= tolerance
    const score = horizontal
      ? overlap(from.y, from.y + from.height, rect.y, rect.y + rect.height)
      : overlap(from.x, from.x + from.width, rect.x, rect.x + rect.width)
    if (touches && score > 0 && (!best || score > best.score)) best = { id: rect.id, score }
  }
  return best?.id ?? current
}

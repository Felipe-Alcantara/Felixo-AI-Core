// Dimensionamento dos painéis e dos blocos do canvas em função da tela.
//
// Os tamanhos eram escritos em pixels fixos, calibrados para um monitor
// grande: num notebook de 1366x768 o painel de prompts sozinho ocupava 51% da
// largura e sobrava pouco canvas para trabalhar. Aqui a medida vira uma
// fração do viewport com piso e teto — encolhe na tela pequena e mantém o
// tamanho de hoje na grande.
//
// Segue a forma dos helpers da gaveta do terminal (`terminal-drawer-pin.ts`),
// que já resolvia isso para um painel só: funções puras, clamp que nunca
// inverte o intervalo e preferência lida do armazenamento com validação.

/** Faixas de largura por porte de painel. */
export type PanelSize = 'sm' | 'md' | 'lg' | 'xl'

type PanelSpec = { fraction: number; min: number; max: number }

const PANEL_SPECS: Record<PanelSize, PanelSpec> = {
  sm: { fraction: 0.24, min: 260, max: 380 },
  md: { fraction: 0.3, min: 300, max: 440 },
  lg: { fraction: 0.34, min: 340, max: 520 },
  xl: { fraction: 0.4, min: 380, max: 700 },
}

/**
 * Espaço que o painel nunca ocupa: a coluna da barra de ferramentas mais uma
 * faixa de canvas visível. Sem isso, numa tela estreita o painel cobriria o
 * quadro inteiro e a pessoa perderia a referência do que está editando.
 */
const CANVAS_RESERVE = 340

const STORAGE_PREFIX = 'felixo:canvas-panel-width:'

/** Maior largura que ainda deixa canvas visível ao lado. */
export function getPanelMaxWidth(
  viewportWidth: number,
  size: PanelSize,
  reserve = CANVAS_RESERVE,
): number {
  const spec = PANEL_SPECS[size]
  return Math.max(
    Math.min(spec.min, viewportWidth),
    Math.min(spec.max, viewportWidth - reserve),
  )
}

/** Largura sugerida para o viewport atual, antes de qualquer arrasto. */
export function getDefaultPanelWidth(
  viewportWidth: number,
  size: PanelSize,
  reserve = CANVAS_RESERVE,
): number {
  const spec = PANEL_SPECS[size]
  return clampPanelWidth(
    Math.round(viewportWidth * spec.fraction),
    viewportWidth,
    size,
    reserve,
  )
}

/** Clampa sem criar intervalo invertido quando a tela é menor que o mínimo. */
export function clampPanelWidth(
  width: number,
  viewportWidth: number,
  size: PanelSize,
  reserve = CANVAS_RESERVE,
): number {
  const maxWidth = getPanelMaxWidth(viewportWidth, size, reserve)
  const minWidth = Math.min(PANEL_SPECS[size].min, maxWidth)
  return Math.min(Math.max(Math.round(width), minWidth), maxWidth)
}

/**
 * Largura salva por painel. Um valor fora da faixa atual — porque a pessoa
 * arrastou num monitor grande e depois abriu no notebook — é trazido para
 * dentro dela em vez de descartado ou aplicado como está.
 */
export function readPanelWidth(
  storage: Pick<Storage, 'getItem'>,
  panelId: string,
  viewportWidth: number,
  size: PanelSize,
  reserve = CANVAS_RESERVE,
): number {
  let stored: number

  try {
    stored = Number(storage.getItem(`${STORAGE_PREFIX}${panelId}`))
  } catch {
    return getDefaultPanelWidth(viewportWidth, size, reserve)
  }

  if (!Number.isFinite(stored) || stored <= 0) {
    return getDefaultPanelWidth(viewportWidth, size, reserve)
  }

  return clampPanelWidth(stored, viewportWidth, size, reserve)
}

export function writePanelWidth(
  storage: Pick<Storage, 'setItem'>,
  panelId: string,
  width: number,
): void {
  try {
    storage.setItem(`${STORAGE_PREFIX}${panelId}`, String(Math.round(width)))
  } catch {
    // Sem armazenamento o painel só perde a memória do arrasto entre sessões.
  }
}

/** Diz se a pessoa já arrastou este painel alguma vez. */
export function hasPanelWidth(
  storage: Pick<Storage, 'getItem'>,
  panelId: string,
): boolean {
  try {
    return storage.getItem(`${STORAGE_PREFIX}${panelId}`) !== null
  } catch {
    return false
  }
}

export function clearPanelWidth(
  storage: Pick<Storage, 'removeItem'>,
  panelId: string,
): void {
  try {
    storage.removeItem(`${STORAGE_PREFIX}${panelId}`)
  } catch {
    // Idem: falhar aqui não impede o painel de voltar ao tamanho sugerido.
  }
}

/**
 * Altura máxima do painel, deixando o topo e o rodapé livres.
 *
 * Antes era `80vh` a partir de 64px do topo, o que em 768px de tela encostava
 * nos dois extremos ao mesmo tempo.
 */
const PANEL_TOP_OFFSET = 64
const PANEL_BOTTOM_MARGIN = 48

export function getPanelMaxHeight(viewportHeight: number): number {
  return Math.max(240, viewportHeight - PANEL_TOP_OFFSET - PANEL_BOTTOM_MARGIN)
}

/**
 * Fator aplicado ao tamanho padrão dos blocos do canvas.
 *
 * Um bloco de terminal de 520x360 ocupa metade da altura útil de um notebook
 * de 768px. A referência é a tela para a qual os números foram escritos; o
 * piso evita que em telas muito pequenas o bloco nasça ilegível.
 */
const NODE_REFERENCE_WIDTH = 1600
const MIN_NODE_SCALE = 0.72

export function getNodeSizeScale(viewportWidth: number): number {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) {
    return 1
  }

  return Math.min(1, Math.max(MIN_NODE_SCALE, viewportWidth / NODE_REFERENCE_WIDTH))
}

export function scaleNodeSize(
  size: { width: number; height: number },
  viewportWidth: number,
): { width: number; height: number } {
  const scale = getNodeSizeScale(viewportWidth)

  return {
    width: Math.round(size.width * scale),
    height: Math.round(size.height * scale),
  }
}

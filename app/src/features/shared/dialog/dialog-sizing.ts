// Tamanho dos modais redimensionáveis. Funções puras (sem React nem DOM) para
// ter teste em vez de revisão visual.
//
// O modal é centralizado no viewport, então arrastar uma borda por `dx` só
// mantém a borda sob o ponteiro se o modal crescer `2 * dx` — a borda oposta
// anda o mesmo tanto para o outro lado.

export type DialogSize = { width: number; height: number }

/** Folga que o modal sempre deixa até a borda da janela. */
export const DIALOG_VIEWPORT_MARGIN = 16
export const DIALOG_MIN_WIDTH = 320
export const DIALOG_MIN_HEIGHT = 240

const STORAGE_PREFIX = 'felixo:dialog-size:'

type Viewport = { width: number; height: number }

function bounds(viewport: Viewport) {
  const maxWidth = Math.max(0, viewport.width - 2 * DIALOG_VIEWPORT_MARGIN)
  const maxHeight = Math.max(0, viewport.height - 2 * DIALOG_VIEWPORT_MARGIN)
  return {
    maxWidth,
    maxHeight,
    // O piso nunca passa do teto: em janela minúscula o teto vence.
    minWidth: Math.min(DIALOG_MIN_WIDTH, maxWidth),
    minHeight: Math.min(DIALOG_MIN_HEIGHT, maxHeight),
  }
}

/** Traz o tamanho para dentro de [mínimo, janela − folga] nos dois eixos. */
export function clampDialogSize(size: DialogSize, viewport: Viewport): DialogSize {
  const b = bounds(viewport)
  return {
    width: Math.min(Math.max(Math.round(size.width), b.minWidth), b.maxWidth),
    height: Math.min(Math.max(Math.round(size.height), b.minHeight), b.maxHeight),
  }
}

export type DialogAxes = { horizontal: boolean; vertical: boolean }

/** Tamanho depois de arrastar por (dx, dy) a partir de `start`, com o modal centralizado. */
export function resizeCentered(
  start: DialogSize,
  delta: { dx: number; dy: number },
  axes: DialogAxes,
  viewport: Viewport,
): DialogSize {
  return clampDialogSize(
    {
      width: axes.horizontal ? start.width + 2 * delta.dx : start.width,
      height: axes.vertical ? start.height + 2 * delta.dy : start.height,
    },
    viewport,
  )
}

/** Tamanho salvo do modal, ou `null` se a pessoa nunca o ajustou. */
export function readDialogSize(
  storage: Pick<Storage, 'getItem'>,
  dialogId: string,
  viewport: Viewport,
): DialogSize | null {
  try {
    const raw = storage.getItem(`${STORAGE_PREFIX}${dialogId}`)
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const { width, height } = parsed as Partial<DialogSize>
    if (!Number.isFinite(width) || !Number.isFinite(height)) return null
    if ((width as number) <= 0 || (height as number) <= 0) return null
    return clampDialogSize({ width: width as number, height: height as number }, viewport)
  } catch {
    return null
  }
}

export function writeDialogSize(
  storage: Pick<Storage, 'setItem'>,
  dialogId: string,
  size: DialogSize,
): void {
  try {
    storage.setItem(
      `${STORAGE_PREFIX}${dialogId}`,
      JSON.stringify({ width: Math.round(size.width), height: Math.round(size.height) }),
    )
  } catch {
    // Sem armazenamento o modal só perde a memória do tamanho entre sessões.
  }
}

export function clearDialogSize(storage: Pick<Storage, 'removeItem'>, dialogId: string): void {
  try {
    storage.removeItem(`${STORAGE_PREFIX}${dialogId}`)
  } catch {
    // Falhar aqui não impede o modal de voltar ao tamanho original.
  }
}

/**
 * Depois de soltar o mouse fora do modal, o navegador dispara um `click` no
 * fundo, e o fundo fecha o modal. Este guarda engole esse único clique.
 * Devolve a função que o desarma (também chamada sozinha após `windowMs`).
 */
export function swallowNextClick(
  target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>,
  schedule: (fn: () => void, ms: number) => unknown = (fn, ms) => setTimeout(fn, ms),
  cancel: (handle: unknown) => void = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  windowMs = 250,
): () => void {
  const state: { handle?: unknown } = {}
  const disarm = () => {
    target.removeEventListener('click', onClick, true)
    cancel(state.handle)
  }
  function onClick(event: Event) {
    event.stopPropagation()
    event.preventDefault()
    disarm()
  }
  target.addEventListener('click', onClick, true)
  state.handle = schedule(disarm, windowMs)
  return disarm
}

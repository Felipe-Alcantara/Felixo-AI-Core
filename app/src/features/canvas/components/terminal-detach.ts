import { abrirJanelaAuxiliar, clonarEstilos } from '../../shared/janelas/multijanela'
import { attachTerminalFitLifecycle, type TerminalFitStore } from './terminal-fit-lifecycle'

/**
 * Terminal numa janela própria. O xterm vivo troca de hospedeiro com `moveTo`
 * (nunca `remove()`, que mataria o PTY): PID, histórico e digitação continuam
 * os mesmos. A janela é auxiliar (mesmo renderer), então não há `window.felixo`
 * nela: quem desenha é o renderer da principal.
 */

export type DetachStore = TerminalFitStore & { moveTo: (sessionId: string, container: HTMLElement) => boolean }

/** `janela`: janela comum ao lado do app. `pip`: pequena, sempre no topo, visível com o app na bandeja. */
export type DetachMode = 'janela' | 'pip'

export type DetachedTerminal = {
  modo: DetachMode
  container: HTMLElement
  /** Move o terminal de volta para o painel e fecha a janela. */
  bringBack: () => void
  /** Refaz o encaixe na janela (depois de um Reiniciar, que troca o xterm). */
  rebind: () => void
  /** Fecha a janela sem mover o terminal (o painel foi desmontado). */
  discard: () => void
}

export type DetachOptions = {
  sessionId: string
  title: string
  modo?: DetachMode
  store: DetachStore
  /** Onde o terminal mora quando não está destacado (o encaixe do painel). */
  getHome: () => HTMLElement | null
  /** A janela foi fechada por fora (X da janela): o terminal já voltou ao painel. */
  onClosed: () => void
  open?: (id: string) => Window | null
}

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32) || 'terminal'

/**
 * O id da janela auxiliar deste terminal: o mesmo nome reaproveita a mesma janela.
 * O prefixo `pip-` é o que o processo principal lê para abrir pequena e sempre no topo.
 */
export const auxIdDoTerminal = (sessionId: string, modo: DetachMode = 'janela') =>
  `${modo === 'pip' ? 'pip' : 't'}-${slug(sessionId)}`

/** Abre a janela do terminal; devolve null se o processo principal negou. */
export function detachTerminal({
  sessionId,
  title,
  modo = 'janela',
  store,
  getHome,
  onClosed,
  open = abrirJanelaAuxiliar,
}: DetachOptions): DetachedTerminal | null {
  const win = open(auxIdDoTerminal(sessionId, modo))
  if (!win) return null

  const doc = win.document
  doc.title = modo === 'pip' ? `${title} — picture-in-picture` : `${title} — Felixo AI Core`
  doc.body.style.cssText = 'margin:0;overflow:hidden;background:#0a0a0a'
  const stopStyles = clonarEstilos(document, doc)

  const container = doc.createElement('div')
  container.setAttribute('data-felixo-terminal-mount', '')
  container.style.cssText = `box-sizing:border-box;height:100vh;width:100vw;padding:${modo === 'pip' ? '2px' : '4px 4px 8px'}`
  doc.body.appendChild(container)

  // O encaixe usa o rAF e o ResizeObserver da janela onde o terminal está.
  const stopFit = attachTerminalFitLifecycle(container, store, sessionId, {
    requestAnimationFrame: win.requestAnimationFrame.bind(win),
    cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
    ResizeObserverImpl: (win as Window & { ResizeObserver: typeof ResizeObserver }).ResizeObserver,
  })

  let finished = false
  const sendHome = () => {
    const home = getHome()
    if (home) store.moveTo(sessionId, home)
  }
  const finish = () => {
    if (finished) return false
    finished = true
    win.removeEventListener('pagehide', onGone)
    stopFit()
    stopStyles()
    return true
  }
  // `pagehide` ainda vê o documento vivo: dá tempo de tirar o xterm de lá.
  function onGone() {
    if (!finish()) return
    sendHome()
    onClosed()
  }
  win.addEventListener('pagehide', onGone)

  return {
    modo,
    container,
    bringBack() {
      if (!finish()) return
      sendHome()
      win.close()
    },
    rebind() {
      if (finished) return
      store.moveTo(sessionId, container)
      store.fit(sessionId)
    },
    discard() {
      if (!finish()) return
      win.close()
    },
  }
}

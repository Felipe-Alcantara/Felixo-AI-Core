import { EXTERNAL_WEB_SCHEMES, classifyExternalUrl } from '../../shared/external-url-policy'
import { describeLinkDestination } from '../../shared/links/link-destination'
import { isTouchGesture } from '../../shared/links/link-chooser-menu'
import { exceedsDragThreshold, type PointerPosition } from './terminal-mouse-selection'

/**
 * Links vindos da saída de uma CLI não são conteúdo confiável. O terminal
 * nunca abre um link sozinho: o gesto (Ctrl/Cmd+clique, um toque ou o clique
 * direito) só abre o menu que pergunta para onde ir (navegador, Página Web ou
 * copiar), com o destino escrito.
 *
 * Vale para os dois jeitos de um link aparecer: texto que parece URL
 * (WebLinksAddon) e hyperlink OSC 8, em que o texto exibido e o destino são
 * coisas diferentes. A regra é a de `external-url-policy`, restrita a página
 * web — a mesma que o processo principal aplica de novo antes de abrir.
 */
export function isAllowedTerminalExternalLink(uri: string): boolean {
  return classifyExternalUrl(uri, EXTERNAL_WEB_SCHEMES).ok
}

export function hasTerminalLinkModifier(event: Pick<MouseEvent, 'ctrlKey' | 'metaKey'>): boolean {
  return event.ctrlKey !== event.metaKey
}

/**
 * Só o botão principal conta. O xterm ativa o link no mouseup de qualquer
 * botão, então Ctrl+clique direito (que já abre o menu pelo `contextmenu`) ou
 * Ctrl+clique do meio pediriam o menu duas vezes, ou num botão que ninguém
 * usa para isso. `button` ausente conta como principal: é o que um evento
 * sintético sem botão quer dizer.
 */
function isPrimaryButton(event: Pick<MouseEvent, 'button'>): boolean {
  return (event.button ?? 0) === 0
}

type TerminalLinkGestureEvent = Pick<MouseEvent, 'ctrlKey' | 'metaKey' | 'button'> & {
  pointerType?: string
  sourceCapabilities?: { firesTouchEvents?: boolean } | null
}

/**
 * O gesto sobre o link pede o menu de destino? Ctrl/Cmd+clique com o botão
 * principal, ou um toque: um dedo não tem Ctrl, e sem isto um link do
 * terminal nunca abriria numa tela sensível ao toque. Um clique simples de
 * mouse continua sendo do terminal (foco, seleção, mouse das CLIs de tela
 * cheia).
 */
export function isTerminalLinkGesture(event: TerminalLinkGestureEvent): boolean {
  if (!isPrimaryButton(event)) return false
  return hasTerminalLinkModifier(event) || isTouchGesture(event)
}

/**
 * O gesto que terminou sobre o link foi arrasto, e não clique?
 *
 * O xterm ativa o link no `mouseup` sempre que o botão desceu e subiu sobre o
 * mesmo link — inclusive num Ctrl+arrastar que só queria selecionar parte da
 * URL. Quem responde é a distância entre onde o botão desceu e onde subiu, com
 * o mesmo limiar da seleção por mouse (`exceedsDragThreshold`).
 *
 * Não serve perguntar se há seleção: depois de um clique simples, o
 * Ctrl+clique seguinte chega com `detail=2`, o xterm seleciona a palavra (a
 * própria URL) e no `mouseup` já existe seleção — um Ctrl+clique legítimo
 * seria recusado. Sem ponto de origem conhecido, conta como clique: os outros
 * portões (modificador, botão principal) continuam valendo.
 */
export function isTerminalLinkDragGesture(
  origin: PointerPosition | undefined,
  release: PointerPosition,
): boolean {
  return origin !== undefined && exceedsDragThreshold(origin, release)
}

const MAX_HOVER_URL_CHARS = 160
const HOVER_HINT = 'Ctrl/Cmd+clique ou clique direito: escolher onde abrir'

/**
 * Dica mostrada sobre um link do terminal. Traz o destino de verdade porque,
 * num hyperlink OSC 8, o texto na tela pode dizer `https://banco.com` e levar
 * a outro lugar. Link recusado diz o motivo, em vez de só "recusado".
 */
export function describeTerminalLinkHover(uri: string): string {
  const destination = describeLinkDestination(uri, 'terminal')
  if (!destination.ok) {
    return `Link recusado: ${destination.reason}\nClique direito: copiar`
  }

  const shown =
    destination.url.length > MAX_HOVER_URL_CHARS
      ? `${destination.url.slice(0, MAX_HOVER_URL_CHARS - 1)}…`
      : destination.url
  return `${shown}\n${HOVER_HINT}`
}

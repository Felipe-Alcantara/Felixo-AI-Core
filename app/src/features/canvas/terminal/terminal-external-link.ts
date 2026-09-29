import {
  EXTERNAL_WEB_SCHEMES,
  classifyExternalUrl,
} from '../../shared/external-url-policy'
import { exceedsDragThreshold, type PointerPosition } from './terminal-mouse-selection'

/**
 * Links vindos da saída de uma CLI não são conteúdo confiável. O terminal só
 * pode delegar ao navegador URLs web explícitas, e apenas quando a pessoa
 * confirma a intenção com Ctrl/Cmd+clique.
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
 * Só o botão principal abre. O xterm ativa o link no mouseup de qualquer
 * botão, então Ctrl+clique direito (que deveria só mostrar o menu) ou
 * Ctrl+clique do meio abririam o navegador. `button` ausente conta como
 * principal: é o que um evento sintético sem botão quer dizer.
 */
function isPrimaryButton(event: Pick<MouseEvent, 'button'>): boolean {
  return (event.button ?? 0) === 0
}

type OpenExternalLink = (uri: string) => void

/** Abre uma URL já validada no navegador externo, na forma que a política serializou. */
export function openAllowedTerminalExternalLink(
  uri: string,
  openExternalLink: OpenExternalLink = (url) => window.open(url, '_blank'),
): boolean {
  const decision = classifyExternalUrl(uri, EXTERNAL_WEB_SCHEMES)
  if (!decision.ok) {
    return false
  }

  openExternalLink(decision.url)
  return true
}

/**
 * Opens a terminal URL through Electron's existing window-open handler, which
 * redirects it to the system browser instead of navigating the app window.
 */
export function activateTerminalExternalLink(
  event: MouseEvent,
  uri: string,
  openExternalLink: OpenExternalLink = (url) => window.open(url, '_blank'),
): boolean {
  if (!hasTerminalLinkModifier(event) || !isPrimaryButton(event)) {
    return false
  }

  return openAllowedTerminalExternalLink(uri, openExternalLink)
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
 * portões (modificador, botão principal, política) continuam valendo.
 */
export function isTerminalLinkDragGesture(
  origin: PointerPosition | undefined,
  release: PointerPosition,
): boolean {
  return origin !== undefined && exceedsDragThreshold(origin, release)
}

const MAX_HOVER_URL_CHARS = 160

/**
 * Dica mostrada sobre um link do terminal. Traz o destino de verdade porque,
 * num hyperlink OSC 8, o texto na tela pode dizer `https://banco.com` e levar
 * a outro lugar. `undefined` quando o link não abriria.
 */
export function describeTerminalLinkHover(uri: string): string | undefined {
  const decision = classifyExternalUrl(uri, EXTERNAL_WEB_SCHEMES)
  if (!decision.ok) return undefined

  const destination =
    decision.url.length > MAX_HOVER_URL_CHARS
      ? `${decision.url.slice(0, MAX_HOVER_URL_CHARS - 1)}…`
      : decision.url
  return `${destination}\nCtrl/Cmd+clique: abrir no navegador · clique direito: mais opções`
}

/**
 * Texto que "Copiar link" põe na área de transferência: o destino
 * serializado se o link é aprovado, o texto cru se não é. Copiar nunca abre
 * nada, então um link recusado continua copiável — quem cola decide.
 */
export function terminalLinkClipboardText(uri: string): string {
  const decision = classifyExternalUrl(uri, EXTERNAL_WEB_SCHEMES)
  return decision.ok ? decision.url : uri.trim()
}

export type TerminalLinkMenuItem = 'abrir-no-canvas' | 'abrir-no-navegador' | 'copiar-link'

/**
 * Itens do menu de clique direito sobre um link do terminal, na ordem em que
 * aparecem.
 *
 * Link recusado não some: só perde as ações que abrem. Copiar nunca abre nada,
 * então continua disponível — é o único destino de um `file:` ou `vscode:`
 * vindo de um hyperlink OSC 8, que o app não abre mas a pessoa pode levar
 * adiante. A decisão mora aqui, longe do DOM, para ser testada sem montar o
 * menu.
 */
export function terminalLinkMenuItems(uri: string): TerminalLinkMenuItem[] {
  return isAllowedTerminalExternalLink(uri)
    ? ['abrir-no-canvas', 'abrir-no-navegador', 'copiar-link']
    : ['copiar-link']
}

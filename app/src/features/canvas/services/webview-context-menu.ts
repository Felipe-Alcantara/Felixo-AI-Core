/**
 * O menu de link pedido de dentro da página de um bloco Página Web: o clique
 * direito (ou o toque longo, ou a tecla de menu) chega como o evento
 * `context-menu` do `<webview>`, e daqui sai o pedido para o menu único de
 * destino, e o perfil da Página Web que o menu abrir. Separado do componente
 * e do canvas para ser testado sem Electron.
 */
import type { LinkChooserAnchor } from '../../shared/links/link-chooser-store'
import { isCustomProfileId } from './webview-profile'

/** O pedaço de `params` do `context-menu` do `<webview>` que o menu usa. */
export type WebviewContextMenuParams = { linkURL: string; x: number; y: number }

export type WebviewLinkMenu = { url: string; anchor: LinkChooserAnchor }

/**
 * O que o Chromium põe em `linkURL` quando não repassa o destino do link
 * (`javascript:`, e o que mais a página não pode pedir ao navegador): um
 * marcador dele, não o endereço que a página escreveu. Não há o que mostrar
 * nem copiar; antes, o menu dizia "endereços about: não abrem" e "Copiar
 * link" levava o marcador.
 */
const CHROMIUM_BLOCKED_LINK_URL = 'about:blank#blocked'

/**
 * O link sob o gesto e o ponto onde o menu nasce, ou `null` quando o gesto
 * não foi num link que o Chromium repassou: aí o menu não abre, e a página
 * segue com o dela (o clique simples também continua sendo dela).
 *
 * `x`/`y` já chegam no espaço da janela do app, em DIP: o Electron soma a
 * posição do `<webview>`, o iframe onde o link está e a escala do canvas, e
 * não multiplica pela escala do monitor. Somar o retângulo do webview de novo
 * punha o menu longe do clique. Verificado num experimento isolado no
 * Electron 41.10.7: webview em (300,200) e clique em (350,225) chegam como
 * (350,225); link num iframe e pai com `scale(0.5)`, idem; escala de monitor
 * 2, os mesmos números. Só o zoom da janela (Ctrl+=/−) entra: com fator 1,5,
 * o clique no ponto CSS (325,212) chega como (488,318). O menu é
 * `position: fixed` na página do app, que mede em pixels CSS, então o ponto
 * é dividido pelo fator.
 */
export function webviewLinkMenu(
  params: WebviewContextMenuParams,
  windowZoomFactor: number,
): WebviewLinkMenu | null {
  const { linkURL, x, y } = params
  if (!linkURL || linkURL === CHROMIUM_BLOCKED_LINK_URL) return null
  // Sem a ponte (ou com um valor que não é zoom), a janela está sem zoom.
  const zoom = Number.isFinite(windowZoomFactor) && windowZoomFactor > 0 ? windowZoomFactor : 1
  return { url: linkURL, anchor: { x: x / zoom, y: y / zoom } }
}

/** O mínimo de um bloco do canvas que a herança de perfil lê. */
export type LinkSourceNode = { type?: string; data?: { profileId?: unknown } }

/**
 * O perfil da Página Web que "Abrir como Página Web" cria: o da Página Web de
 * onde o link veio. Sem isso, um link aberto de dentro de um bloco do perfil
 * "Trabalho" nascia no Padrão, com a sessão de outra pessoa (ou deslogado).
 *
 * Link de outro bloco (terminal, nota) ou de uma Página Web no Padrão fica no
 * Padrão, como antes: `undefined` é o bloco sem `profileId`. Um id que não é
 * de perfil não passa adiante; a partição dele já era a do Padrão.
 */
export function webpageProfileForLinkSource(source: LinkSourceNode | undefined): string | undefined {
  if (source?.type !== 'webpage') return undefined
  const profileId = source.data?.profileId
  return isCustomProfileId(profileId) ? profileId : undefined
}

/**
 * Quem manda no gesto do mouse: o clique é da CLI, o arrasto é da seleção.
 *
 * Quando a CLI de um agente desenha uma tela cheia, ela costuma ligar o "mouse
 * tracking" do terminal — o modo em que cada clique e arrasto vira coordenada
 * enviada ao processo, em vez de virar seleção de texto. É assim que a Claude
 * Code sabe, por exemplo, que a pessoa clicou numa opção do menu.
 *
 * O efeito colateral: nesse modo, o xterm.js DESLIGA a seleção por
 * clique-arrastar comum. Só um arrasto com Shift (Option no macOS) força a
 * seleção — e ninguém aperta essa combinação sem saber que ela existe. Medido em
 * 25/08/2026: arrastar o mouse sobre uma sessão Claude Code não criava seleção
 * nenhuma (`hasSelection()` voltava `false`), então o Ctrl+C que copia a seleção
 * (`terminal-copy-shortcut.ts`) nunca entrava em ação.
 *
 * A primeira tentativa (commit `e2e55fc`) resolveu isso trocando TODO `mousedown`
 * por um sintético com o modificador ligado. Funcionou para o arrasto e quebrou
 * o clique: medido em 27/08/2026, clicar numa opção do menu da Claude Code não
 * fazia mais nada. A causa é que o xterm.js decide as duas coisas na MESMA
 * pergunta — `CoreBrowserTerminal` chama `sendEvent(ev)` só depois de conferir
 * `!shouldForceSelection(ev)`, então forçar o modificador não apenas liga a
 * seleção: também impede o relatório de mouse de chegar ao processo.
 *
 * Por isso a decisão não pode sair no `mousedown`: naquele instante ainda não se
 * sabe se o gesto é clique ou arrasto. Este módulo então **adia**: segura o
 * `mousedown` e espera o que vier primeiro.
 *
 * - Passou do limiar de arrasto → é seleção. Dispara o `mousedown` sintético com
 *   o modificador, ancorado onde o gesto começou, e o xterm.js seleciona. A CLI
 *   não recebe nada, que é o certo: quem arrasta quer texto, não menu.
 * - Soltou o botão sem sair do lugar → é clique. Devolve o par
 *   `mousedown`/`mouseup` intacto, sem modificador nenhum, e a CLI recebe o
 *   clique como sempre recebeu.
 *
 * As decisões moram aqui, longe do DOM, para poderem ser testadas direto — mesmo
 * molde de `terminal-copy-shortcut.ts` e `terminal-input-selection.ts`.
 */

/** Marca no MouseEventInit para o xterm.js tratar como "seleção forçada". */
export type ForcedSelectionEventInit = MouseEventInit

/**
 * A partir de quantos pixels um gesto deixa de ser clique e vira arrasto.
 *
 * Três é folga para a mão que treme no clique e ainda é bem menos que a menor
 * seleção útil (uma célula de texto). Abaixo disso, clique de mão trêmula viraria
 * seleção vazia e a CLI perderia o clique — que é exatamente o defeito que este
 * módulo existe para não repetir.
 */
export const DRAG_THRESHOLD_PX = 3

/** Um ponto na tela, do jeito que o `MouseEvent` o entrega. */
export type PointerPosition = Pick<MouseEvent, 'clientX' | 'clientY'>

/**
 * Detecta o macOS pela API que substituiu `navigator.platform` (e cai para
 * ele quando o navegador ainda não tem `userAgentData`, caso do Electron/Chromium
 * mais antigo).
 */
export function isMacPlatform(nav: Pick<Navigator, 'platform'> & { userAgentData?: { platform?: string } }): boolean {
  const platform = nav.userAgentData?.platform ?? nav.platform ?? ''
  return /mac/i.test(platform)
}

/**
 * Um `mousedown` já força seleção, na conta do próprio xterm.js
 * (`SelectionService.shouldForceSelection`)? Se sim, não há nada a fazer: a
 * pessoa já apertou Shift/Option de propósito, e adiar o gesto só atrapalharia
 * quem já sabe o que quer.
 */
export function xtermAlreadyForcesSelection(event: Pick<MouseEvent, 'shiftKey' | 'altKey'>, isMac: boolean): boolean {
  return isMac ? event.altKey : event.shiftKey
}

/**
 * Este `mousedown` deve ser retido até se saber se vira clique ou arrasto?
 *
 * Só o botão primário: botão direito é menu de contexto, botão do meio tem uso
 * próprio (colar no X11) — nenhum dos dois é "arrastar para selecionar".
 *
 * `isTrusted` é o que impede um laço infinito: os eventos sintéticos que este
 * módulo dispara passam por este mesmo caminho, mas nascem de `dispatchEvent` e
 * todo evento criado por script tem `isTrusted: false`. É a mesma distinção
 * nativa do DOM, sem precisar de uma marca própria ou de um registro à parte.
 *
 * `mouseTrackingActive` é o que impede o efeito colateral medido em 25/08/2026:
 * quando o mouse tracking está DESLIGADO (shell puro, a maioria dos programas),
 * a seleção do xterm.js já funciona normalmente com um clique comum, e o
 * processo não espera relatório de mouse nenhum. Reter o gesto ali seria mexer
 * onde nada está quebrado — e forçar Shift, pior ainda: com `_enabled = true`,
 * um Shift forçado no primeiro clique cai no caminho de "estender seleção
 * existente" (`_handleIncrementalClick`), que sem uma âncora anterior não
 * seleciona nada.
 */
export function shouldDeferMouseDown(
  event: Pick<MouseEvent, 'type' | 'button' | 'isTrusted'>,
  mouseTrackingActive: boolean,
): boolean {
  return (
    mouseTrackingActive && event.type === 'mousedown' && event.button === 0 && event.isTrusted
  )
}

/**
 * O ponteiro já andou o bastante para o gesto ser arrasto, e não clique?
 *
 * Distância em cada eixo, não euclidiana: é mais barata, e a diferença entre as
 * duas num limiar de três pixels não muda decisão nenhuma.
 */
export function exceedsDragThreshold(
  origin: PointerPosition,
  current: PointerPosition,
  threshold: number = DRAG_THRESHOLD_PX,
): boolean {
  return (
    Math.abs(current.clientX - origin.clientX) >= threshold ||
    Math.abs(current.clientY - origin.clientY) >= threshold
  )
}

/**
 * Os campos que um evento sintético precisa copiar do original para o xterm.js
 * não notar diferença: posição, botões e os modificadores que a pessoa apertou
 * de verdade.
 */
function baseEventInit(event: MouseEvent): MouseEventInit {
  return {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: event.view,
    detail: event.detail,
    screenX: event.screenX,
    screenY: event.screenY,
    clientX: event.clientX,
    clientY: event.clientY,
    ctrlKey: event.ctrlKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    metaKey: event.metaKey,
    button: event.button,
    buttons: event.buttons,
    relatedTarget: event.relatedTarget,
  }
}

/**
 * O gesto retido, devolvido como era: nenhum modificador forçado.
 *
 * É o caminho do clique. O xterm.js recebe um `mousedown` comum, vê que
 * `shouldForceSelection` é falso e manda o relatório de mouse ao processo — a
 * CLI recebe o clique exatamente como receberia se este módulo não existisse.
 */
export function buildReplayEventInit(event: MouseEvent): MouseEventInit {
  return baseEventInit(event)
}

/**
 * O gesto retido, refeito como seleção forçada.
 *
 * É o caminho do arrasto. No macOS o modificador que força é `altKey`; nos
 * demais, `shiftKey` — a mesma distinção que `SelectionService.shouldForceSelection`
 * faz internamente. O modificador do outro eixo (o que a pessoa realmente
 * apertou) é preservado, não zerado: arrastar com Ctrl real, por exemplo,
 * continua chegando como Ctrl real.
 */
export function buildForcedSelectionEventInit(
  event: MouseEvent,
  isMac: boolean,
): ForcedSelectionEventInit {
  return {
    ...baseEventInit(event),
    shiftKey: isMac ? event.shiftKey : true,
    altKey: isMac ? true : event.altKey,
  }
}

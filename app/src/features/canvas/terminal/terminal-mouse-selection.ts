/**
 * Quem manda no clique-arrastar do mouse: o texto na tela, nunca a CLI.
 *
 * Quando a CLI de um agente desenha uma tela cheia (Claude Code, Codex, Gemini),
 * ela costuma ligar o "mouse tracking" do terminal — o modo em que cada clique e
 * arrasto vira coordenada enviada ao processo, em vez de virar seleção de texto.
 * É assim que essas CLIs sabem, por exemplo, rolar a tela com a roda do mouse.
 *
 * O efeito colateral: nesse modo, o xterm.js DESLIGA a seleção por
 * clique-arrastar comum. Só um clique-arrastar com Shift (Option no macOS)
 * força a seleção mesmo com o modo ligado — e ninguém aperta essa combinação
 * sem saber que ela existe. Medido em 25/08/2026: arrastar o mouse sobre o
 * texto de uma sessão Claude Code não cria seleção nenhuma (`hasSelection()`
 * volta `false`), então o Ctrl+C que copia a seleção (`terminal-copy-shortcut.ts`)
 * nunca entra em ação — o `0x03` cru chega à CLI, que faz o que quiser com ele
 * (a Claude Code tem um copiador próprio que reage a isso, mas copiou um trecho
 * errado do que a pessoa arrastou).
 *
 * A decisão deste módulo: clique-arrastar comum sempre seleciona texto; a CLI
 * nunca recebe a posição do mouse por esse gesto. Chega ao mesmo resultado que
 * Shift/Option-arrastar, só que automático — do jeito que a maioria dos
 * terminais modernos (VS Code, iTerm2, Windows Terminal) já se comporta.
 *
 * O truque: o xterm.js decide "forçar seleção" e "não mandar mouse à CLI" a
 * partir da MESMA pergunta — `shouldForceSelection(event)`, que olha
 * `event.shiftKey` (`event.altKey` no macOS). Em vez de reimplementar a seleção
 * do zero, criamos um evento sintético igual ao original, só que com esse
 * modificador ligado, e deixamos o próprio xterm.js decidir a partir dele.
 */

/** Marca no MouseEventInit para o xterm.js tratar como "seleção forçada". */
export type ForcedSelectionEventInit = MouseEventInit

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
 * pessoa já apertou Shift/Option de propósito.
 */
export function xtermAlreadyForcesSelection(event: Pick<MouseEvent, 'shiftKey' | 'altKey'>, isMac: boolean): boolean {
  return isMac ? event.altKey : event.shiftKey
}

/**
 * Este `mousedown` deve ser interceptado e refeito como seleção forçada?
 *
 * Só o botão primário: botão direito é menu de contexto, botão do meio tem uso
 * próprio (colar no X11) — nenhum dos dois é "arrastar para selecionar".
 *
 * `isTrusted` é o que impede um laço infinito: o evento sintético que este
 * módulo cria para substituir o original também passa por este mesmo
 * `mousedown`, mas nasce de `dispatchEvent`, não de um gesto real — e todo
 * evento criado por script tem `isTrusted: false`. É a mesma distinção nativa
 * do DOM, sem precisar de uma marca própria our um registro à parte.
 *
 * `mouseTrackingActive` é o que impede o efeito colateral medido em 25/08/2026:
 * quando o mouse tracking já está DESLIGADO (shell puro, a maioria dos
 * programas), a seleção do xterm.js já funciona normalmente com um clique
 * comum — forçar Shift nesse caso não é inofensivo, é uma quebra. Com
 * `_enabled = true`, um Shift forçado no primeiro clique cai no caminho de
 * "estender seleção existente" (`_handleIncrementalClick`), que só faz algo
 * quando já existe uma âncora de seleção; sem uma seleção anterior, o primeiro
 * clique-arrastar simplesmente não seleciona nada. Só vale interceptar quando
 * o tracking está ligado — é exatamente aí que o clique comum, sem ajuda, não
 * seleciona nada mesmo.
 */
export function shouldForceMouseSelection(
  event: Pick<MouseEvent, 'type' | 'button' | 'isTrusted'>,
  mouseTrackingActive: boolean,
): boolean {
  return (
    mouseTrackingActive && event.type === 'mousedown' && event.button === 0 && event.isTrusted
  )
}

/**
 * Monta os parâmetros do `mousedown` sintético: idêntico ao original, exceto
 * pelo modificador que o xterm.js lê como "forçar seleção".
 *
 * No macOS o forçado é `altKey`; nos demais, `shiftKey` — a mesma distinção
 * que `SelectionService.shouldForceSelection` faz interamente. O modificador
 * do outro eixo (o que a pessoa realmente apertou) é preservado, não zerado:
 * arrastar com Ctrl real, por exemplo, continua chegando como Ctrl real.
 */
export function buildForcedSelectionEventInit(
  event: MouseEvent,
  isMac: boolean,
): ForcedSelectionEventInit {
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
    shiftKey: isMac ? event.shiftKey : true,
    altKey: isMac ? true : event.altKey,
    metaKey: event.metaKey,
    button: event.button,
    buttons: event.buttons,
    relatedTarget: event.relatedTarget,
  }
}

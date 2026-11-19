'use strict'

/**
 * @module agent-webpage-act
 * O que um agente pode FAZER num bloco Página Web depois que a pessoa abriu
 * uma sessão curta: clicar numa coordenada e digitar no campo em foco.
 *
 * Campo de senha e de pagamento nunca entram na sessão: cada digitação neles
 * pede uma confirmação própria. O texto digitado nunca é devolvido, gravado
 * nem registrado: o resultado só diz quantos caracteres foram.
 */

const { classificarCampo } = require('./agent-webpage-field.cjs')
const { enderecoSemSegredo } = require('./agent-webpage-inspect.cjs')

/** Mundo isolado só deste recurso (mesmo do olhar: a página hostil não enxerga o script). */
const MUNDO_ISOLADO = 1157

/** Roda na página: o campo em foco e se é editável. Frame interno não dá para classificar. */
function lerCampoFocado(classificar) {
  let el = document.activeElement
  while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement
  if (!el || el === document.body) return { editavel: false }
  const tag = el.tagName.toLowerCase()
  if (tag === 'iframe' || tag === 'frame') return { editavel: true, sensivel: 'quadro' }
  const tipo = (el.getAttribute('type') || '').toLowerCase()
  const naoTexto = ['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'image', 'range', 'color']
  const editavel = tag === 'textarea' || el.isContentEditable || (tag === 'input' && !naoTexto.includes(tipo))
  return {
    editavel,
    sensivel: classificar({
      tag,
      type: tipo,
      autocomplete: el.getAttribute('autocomplete'),
      name: el.getAttribute('name'),
      id: el.id,
      placeholder: el.getAttribute('placeholder'),
      ariaLabel: el.getAttribute('aria-label'),
    }),
  }
}

/** Nome da tecla no CLI -> código do `sendInputEvent` do Electron. */
const CODIGO_DA_TECLA = {
  Enter: 'Enter',
  Tab: 'Tab',
  Escape: 'Escape',
  Backspace: 'Backspace',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Home: 'Home',
  End: 'End',
}

const CODIGO_CAMPO_FOCADO = `(${lerCampoFocado.toString()})(${classificarCampo.toString()})`

/**
 * @param {{ guest: any, tipo: 'clicar' | 'digitar' | 'rolar' | 'tecla', x?: number, y?: number, texto?: string, dy?: number, tecla?: string, confirmouCampoSensivel?: boolean }} params
 * @returns {Promise<object>} `ok: true`; `ok: false` com `message`; ou `precisaConfirmar` ('senha' | 'pagamento' | 'quadro').
 */
async function agirNaPagina({ guest, tipo, x, y, texto, dy, tecla, confirmouCampoSensivel }) {
  const url = enderecoSemSegredo(guest.getURL?.())
  if (tipo === 'rolar') {
    const posicao = await guest.executeJavaScriptInIsolatedWorld(MUNDO_ISOLADO, [
      { code: `window.scrollBy(0, ${Number(dy)}); ({ x: Math.round(window.scrollX), y: Math.round(window.scrollY) })` },
    ])
    return { ok: true, tipo, url, dy, rolagem: posicao }
  }
  if (tipo === 'tecla') {
    // Enter num campo de senha ou de pagamento envia o formulário: pede a mesma confirmação de digitar nele.
    const focado = await guest.executeJavaScriptInIsolatedWorld(MUNDO_ISOLADO, [{ code: CODIGO_CAMPO_FOCADO }])
    if (focado?.sensivel && confirmouCampoSensivel !== true) return { ok: false, precisaConfirmar: focado.sensivel }
    const codigo = CODIGO_DA_TECLA[tecla]
    guest.sendInputEvent({ type: 'keyDown', keyCode: codigo })
    if (tecla === 'Enter') guest.sendInputEvent({ type: 'char', keyCode: '\r' })
    guest.sendInputEvent({ type: 'keyUp', keyCode: codigo })
    return { ok: true, tipo, url, tecla, ...(focado?.sensivel ? { campoSensivel: focado.sensivel } : {}) }
  }
  if (tipo === 'clicar') {
    guest.sendInputEvent({ type: 'mouseMove', x, y })
    guest.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 })
    guest.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 })
    return { ok: true, tipo, url, x, y }
  }
  const campo = await guest.executeJavaScriptInIsolatedWorld(MUNDO_ISOLADO, [{ code: CODIGO_CAMPO_FOCADO }])
  if (!campo?.editavel) {
    return { ok: false, message: 'Nenhum campo de texto está em foco. Clique no campo antes de digitar.' }
  }
  if (campo.sensivel && confirmouCampoSensivel !== true) return { ok: false, precisaConfirmar: campo.sensivel }
  guest.insertText(texto)
  return { ok: true, tipo, url, caracteres: texto.length, ...(campo.sensivel ? { campoSensivel: campo.sensivel } : {}) }
}

module.exports = { MUNDO_ISOLADO, lerCampoFocado, agirNaPagina }

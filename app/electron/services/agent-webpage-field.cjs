'use strict'

/**
 * @module agent-webpage-field
 * Campo de senha ou de pagamento de uma página, reconhecido pelos atributos.
 * Mora à parte porque o mesmo código roda dentro da página (via `toString`),
 * tanto na leitura do DOM quanto na hora de digitar.
 */

/**
 * Diz se um campo é de senha ou de pagamento, pelos atributos. Pura e sem
 * dependências de fora: também roda dentro da página (via `toString`).
 *
 * @param {{ tag?: string, type?: string, autocomplete?: string, name?: string, id?: string, placeholder?: string, ariaLabel?: string }} a
 * @returns {'senha' | 'pagamento' | null}
 */
function classificarCampo(a) {
  const tipo = String(a.type || '').toLowerCase()
  const tokens = String(a.autocomplete || '').toLowerCase().split(/\s+/)
  const texto = [a.name, a.id, a.placeholder, a.ariaLabel].map((v) => String(v || '')).join(' ').toLowerCase()
  if (a.tag === 'input' && tipo === 'password') return 'senha'
  if (tokens.some((t) => t.startsWith('cc-'))) return 'pagamento'
  if (tokens.includes('current-password') || tokens.includes('new-password')) return 'senha'
  if (/cvv|cvc|csc|card.?(number|num|holder|exp)|cc.?(num|number|exp|name)|n.mero.{0,4}cart|cart.o|security.?code|c.digo.?de.?seguran/.test(texto)) {
    return 'pagamento'
  }
  if (/pass(word|wd)|senha/.test(texto)) return 'senha'
  return null
}

module.exports = { classificarCampo }

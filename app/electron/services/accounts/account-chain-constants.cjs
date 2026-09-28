'use strict'

/**
 * Números da cadeia de contas num lugar só (ver
 * `docs/projeto/POLITICA-CONTAS.md`). Cada módulo da pasta `accounts/` lê
 * daqui em vez de repetir o literal, para que mudar um teto seja uma edição e
 * não uma caça.
 */

/** Tamanho máximo da evidência guardada (a linha que a CLI imprimiu, já redigida). */
const EVIDENCE_MAX_CHARS = 200

/**
 * Quantos caracteres antes do trecho reconhecido a evidência mantém quando a
 * linha é maior que `EVIDENCE_MAX_CHARS`: o bastante para a frase aparecer
 * inteira, sem levar o resto de um JSON de erro longo.
 */
const EVIDENCE_LEAD_CHARS = 40

/** Tamanho, em dígitos hexadecimais, da impressão digital de uma evidência. */
const EVIDENCE_HASH_HEX_CHARS = 32

module.exports = Object.freeze({
  EVIDENCE_HASH_HEX_CHARS,
  EVIDENCE_LEAD_CHARS,
  EVIDENCE_MAX_CHARS,
})

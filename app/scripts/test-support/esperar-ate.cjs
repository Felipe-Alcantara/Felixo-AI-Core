'use strict'

/**
 * Espera uma condição ficar verdadeira, com prazo que falha dizendo o que não
 * aconteceu. No lugar de uma espera fixa antes de checar algo assíncrono: numa
 * máquina carregada o tempo fixo acaba antes do trabalho, e o teste falha (ou,
 * se agir sobre o que ainda não começou, fica preso).
 */
async function esperarAte(condicao, oQue, { prazoMs = 10_000, passoMs = 5 } = {}) {
  const limite = Date.now() + prazoMs
  while (!condicao()) {
    if (Date.now() > limite) throw new Error(`esperou ${prazoMs} ms e não aconteceu: ${oQue}`)
    await new Promise((resolve) => setTimeout(resolve, passoMs))
  }
}

module.exports = { esperarAte }

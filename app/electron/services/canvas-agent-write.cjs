'use strict'

/**
 * @module canvas-agent-write
 * Lógica pura da Fatia 2 (escrita) de "agente lê/escreve elementos do canvas".
 *
 * Ao contrário da leitura (`canvas-agent-read.cjs`), toda escrita passa por
 * confirmação humana — quem chama `prepararEscrita` só descobre SE o pedido é
 * válido; quem persiste (`agent-canvas-write-ipc-handlers.cjs`) só faz isso
 * depois do clique. Nesta fatia, só `note` aceita escrita: é o único tipo cujo
 * conteúdo é puramente texto do usuário, sem lado externo (arquivo em disco,
 * PTY de outro processo) que precise de um contrato próprio.
 */

/** Tipos de nó que aceitam escrita nesta fatia. Fechado de propósito. */
const TIPOS_COM_ESCRITA = new Set(['note'])

/**
 * Valida o pedido contra o canvas de verdade e calcula o novo `data` do nó,
 * sem persistir nada — só quem chama decide se e quando grava.
 *
 * @param {object} params
 * @param {string} params.id
 * @param {Array<{id:string,type:string,data?:object}>} params.nodes
 * @param {string} params.conteudo
 * @returns {{ ok: true, node: object, novaData: object } | { ok: false, message: string }}
 */
function prepararEscrita({ id, nodes, conteudo }) {
  const node = (nodes ?? []).find((candidato) => candidato.id === id)

  if (!node) {
    return { ok: false, message: `Nenhum elemento com id "${id}" neste canvas.` }
  }

  if (!TIPOS_COM_ESCRITA.has(node.type)) {
    return {
      ok: false,
      message: `Elementos do tipo "${node.type}" ainda não aceitam escrita nesta fatia.`,
    }
  }

  return { ok: true, node, novaData: { ...node.data, text: conteudo } }
}

module.exports = {
  TIPOS_COM_ESCRITA,
  prepararEscrita,
}

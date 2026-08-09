/**
 * @module ipc-result
 * Formato de resposta de erro compartilhado por todos os handlers IPC.
 *
 * Todo canal `ipcMain.handle` do app responde no mesmo contrato
 * (`{ ok, message }` em caso de falha), então a conversão de erro vive aqui —
 * um único lugar — em vez de ser recopiada por handler. Mudar o contrato de
 * erro (acrescentar um `code`, por exemplo) passa a ser uma edição só.
 */

/**
 * Converte um erro em resposta IPC padronizada.
 *
 * @param {unknown} error - Erro capturado pelo handler.
 * @param {string} fallbackMessage - Mensagem usada quando o erro não é `Error`.
 * @returns {{ ok: false, message: string }}
 */
function toErrorResult(error, fallbackMessage) {
  return {
    ok: false,
    message: error instanceof Error ? error.message : fallbackMessage,
  }
}

module.exports = {
  toErrorResult,
}

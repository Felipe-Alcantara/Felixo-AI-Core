'use strict'

/**
 * No Windows, `WindowsPtyAgent.kill()` do node-pty bifurca um processo auxiliar
 * (`conpty_console_list_agent.js`) para listar o console do shell antes de
 * encerrá-lo. Esse auxiliar chama `AttachConsole`, que falha em runners sem
 * sessão de console herdável — é o caso do GitHub Actions `windows-latest`
 * (medido no run 34185205675: 4/5 subtestes passaram, o 5º abortou com
 * `AttachConsole failed` em `conpty_console_list_agent.js:13`). Máquinas com
 * desktop interativo não têm esse limite; por isso o teste passa localmente.
 *
 * A falha nasce dentro do processo bifurcado e chega até aqui como exceção
 * não tratada (o node-pty não registra um listener de erro nesse canal IPC).
 * Não há como evitar o fork sem trocar o backend do ConPTY — e a troca para
 * o modo DLL foi tentada e revertida: ela evita o `AttachConsole`, mas o
 * `kill()` correspondente só libera o handle do conout ao receber mais dados
 * dele, o que nunca acontece após a saída do processo, e prendeu o job do CI
 * (run 34817554283, cancelado depois de mais de 50 min sem terminar).
 *
 * A estratégia adotada é isolar só esta falha conhecida, pelo texto exato do
 * erro, sem abafar nenhuma outra exceção — uma falha real de leitura/escrita
 * da PTY continua derrubando o teste normalmente.
 */
const PADRAO_FALHA_CONSOLE_LIST_AGENT = /AttachConsole|conpty_console_list_agent/i

function instalarGuardaDeConsoleListAgent() {
  if (process.platform !== 'win32') return () => {}

  const tratar = (erro) => {
    const mensagem = erro instanceof Error ? `${erro.message}\n${erro.stack || ''}` : String(erro)
    if (!PADRAO_FALHA_CONSOLE_LIST_AGENT.test(mensagem)) throw erro
    console.warn(
      '[PTY nativa] ignorando falha conhecida do auxiliar conpty_console_list_agent ' +
        '(AttachConsole) — limitação do runner Windows sem sessão de console, não uma ' +
        'regressão de leitura/escrita da PTY.',
    )
  }

  process.on('uncaughtException', tratar)
  process.on('unhandledRejection', tratar)
  return () => {
    process.off('uncaughtException', tratar)
    process.off('unhandledRejection', tratar)
  }
}

module.exports = { PADRAO_FALHA_CONSOLE_LIST_AGENT, instalarGuardaDeConsoleListAgent }

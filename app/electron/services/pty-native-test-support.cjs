'use strict'

/**
 * Backend de PTY estável para os testes de integração no Windows.
 *
 * Causa raiz medida (CI, Windows, `node --test`): `PtyHandle.kill()`, quando
 * o node-pty não conseguiu carregar a `conpty.dll` (`useConptyDll` continua
 * `false`, o padrão), encerra a sessão bifurcando um processo Node separado
 * (`node-pty/lib/conpty_console_list_agent.js`) que chama `AttachConsole`
 * para listar os processos do console antes de matá-los. Nos runners do
 * GitHub Actions esse `AttachConsole` falha e o processo bifurcado sai com
 * `STATUS_HEAP_CORRUPTION` (0xC0000374) — o processo do próprio arquivo de
 * teste é encerrado, e `not ok 1 - <arquivo>` aparece com `location: 1:1`:
 * o teste nunca chega a rodar, o processo caiu antes.
 *
 * `useConptyDll: true` pede ao node-pty o backend baseado na DLL do ConPTY,
 * cujo `kill()` fecha os handles diretamente (`windowsPtyAgent.js`, branch
 * `if (this._useConptyDll)`) sem bifurcar esse agente — o código que crasha
 * nunca roda. Isso é escopo só de teste: nenhuma sessão real de usuário passa
 * por aqui, e fora do Windows a fábrica devolve o `node-pty` sem alteração.
 */
function criarSpawnPtyEstavelNoWindows() {
  if (process.platform !== 'win32') {
    return undefined
  }

  // Captura a função original agora, não `nodePty.spawn` por referência de
  // propriedade: alguns testes reatribuem `nodePty.spawn` para inspecionar a
  // chamada (ver claude-usage-query.integration.test.cjs) — resolver a
  // propriedade só na hora de chamar recairia na própria substituição e
  // recursaria para sempre.
  const spawnOriginal = require('node-pty').spawn
  return (file, args, options) => spawnOriginal(file, args, { ...options, useConptyDll: true })
}

module.exports = { criarSpawnPtyEstavelNoWindows }

'use strict'
/**
 * `claude` de mentira para os roteiros de validação: responde à versão e, em
 * stream-json, grava em FELIXO_CLAUDE_FALSO_SAIDA cada linha que o app envia.
 * Nada sai do computador e nenhum crédito é gasto.
 */
const fs = require('node:fs')

if (process.argv.includes('--version')) {
  console.log('2.1.332 (Claude Code)')
  process.exit(0)
}

const saida = (objeto) => process.stdout.write(`${JSON.stringify(objeto)}\n`)

if (process.argv.includes('stream-json')) {
  // Como o Claude Code 2.1.332: sem entrada, só avisos de hooks e de interface;
  // o anúncio da sessão vem depois da primeira mensagem.
  for (const subtype of ['hook_started', 'hook_response', 'ui_status']) saida({ type: 'system', subtype, session_id: 'falsa' })
  require('node:readline').createInterface({ input: process.stdin }).on('line', (linha) => {
    fs.appendFileSync(process.env.FELIXO_CLAUDE_FALSO_SAIDA, `${linha}\n`)
    saida({ type: 'system', subtype: 'init', session_id: 'falsa' })
    saida({ type: 'assistant', session_id: 'falsa', message: { role: 'assistant', content: [{ type: 'text', text: 'recebido' }] } })
    saida({ type: 'result', subtype: 'success', is_error: false, result: 'recebido', session_id: 'falsa' })
  })
} else {
  // Aberto num terminal: só fica vivo.
  process.stdin.resume()
}

'use strict'

/**
 * @module single-instance
 * Uma instância do app por pasta de dados (`userData`).
 *
 * Sem trava, abrir o app de novo (ícone, atalho, autostart, um `.fxai` com o
 * app aberto) subia um segundo processo que restaurava o mesmo canvas,
 * relançava as mesmas conversas e gravava no mesmo SQLite (task "impedir
 * segunda instância do app", 25/09/2026). A trava do Electron vale por
 * `userData`: os perfis isolados (smoke, `felixo devtools`, benchmarks) e o
 * `npm run dev`, que usa outra pasta, seguem abrindo ao lado do app instalado.
 */

const path = require('node:path')

/**
 * Pede a trava. Sem ela, encerra na hora e devolve `false`: `app.exit` antes do
 * `ready` não deixa o resto do `main.cjs` rodar (medido em 04/11/2026 com o
 * Electron do projeto), então a segunda abertura não toca na GPU nem no
 * marcador de sessão da primeira.
 *
 * @param {{ app: import('electron').App, onSecondInstance: (abertura: { argv: string[], workingDirectory: string }) => void }} options
 * @returns {boolean}
 */
function claimSingleInstance({ app, onSecondInstance }) {
  if (!app.requestSingleInstanceLock()) {
    app.exit(0)
    return false
  }
  app.on('second-instance', (_event, argv, workingDirectory) => onSecondInstance({ argv, workingDirectory }))
  return true
}

/**
 * O arquivo suportado que a segunda abertura recebeu, resolvido contra a pasta
 * de onde ela veio. No Windows e no Linux o arquivo chega no `argv`, misturado
 * aos switches do Chromium.
 *
 * @param {string[]} argv
 * @param {string} workingDirectory
 * @param {Set<string>} extensions - Em minúsculas, com o ponto.
 * @returns {string | null}
 */
function fileFromArgv(argv, workingDirectory, extensions) {
  const arg = (argv ?? []).find((value) => typeof value === 'string' && extensions.has(path.extname(value).toLowerCase()))
  return arg ? path.resolve(workingDirectory || process.cwd(), arg) : null
}

module.exports = { claimSingleInstance, fileFromArgv }

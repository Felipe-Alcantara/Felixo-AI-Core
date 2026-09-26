'use strict'

/**
 * @module ipc-invoke-probe
 * Conta as invocações IPC por canal, só na instância de automação.
 *
 * O smoke do tutorial do canvas precisa provar que percorrer o tour não chama
 * nada que crie processo, gaste rede ou crédito (PTY, CLIs, OpenIA, Notion,
 * Fetch All, git...). O CDP só enxerga o renderer; esta sonda fica no main e
 * conta quantas vezes cada canal foi de fato invocado. O smoke tira um
 * `snapshot()` antes e outro depois do percurso e compara os dois.
 *
 * Envolve `ipcMain.handle` e `ipcMain.on` desta instância antes de qualquer
 * módulo registrar canais. `handleOnce` e `once` passam pelos mesmos métodos
 * (o Electron e o EventEmitter do Node os implementam sobre `handle` e `on`),
 * então também são contados. O retorno, a exceção e o `this` do handler
 * original chegam intactos a quem chamou; a sonda só soma um contador na
 * entrada.
 *
 * Nunca é instalada no app normal: o `main.cjs` só a liga com uma porta de
 * depuração válida, e a expõe ao `devtools:main-eval` apenas com `snapshot()`.
 */

function compareChannels(first, second) {
  return first[0] < second[0] ? -1 : first[0] > second[0] ? 1 : 0
}

/**
 * @param {{ handle: Function, on: Function }} ipcMainInstance
 * @returns {{ snapshot(): Readonly<Record<string, number>>, uninstall(): void }}
 */
function installIpcInvokeProbe(ipcMainInstance) {
  const counts = new Map()
  const count = (channel) => {
    const key = String(channel)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const originalHandle = ipcMainInstance.handle
  const originalOn = ipcMainInstance.on

  ipcMainInstance.handle = function probedHandle(channel, listener) {
    return originalHandle.call(this, channel, function countedHandler(...args) {
      count(channel)
      return listener.apply(this, args)
    })
  }

  ipcMainInstance.on = function probedOn(channel, listener) {
    function countedListener(...args) {
      count(channel)
      return listener.apply(this, args)
    }
    // `removeListener(canal, original)` continua funcionando: o EventEmitter do
    // Node também compara com `.listener` (o mesmo campo que o `once` usa).
    countedListener.listener = listener
    return originalOn.call(this, channel, countedListener)
  }

  return {
    /** Cópia congelada dos contadores, com os canais em ordem alfabética. */
    snapshot() {
      return Object.freeze(Object.fromEntries([...counts].sort(compareChannels)))
    },
    /** Devolve os métodos originais (usado pelos testes). */
    uninstall() {
      ipcMainInstance.handle = originalHandle
      ipcMainInstance.on = originalOn
    },
  }
}

module.exports = {
  installIpcInvokeProbe,
}

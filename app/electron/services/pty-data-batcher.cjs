'use strict'

/**
 * Agrupa a saída dos PTYs antes de atravessar para o renderer.
 *
 * Antes, cada pedaço do node-pty virava uma mensagem `pty:data`: com 20
 * terminais animando spinner (~100 pedaços/s cada), eram ~2.000 travessias de
 * processo por segundo. Aqui os pedaços de cada sessão se juntam por até
 * `windowMs` e saem numa mensagem só, com as sessões que tiverem saída —
 * `[{ sessionId, data }, ...]` (o preload desdobra o lote).
 *
 * Três exceções saem na hora, sem esperar a janela: a sessão que passou de
 * `maxChars` pendentes (segura memória e tamanho de mensagem), a que recebeu
 * entrada há menos de `echoWindowMs` (o eco da tecla não pode atrasar) e quem
 * chama `flush` (antes do `exit` e do `kill`, para o fim nunca chegar antes
 * do último dado). A ordem dentro de uma sessão nunca muda: tudo dela passa
 * pela mesma fila e sai concatenado.
 */

const DEFAULT_WINDOW_MS = 8
const DEFAULT_MAX_CHARS = 64 * 1024
const DEFAULT_ECHO_WINDOW_MS = 100

/**
 * @param {object} options
 * @param {(batch: Array<{ sessionId: string, data: string }>) => void} options.send
 * @param {number} [options.windowMs]
 * @param {number} [options.maxChars]
 * @param {number} [options.echoWindowMs]
 * @param {() => number} [options.now]
 * @param {(fn: () => void, ms: number) => unknown} [options.setTimer]
 * @param {(handle: unknown) => void} [options.clearTimer]
 */
function createPtyDataBatcher(options) {
  const send = options.send
  const windowMs = Math.max(0, Number(options.windowMs ?? DEFAULT_WINDOW_MS) || 0)
  const maxChars = Math.max(1, Number(options.maxChars ?? DEFAULT_MAX_CHARS) || DEFAULT_MAX_CHARS)
  const echoWindowMs = Math.max(0, Number(options.echoWindowMs ?? DEFAULT_ECHO_WINDOW_MS) || 0)
  const now = typeof options.now === 'function' ? options.now : Date.now
  const setTimer = options.setTimer ?? ((fn, ms) => {
    const handle = setTimeout(fn, ms)
    handle.unref?.()
    return handle
  })
  const clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle))

  /** @type {Map<string, { chunks: string[], chars: number }>} pendentes, na ordem de chegada das sessões */
  const pending = new Map()
  /** @type {Map<string, number>} até quando a sessão está em modo eco */
  const echoUntil = new Map()
  let timer = null

  function push(sessionId, data) {
    if (typeof data !== 'string' || data === '') return
    let entry = pending.get(sessionId)
    if (!entry) {
      entry = { chunks: [], chars: 0 }
      pending.set(sessionId, entry)
    }
    entry.chunks.push(data)
    entry.chars += data.length

    if (entry.chars >= maxChars || (echoUntil.get(sessionId) ?? -Infinity) >= now()) {
      flush(sessionId)
      return
    }
    if (timer === null) {
      timer = setTimer(flushAll, windowMs)
    }
  }

  function take(sessionId) {
    const entry = pending.get(sessionId)
    if (!entry) return null
    pending.delete(sessionId)
    return { sessionId, data: entry.chunks.length === 1 ? entry.chunks[0] : entry.chunks.join('') }
  }

  /** Manda já o pendente de uma sessão (antes do exit, do kill e no eco). */
  function flush(sessionId) {
    const item = take(sessionId)
    if (item) send([item])
    if (pending.size === 0) stopTimer()
  }

  /** Manda numa mensagem só o pendente de todas as sessões. */
  function flushAll() {
    stopTimer()
    if (pending.size === 0) return
    const batch = []
    for (const sessionId of [...pending.keys()]) {
      const item = take(sessionId)
      if (item) batch.push(item)
    }
    send(batch)
  }

  /**
   * Joga fora o pendente da sessão sem mandar: no reanexo, o replay que o
   * processo principal reenvia já contém esse trecho, e mandá-lo antes
   * duplicaria o fim da saída no xterm novo.
   */
  function discard(sessionId) {
    pending.delete(sessionId)
    if (pending.size === 0) stopTimer()
  }

  /** A sessão recebeu entrada: a saída das próximas `echoWindowMs` vai na hora. */
  function noteInput(sessionId) {
    echoUntil.set(sessionId, now() + echoWindowMs)
    // O que já esperava não pode ficar atrás do eco.
    flush(sessionId)
  }

  function forget(sessionId) {
    echoUntil.delete(sessionId)
  }

  function stopTimer() {
    if (timer !== null) {
      clearTimer(timer)
      timer = null
    }
  }

  return { push, flush, flushAll, discard, noteInput, forget }
}

module.exports = {
  DEFAULT_ECHO_WINDOW_MS,
  DEFAULT_MAX_CHARS,
  DEFAULT_WINDOW_MS,
  createPtyDataBatcher,
}

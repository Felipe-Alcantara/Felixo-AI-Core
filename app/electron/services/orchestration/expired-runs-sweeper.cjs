/**
 * @module orchestration/expired-runs-sweeper
 * Varredura periódica dos runs de orquestração que estouraram o tempo.
 *
 * `failExpiredRuns` existia mas nunca era chamado em produção: o limite de
 * `maxRuntimeMinutes` só era verificado quando chegava um evento (spawn,
 * conclusão de agente, reinvocação do orquestrador). Um run parado em
 * `waiting_agents` — porque o sub-agente travou sem emitir `done` nem `error`
 * — não gera evento nenhum, então nada o expirava: ficava preso para sempre,
 * segurando seu contexto, e a UI seguia em "aguardando agentes".
 *
 * Este módulo dá o pulso que faltava. Fica separado do runner porque o runner
 * é lógica pura sobre eventos, e agendamento é efeito.
 */

/** Um minuto é fino o bastante: os limites são medidos em minutos. */
const DEFAULT_SWEEP_INTERVAL_MS = 60_000

/**
 * Começa a varrer periodicamente e devolve a função que interrompe.
 *
 * @param {object} options
 * @param {() => unknown} options.failExpiredRuns - Normalmente
 *   `orchestrationRunner.failExpiredRuns` já ligado ao runner.
 * @param {number} [options.intervalMs]
 * @param {(error: Error) => void} [options.onError] - Recebe a exceção de uma
 *   varredura; sem isso o erro é engolido de propósito (ver abaixo).
 * @param {typeof setInterval} [options.setInterval] - Injetável para teste.
 * @param {typeof clearInterval} [options.clearInterval] - Injetável para teste.
 * @returns {() => void} `stop`, idempotente.
 */
function startExpiredRunsSweeper({
  failExpiredRuns,
  intervalMs = DEFAULT_SWEEP_INTERVAL_MS,
  onError,
  setInterval: setIntervalFn = setInterval,
  clearInterval: clearIntervalFn = clearInterval,
}) {
  const sweep = () => {
    try {
      failExpiredRuns()
    } catch (error) {
      // A varredura roda solta num timer: deixar a exceção escapar viraria um
      // unhandled error no processo principal, e as varreduras seguintes
      // precisam continuar acontecendo de qualquer forma.
      onError?.(error instanceof Error ? error : new Error(String(error)))
    }
  }

  const handle = setIntervalFn(sweep, intervalMs)
  // Sem unref(), um intervalo vivo segura o event loop e atrasa o encerramento
  // do app.
  handle?.unref?.()

  let stopped = false
  return () => {
    if (stopped) {
      return
    }
    stopped = true
    clearIntervalFn(handle)
  }
}

module.exports = {
  DEFAULT_SWEEP_INTERVAL_MS,
  startExpiredRunsSweeper,
}

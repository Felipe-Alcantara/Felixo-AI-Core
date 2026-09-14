'use strict'

/**
 * Handlers globais de erro do processo principal — a lacuna que a task
 * "Observabilidade" encontrou: nenhum `uncaughtException`, `unhandledRejection`,
 * `render-process-gone` nem `child-process-gone` era tratado, então a maioria
 * dos travamentos relatados pelo Felipe não deixava rastro nenhum.
 *
 * Cada handler aqui só REGISTRA (via `log`, tipicamente `logQaEvent`) — não
 * decide se o processo continua ou encerra. `uncaughtException`/
 * `unhandledRejection` deixam o Electron seguir seu comportamento padrão
 * depois do log (não chamam `process.exit`); interromper esconderia o
 * problema real atrás de um encerramento silencioso.
 */

/**
 * @param {{
 *   log: (entry: { level: string, scope: string, message: string, details?: unknown }) => unknown,
 *   processObj?: NodeJS.Process,
 *   electronApp?: import('electron').App,
 * }} options
 */
function registerGlobalErrorHandlers({ log, processObj = process, electronApp } = {}) {
  processObj.on('uncaughtException', (error) => {
    log({
      level: 'error',
      scope: 'main:uncaughtException',
      message: errorMessage(error),
      details: errorDetails(error),
    })
  })

  processObj.on('unhandledRejection', (reason) => {
    log({
      level: 'error',
      scope: 'main:unhandledRejection',
      message: errorMessage(reason),
      details: errorDetails(reason),
    })
  })

  if (!electronApp) return

  // `render-process-gone` cobre crash, oom-killer, kill por sandbox e afins
  // — `details.reason` já vem do Chromium com o motivo específico.
  electronApp.on('render-process-gone', (_event, webContents, details) => {
    log({
      level: 'error',
      scope: 'main:render-process-gone',
      message: `O processo do renderer encerrou: ${details?.reason ?? 'motivo desconhecido'}.`,
      details: {
        reason: details?.reason ?? null,
        exitCode: details?.exitCode ?? null,
        webContentsId: safeWebContentsId(webContents),
      },
    })
  })

  // Utility processes (ex.: rede, extensões) — mesmo princípio, sem
  // interromper nada: o app decide sozinho se precisa relançar o que caiu.
  electronApp.on('child-process-gone', (_event, details) => {
    log({
      level: 'error',
      scope: 'main:child-process-gone',
      message: `Um processo auxiliar (${details?.type ?? 'desconhecido'}) encerrou: ${details?.reason ?? 'motivo desconhecido'}.`,
      details: {
        type: details?.type ?? null,
        reason: details?.reason ?? null,
        exitCode: details?.exitCode ?? null,
        name: details?.name ?? null,
      },
    })
  })
}

function safeWebContentsId(webContents) {
  try {
    return webContents?.isDestroyed?.() ? null : (webContents?.id ?? null)
  } catch {
    return null
  }
}

/**
 * Envolve `ipcMain.handle` para logar canal + causa quando o handler lança,
 * sem mudar o contrato pra quem chama: o erro original ainda é rejeitado
 * pro invoker, só passa pelo log antes. Feito uma vez, no `ipcMain`
 * verdadeiro — cobre todo handler registrado depois, em qualquer módulo,
 * sem precisar tocar cada `ipcMain.handle` do projeto um por um.
 *
 * @param {import('electron').IpcMain} ipcMainInstance
 * @param {(entry: { level: string, scope: string, message: string, details?: unknown }) => unknown} log
 */
function wrapIpcHandleWithLogging(ipcMainInstance, log) {
  const originalHandle = ipcMainInstance.handle

  ipcMainInstance.handle = (channel, listener) => {
    return originalHandle.call(ipcMainInstance, channel, async (event, ...args) => {
      try {
        return await listener(event, ...args)
      } catch (error) {
        log({
          level: 'error',
          scope: 'main:ipc',
          message: `O canal IPC "${channel}" falhou: ${errorMessage(error)}`,
          details: { channel, ...errorDetails(error) },
        })
        throw error
      }
    })
  }

  return () => {
    ipcMainInstance.handle = originalHandle
  }
}

function errorMessage(error) {
  if (error instanceof Error) return error.message || error.name || 'Erro sem mensagem.'
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

/** `error.cause` — quando quem lançou encadeou a causa raiz, ela vai junto, não só o sintoma. */
function errorDetails(error) {
  if (!(error instanceof Error)) return { value: safeStringify(error) }
  const details = { name: error.name, stack: error.stack ?? null }
  if (error.cause !== undefined) {
    details.cause = error.cause instanceof Error ? errorMessage(error.cause) : safeStringify(error.cause)
  }
  if ('code' in error && (typeof error.code === 'string' || typeof error.code === 'number')) {
    details.code = error.code
  }
  return details
}

function safeStringify(value) {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

module.exports = { registerGlobalErrorHandlers, wrapIpcHandleWithLogging }

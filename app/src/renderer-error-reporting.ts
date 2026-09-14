import type { QaLogEntryInput } from './features/shared/types/qa-log'

/**
 * Handlers globais de erro do renderer — a outra metade da lacuna que a task
 * "Observabilidade" encontrou. O processo principal já ganhou
 * `uncaughtException`/`unhandledRejection` (ver `global-error-handlers.cjs`);
 * sem o espelho aqui, um erro fora de um componente React (evento de DOM,
 * `setTimeout`, promise solta) nunca chegava a lugar nenhum — nem
 * `console.error`, nem o QA Logger.
 *
 * Funções puras primeiro (`buildWindowErrorEntry`/`buildUnhandledRejectionEntry`),
 * pra testar sem precisar de `window` de verdade; `installRendererErrorReporting`
 * só liga os dois no `window` real.
 */

export function buildWindowErrorEntry(event: {
  message?: string
  filename?: string
  lineno?: number
  colno?: number
  error?: unknown
}): QaLogEntryInput {
  const error = event.error
  return {
    level: 'error',
    scope: 'renderer:window-error',
    message: errorMessage(error) || event.message || 'Erro sem mensagem.',
    details: {
      filename: event.filename ?? null,
      lineno: event.lineno ?? null,
      colno: event.colno ?? null,
      stack: errorStack(error),
    },
  }
}

export function buildUnhandledRejectionEntry(event: { reason?: unknown }): QaLogEntryInput {
  const reason = event.reason
  return {
    level: 'error',
    scope: 'renderer:unhandled-rejection',
    message: errorMessage(reason) || 'Promise rejeitada sem motivo.',
    details: { stack: errorStack(reason) },
  }
}

/** Mesma extração usada pelos handlers do main (`global-error-handlers.cjs`) — mensagem legível tanto de `Error` quanto de valor solto. */
function errorMessage(value: unknown): string {
  if (value instanceof Error) return value.message || value.name
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return ''
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function errorStack(value: unknown): string | null {
  return value instanceof Error ? (value.stack ?? null) : null
}

/**
 * Liga os dois handlers no `window` real e manda cada entrada pro backend
 * via `window.felixo.qaLogger.log` — o mesmo caminho que qualquer log do
 * renderer já usa, então a entrada aparece no painel e é persistida em disco
 * (`qa-log-disk-store.cjs`) do mesmo jeito.
 *
 * Chamado uma vez, no bootstrap (`main.tsx`). Devolve uma função de limpeza
 * pelo mesmo motivo que os outros listeners globais do app: previsível em
 * teste, mesmo que o app real nunca precise desmontar isto.
 */
export function installRendererErrorReporting(target: Window = window): () => void {
  const onError = (event: ErrorEvent) => {
    void target.felixo?.qaLogger?.log(buildWindowErrorEntry(event))
  }
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    void target.felixo?.qaLogger?.log(buildUnhandledRejectionEntry(event))
  }

  target.addEventListener('error', onError)
  target.addEventListener('unhandledrejection', onUnhandledRejection)

  return () => {
    target.removeEventListener('error', onError)
    target.removeEventListener('unhandledrejection', onUnhandledRejection)
  }
}

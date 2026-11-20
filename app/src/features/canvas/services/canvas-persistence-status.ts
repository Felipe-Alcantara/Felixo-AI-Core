import { useSyncExternalStore } from 'react'

/**
 * Falhas de gravação do canvas que a pessoa precisa ver.
 *
 * Salvar bloco, conexão ou arquivo é "melhor esforço": o canvas continua
 * usável em memória. Só que, sem aviso, a falha aparece no próximo início como
 * bloco que voltou ou conexão que sumiu. Cada falha fica registrada por chave
 * (`node:<id>`, `edge:<id>`, `file:<origem>`) até a próxima gravação daquela
 * mesma chave dar certo.
 */
const failures = new Map<string, string>()
const listeners = new Set<() => void>()
let snapshot: readonly string[] = []

function publish() {
  snapshot = [...new Set(failures.values())]
  listeners.forEach((listener) => listener())
}

export function reportPersistenceFailure(key: string, message: string): void {
  if (failures.get(key) === message) return
  failures.set(key, message)
  publish()
}

const actionTimers = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * Falha de uma ação da pessoa que não tem lugar próprio na tela (ligar um arquivo a um agente, escolher um arquivo,
 * cancelar uma imagem): aparece na barra de status e some sozinha depois de `ttlMs`, ou quando a mesma ação dá certo.
 * Antes o erro era engolido e a pessoa achava que a ação tinha funcionado.
 */
export function reportActionFailure(key: string, message: string, ttlMs = 8000): void {
  const timerKey = `acao:${key}`
  const previous = actionTimers.get(timerKey)
  if (previous) clearTimeout(previous)
  reportPersistenceFailure(timerKey, message)
  actionTimers.set(
    timerKey,
    setTimeout(() => {
      actionTimers.delete(timerKey)
      clearPersistenceFailure(timerKey)
    }, ttlMs),
  )
}

export function clearPersistenceFailure(key: string): void {
  if (failures.delete(key)) publish()
}

export function getPersistenceFailures(): readonly string[] {
  return snapshot
}

export function resetPersistenceFailuresForTests(): void {
  for (const timer of actionTimers.values()) clearTimeout(timer)
  actionTimers.clear()
  failures.clear()
  publish()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Mensagens distintas das falhas de gravação ainda sem resolver. */
export function usePersistenceFailures(): readonly string[] {
  return useSyncExternalStore(subscribe, getPersistenceFailures, getPersistenceFailures)
}

/** Texto de uma resposta `{ ok: false }` ou de uma exceção do IPC. */
export function describeFailure(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message) return message
  }
  return fallback
}

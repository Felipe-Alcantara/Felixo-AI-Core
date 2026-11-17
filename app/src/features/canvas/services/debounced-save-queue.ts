/**
 * Gravação com debounce por chave que não perde a última edição.
 *
 * Os painéis agrupam as teclas antes de gravar. Cancelar o timer ao fechar o
 * painel (Esc, trocar de ferramenta, voltar ao Chat) jogava fora o que ainda
 * esperava; aqui a saída chama `flush`, que grava o pendente na hora.
 */
export type DebouncedSaveQueue<T> = {
  /** Agenda a gravação de `key`, substituindo a anterior ainda pendente. */
  schedule: (key: string, value: T) => void
  /** Descarta a gravação pendente de `key` (o item foi removido). */
  cancel: (key: string) => void
  /** Descarta todas as pendentes (o canvas inteiro foi substituído). */
  cancelAll: () => void
  /** Grava agora tudo o que estava esperando. */
  flush: () => void
  /** Troca quem grava (para quem só conhece o salvamento depois de montar). */
  setSave: (save: (key: string, value: T) => void) => void
}

export function createDebouncedSaveQueue<T>(
  initialSave: (key: string, value: T) => void,
  delayMs: number,
): DebouncedSaveQueue<T> {
  let save = initialSave
  const pending = new Map<string, { timer: ReturnType<typeof setTimeout>; value: T }>()

  return {
    setSave(next) {
      save = next
    },
    schedule(key, value) {
      const existing = pending.get(key)
      if (existing) clearTimeout(existing.timer)
      pending.set(key, {
        value,
        timer: setTimeout(() => {
          pending.delete(key)
          save(key, value)
        }, delayMs),
      })
    },
    cancel(key) {
      const existing = pending.get(key)
      if (!existing) return
      clearTimeout(existing.timer)
      pending.delete(key)
    },
    cancelAll() {
      pending.forEach((entry) => clearTimeout(entry.timer))
      pending.clear()
    },
    flush() {
      const entries = [...pending]
      pending.clear()
      for (const [key, entry] of entries) {
        clearTimeout(entry.timer)
        save(key, entry.value)
      }
    },
  }
}

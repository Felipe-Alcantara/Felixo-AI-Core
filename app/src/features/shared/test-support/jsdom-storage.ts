import { vi } from 'vitest'

/**
 * `localStorage` em memória para os testes de interface (jsdom). O Node 25 traz um `localStorage` próprio, experimental,
 * que cobre o do jsdom e não tem os métodos (`clear is not a function`); no Node 22 do CI isto não acontece, mas o
 * teste não deve depender da versão. Devolve o armazenamento para o teste semear ou conferir chaves.
 */
export function instalarLocalStorageEmMemoria(): Storage {
  const dados = new Map<string, string>()
  const storage: Storage = {
    get length() {
      return dados.size
    },
    clear: () => dados.clear(),
    getItem: (chave) => dados.get(chave) ?? null,
    key: (indice) => [...dados.keys()][indice] ?? null,
    removeItem: (chave) => void dados.delete(chave),
    setItem: (chave, valor) => void dados.set(chave, String(valor)),
  }
  vi.stubGlobal('localStorage', storage)
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true })
  return storage
}

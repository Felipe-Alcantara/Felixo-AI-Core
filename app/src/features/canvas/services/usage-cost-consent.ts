/**
 * Confirmação de custo dos recursos que cobram por uso (geração de imagem pelo
 * OpenRouter, ditado pela nuvem): nada é cobrado sem um "sim" explícito da
 * pessoa, e quem usa muito pode marcar "não perguntar de novo" — a escolha
 * fica lembrada por recurso e destino (o modelo de imagem; o endereço e o
 * modelo de transcrição), porque trocar de modelo troca o preço.
 */

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>

export const COST_CONSENT_STORAGE_KEY = 'felixo:cost-consent'

/** Destinos lembrados; lista curta para o localStorage não crescer sem limite. */
const MAX_REMEMBERED = 100

export type CostConsent = {
  /** A pessoa já marcou "não perguntar de novo" para este destino? */
  has: (key: string) => boolean
  remember: (key: string) => void
  forget: (key: string) => void
}

export const imageCostConsentKey = (model: string) => `imagem:${model}`
export const dictationCostConsentKey = (baseUrl: string, model: string) => `ditado:${baseUrl} ${model}`

export function createCostConsent(storage: () => KeyValueStorage | undefined): CostConsent {
  function read(): string[] {
    try {
      const parsed: unknown = JSON.parse(storage()?.getItem(COST_CONSENT_STORAGE_KEY) ?? '[]')
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
    } catch {
      // Registro ilegível vale como "nada lembrado": na dúvida, pergunta de novo.
      return []
    }
  }

  function write(keys: string[]) {
    try {
      storage()?.setItem(COST_CONSENT_STORAGE_KEY, JSON.stringify(keys.slice(-MAX_REMEMBERED)))
    } catch {
      // Sem armazenamento a escolha não fica lembrada; perguntar de novo é o lado seguro.
    }
  }

  return {
    has: (key) => read().includes(key),
    remember(key) {
      write([...read().filter((item) => item !== key), key])
    },
    forget(key) {
      write(read().filter((item) => item !== key))
    },
  }
}

export const costConsent = createCostConsent(() => (typeof window === 'undefined' ? undefined : window.localStorage))

/** Claude API: a conta por chave é cobrada por token; o aviso vale por conta. */
export const claudeApiCostConsentKey = (accountId: string) => `claude-api:${accountId}`

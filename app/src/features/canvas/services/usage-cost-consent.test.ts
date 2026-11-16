import { describe, expect, it } from 'vitest'
import {
  COST_CONSENT_STORAGE_KEY,
  createCostConsent,
  dictationCostConsentKey,
  imageCostConsentKey,
} from './usage-cost-consent'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  }
}

describe('confirmação de custo lembrada', () => {
  it('lembra por destino, sobrevive a reabrir e pode ser desfeita', () => {
    const storage = memoryStorage()
    const consent = createCostConsent(() => storage)
    const imagem = imageCostConsentKey('acme/pixel-1')
    const ditado = dictationCostConsentKey('https://api.openai.com/v1', 'whisper-1')

    expect(consent.has(imagem)).toBe(false)
    consent.remember(imagem)
    consent.remember(imagem)
    expect(createCostConsent(() => storage).has(imagem)).toBe(true)
    expect(consent.has(imageCostConsentKey('acme/pixel-2'))).toBe(false)
    expect(consent.has(ditado)).toBe(false)
    expect(JSON.parse(storage.data.get(COST_CONSENT_STORAGE_KEY) ?? '[]')).toEqual([imagem])

    consent.forget(imagem)
    expect(consent.has(imagem)).toBe(false)
  })

  it('o modelo e o endereço do ditado fazem parte da escolha: trocar qualquer um pergunta de novo', () => {
    const consent = createCostConsent(() => memoryStorage())
    consent.remember(dictationCostConsentKey('https://api.openai.com/v1', 'whisper-1'))
    expect(consent.has(dictationCostConsentKey('https://api.openai.com/v1', 'gpt-4o-transcribe'))).toBe(false)
    expect(consent.has(dictationCostConsentKey('https://api.groq.com/openai/v1', 'whisper-1'))).toBe(false)
  })

  it('registro ilegível ou armazenamento bloqueado valem como "nada lembrado": pergunta de novo', () => {
    const lixo = createCostConsent(() => memoryStorage({ [COST_CONSENT_STORAGE_KEY]: '{não é json' }))
    expect(lixo.has(imageCostConsentKey('acme/pixel-1'))).toBe(false)
    const objeto = createCostConsent(() => memoryStorage({ [COST_CONSENT_STORAGE_KEY]: '{"imagem:acme/pixel-1":true}' }))
    expect(objeto.has(imageCostConsentKey('acme/pixel-1'))).toBe(false)

    const bloqueado = createCostConsent(() => {
      throw new Error('bloqueado')
    })
    expect(() => bloqueado.remember('x')).not.toThrow()
    expect(bloqueado.has('x')).toBe(false)
  })
})

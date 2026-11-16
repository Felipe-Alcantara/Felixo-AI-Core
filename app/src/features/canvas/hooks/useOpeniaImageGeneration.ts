import { useSyncExternalStore } from 'react'
import { openiaImageStore } from '../services/openia-image-store'

/**
 * Estado e ações da geração de imagem pelo Openia. O estado vive na store (não
 * no componente) para sobreviver ao botão desmontar no meio de uma geração.
 */
export function useOpeniaImageGeneration() {
  const snapshot = useSyncExternalStore(openiaImageStore.subscribe, openiaImageStore.getSnapshot)
  return {
    ...snapshot,
    loadModels: openiaImageStore.loadModels,
    loadPricing: openiaImageStore.loadPricing,
    setPrompt: openiaImageStore.setPrompt,
    setModel: openiaImageStore.setModel,
    forgetCostChoice: openiaImageStore.forgetCostChoice,
    generate: openiaImageStore.generate,
    cancel: openiaImageStore.cancel,
    acknowledge: openiaImageStore.acknowledge,
  }
}

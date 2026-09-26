/**
 * Sugestão de ligar o Modo Performance em máquina com poucas CPUs lógicas.
 *
 * Só sugere: quem liga é a pessoa, pelo botão da sugestão ou pelas
 * Configurações. A resposta (ligar ou "agora não") fica lembrada, e a
 * sugestão não volta — nem se a pessoa desligar o modo depois, porque aí a
 * escolha foi consciente.
 */

/** Como o processo principal descreve a máquina (`hardware:get-profile`). */
export type HardwareProfile = {
  logicalCpuCount: number | null
  lowCpu: boolean
  lowCpuThreshold: number
  /** Falso na instância de automação, salvo pedido explícito. */
  suggestPerformanceMode: boolean
}

const SUGGESTION_STORAGE_KEY = 'felixo-ai-core.performance-suggestion'
const ANSWERED = 'answered'

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

function defaultStorage(): StorageLike | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function loadSuggestionAnswered(storage: StorageLike | null = defaultStorage()): boolean {
  try {
    return storage?.getItem(SUGGESTION_STORAGE_KEY) === ANSWERED
  } catch {
    return false
  }
}

export function saveSuggestionAnswered(storage: StorageLike | null = defaultStorage()) {
  try {
    storage?.setItem(SUGGESTION_STORAGE_KEY, ANSWERED)
  } catch {
    // Sem localStorage a resposta vale só nesta sessão; não é motivo de erro.
  }
}

export function shouldSuggestPerformanceMode({
  profile,
  performanceMode,
  answered,
}: {
  profile: HardwareProfile | null
  performanceMode: boolean
  answered: boolean
}): boolean {
  return Boolean(profile?.lowCpu && profile.suggestPerformanceMode) && !performanceMode && !answered
}

/** Texto da sugestão, com o número desta máquina e o ganho medido. */
export function describeLowCpuSuggestion(profile: HardwareProfile): string {
  const cpus =
    profile.logicalCpuCount === null
      ? 'poucos processadores lógicos'
      : `${profile.logicalCpuCount} ${profile.logicalCpuCount === 1 ? 'processador lógico' : 'processadores lógicos'}`
  return (
    `Este computador tem ${cpus}. Numa máquina assim, o Modo Performance deixou a ` +
    'interface de 16% a 23% mais fluida nas medições do projeto. Dá para mudar depois em Configurações.'
  )
}

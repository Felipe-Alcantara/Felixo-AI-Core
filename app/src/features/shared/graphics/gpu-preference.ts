import type { FelixoSelectOption } from '../components/FelixoSelect'

/**
 * Preferência de placa de vídeo, como o processo principal descreve em
 * `graphics:get-config` (`electron/services/gpu-preference-session.cjs`).
 */
export type GpuPreference = 'auto' | 'integrada' | 'dedicada'

export type GpuFallbackReason =
  | 'previous-start-unfinished'
  | 'gpu-disabled'
  | 'vulkan-unavailable'
  | 'gpu-process-gone'
  | 'relaunch-failed'

export type GpuFallback = {
  from: Exclude<GpuPreference, 'auto'>
  reason: GpuFallbackReason
  at: string | null
  detail: string | null
}

export type GpuPreferenceStatus = {
  /** Salva no perfil; vale a partir da próxima abertura. */
  preference: GpuPreference
  /** O que esta abertura aplicou de fato. */
  applied: GpuPreference
  notApplied: 'software-rendering' | 'unsupported-platform' | 'profile-unwritable' | null
  sessionOutcome: 'not-guarded' | 'pending' | 'healthy' | 'reverted'
  supported: boolean
  unsupportedReason: string | null
  fallback: GpuFallback | null
  devices: { vendorId: number; deviceId: number }[]
  multipleGpus: boolean
}

export const GPU_PREFERENCE_OPTIONS: FelixoSelectOption[] = [
  {
    value: 'auto',
    label: 'Automático',
    description: 'O sistema decide, como sempre foi.',
  },
  {
    value: 'integrada',
    label: 'Integrada',
    description: 'Gasta menos bateria.',
  },
  {
    value: 'dedicada',
    label: 'Dedicada (experimental)',
    description: 'Mais fluidez, mais consumo de bateria.',
  },
]

const PREFERENCE_LABEL: Record<GpuPreference, string> = {
  auto: 'Automático',
  integrada: 'Integrada',
  dedicada: 'Dedicada',
}

export function gpuPreferenceLabel(preference: GpuPreference): string {
  return PREFERENCE_LABEL[preference]
}

export function isGpuPreference(value: string): value is GpuPreference {
  return value === 'auto' || value === 'integrada' || value === 'dedicada'
}

/**
 * A escolha só faz sentido com duas placas ou mais. Com uma só, a opção nem
 * aparece; sem mecanismo no sistema, aparece desligada e com o motivo.
 */
export function shouldShowGpuChoice(status: GpuPreferenceStatus | null | undefined): boolean {
  return Boolean(status?.multipleGpus)
}

/** Texto do aviso de volta automática para Automático, em linguagem de quem usa. */
export function describeGpuFallback(fallback: GpuFallback): string {
  const placa = fallback.from === 'dedicada' ? 'placa de vídeo dedicada' : 'placa de vídeo integrada'
  const nextStart = 'A escolha volta para Automático na próxima vez que o Felixo abrir.'
  switch (fallback.reason) {
    case 'previous-start-unfinished':
      return `Com a ${placa}, o Felixo não terminou de abrir da última vez (travou ou fechou antes). Por segurança, a escolha voltou para Automático.`
    case 'gpu-disabled':
      return `A ${placa} subiu sem aceleração nesta abertura. ${nextStart}`
    case 'vulkan-unavailable':
      return `A ${placa} depende do Vulkan, e ele não ligou nesta abertura. ${nextStart}`
    case 'gpu-process-gone':
      return `O processo de vídeo caiu usando a ${placa}. ${nextStart}`
    case 'relaunch-failed':
      return `O Felixo foi aberto com variáveis que mandam o vídeo para a placa dedicada (como as do prime-run) e não conseguiu reabrir sozinho sem elas para usar a ${placa}. Por segurança, a escolha voltou para Automático. Para usar a integrada, abra o Felixo sem essas variáveis.`
  }
}

/** O que esta abertura aplicou, para a pessoa não confundir com o que está salvo. */
export function describeAppliedGpu(status: GpuPreferenceStatus): string {
  if (status.notApplied === 'software-rendering') {
    return 'Nesta abertura o app está no modo compatível (sem GPU), então a escolha não tem efeito.'
  }
  if (status.notApplied === 'profile-unwritable') {
    return 'Nesta abertura o app não conseguiu gravar no perfil e ficou no Automático, por segurança.'
  }
  const applied = `Nesta abertura: ${gpuPreferenceLabel(status.applied)}.`
  return status.preference === status.applied
    ? applied
    : `${applied} Na próxima: ${gpuPreferenceLabel(status.preference)}.`
}

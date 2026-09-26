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
  /**
   * Por que esta abertura não aplicou a escolha salva. `relaunch-in-progress`:
   * ela aconteceu enquanto outra reabria o app com o ambiente limpo.
   */
  notApplied: 'software-rendering' | 'unsupported-platform' | 'profile-unwritable' | 'relaunch-in-progress' | null
  sessionOutcome: 'not-guarded' | 'pending' | 'healthy' | 'reverted'
  supported: boolean
  unsupportedReason: string | null
  fallback: GpuFallback | null
  /**
   * Entradas do `getGPUInfo` que não são renderizador por software. No Windows
   * podem incluir NPUs (o Chromium as lista junto): não conte placas por aqui;
   * quem diz se há escolha é `multipleGpus`.
   */
  devices: { vendorId: number; deviceId: number }[]
  multipleGpus: boolean
  /** Opções que não teriam efeito nesta máquina, com o motivo (ver `electron/core/gpu-devices.cjs`). */
  unavailablePreferences?: Partial<Record<Exclude<GpuPreference, 'auto'>, GpuUnavailableReason>>
}

/** macOS com placa NVIDIA: a lista de bugs de driver do Chromium força a placa de baixo consumo. */
export type GpuUnavailableReason = 'macos-nvidia-forced-low-power'

const UNAVAILABLE_REASON_TEXT: Record<GpuUnavailableReason, string> = {
  'macos-nvidia-forced-low-power':
    'No macOS com placa NVIDIA, o próprio Chromium força a placa de baixo consumo, então a Dedicada não teria efeito.',
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
 *
 * Exceção: com uma escolha salva que não é Automático, o campo aparece mesmo
 * sem duas placas (a dedicada desligada no MUX, uma eGPU desconectada, o modo
 * compatível, em que o app não lê as placas), para a pessoa poder voltar para
 * Automático pela tela. No Linux a Dedicada salva continua valendo com uma
 * placa só. Depois de a pessoa salvar (`justSaved`), o campo continua na tela
 * com a confirmação, mesmo que a escolha nova seja Automático.
 */
export function shouldShowGpuChoice(
  status: GpuPreferenceStatus | null | undefined,
  { justSaved = false }: { justSaved?: boolean } = {},
): boolean {
  if (!status) return false
  return status.multipleGpus || status.preference !== 'auto' || justSaved
}

/**
 * Por que só Automático pode ser escolhido nesta abertura, ou `null` quando as
 * três opções valem.
 */
export function describeGpuChoiceLimit(status: GpuPreferenceStatus): string | null {
  if (status.multipleGpus) {
    const reasons = Object.values(status.unavailablePreferences ?? {})
    return reasons.length > 0 ? reasons.map((reason) => UNAVAILABLE_REASON_TEXT[reason]).join(' ') : null
  }
  if (status.notApplied === 'software-rendering') {
    return 'No modo compatível (sem GPU) o Felixo não lê as placas de vídeo e a escolha salva não tem efeito; só dá para voltar para Automático.'
  }
  return 'Nesta abertura o Felixo não encontrou duas placas de vídeo, então só dá para voltar para Automático.'
}

/** As opções do seletor, com as que não valem nesta abertura desligadas e o motivo na descrição. */
export function gpuPreferenceOptions(status: GpuPreferenceStatus): FelixoSelectOption[] {
  return GPU_PREFERENCE_OPTIONS.map((option) => {
    if (option.value === 'auto') return option
    if (!status.multipleGpus) return { ...option, disabled: true, description: 'Indisponível nesta abertura.' }
    const unavailable = status.unavailablePreferences?.[option.value as Exclude<GpuPreference, 'auto'>]
    return unavailable ? { ...option, disabled: true, description: 'Sem efeito neste computador.' } : option
  })
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
  if (status.notApplied === 'relaunch-in-progress') {
    return `Esta abertura aconteceu enquanto o Felixo reabria para usar a ${gpuPreferenceLabel(status.preference)}, então ficou no Automático, sem mudar a escolha.`
  }
  const applied = `Nesta abertura: ${gpuPreferenceLabel(status.applied)}.`
  return status.preference === status.applied
    ? applied
    : `${applied} Na próxima: ${gpuPreferenceLabel(status.preference)}.`
}

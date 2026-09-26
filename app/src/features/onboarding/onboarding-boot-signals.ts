import type { OnboardingBootSignals as BootSignals } from './onboarding-state'

/**
 * Sinais de uso anterior, lidos em `main.tsx` ANTES do primeiro render.
 *
 * O tema e o Modo Performance gravam as chaves deles no localStorage já no
 * mount, então olhar depois diria "já usou" até no primeiro boot. A foto das
 * chaves `felixo*` é tirada antes do `createRoot`.
 *
 * O marcador de primeiro boot cobre o boot interrompido: sem nenhuma chave
 * `felixo*`, ele é gravado; se o app fechar antes de o tutorial ser
 * reivindicado, o boot seguinte encontra as chaves do tema, mas também o
 * marcador, e continua sendo primeiro uso. A store apaga o marcador quando o
 * estado do tutorial passa a existir.
 *
 * Este módulo entra no chunk de entrada: fica pequeno e sem React.
 */

export const FIRST_BOOT_MARKER_KEY = 'felixo:onboarding:primeiro-boot'

/** Prefixos das chaves do app; as do próprio tutorial não contam como uso. */
const APP_KEY_PREFIXES = ['felixo-ai-core.', 'felixo:', 'felixo.']
const OWN_KEY_PREFIX = 'felixo:onboarding:'

/** Sem leitura possível, a resposta nunca abre o tutorial por engano. */
export const CONSERVATIVE_BOOT_SIGNALS: BootSignals = Object.freeze({ chavesFelixo: true, marcadorPrimeiroBoot: false })

type BootStorage = Pick<Storage, 'getItem' | 'setItem' | 'key' | 'length'>

let captured: BootSignals | null = null

function isAppKey(key: string | null): boolean {
  return key !== null && !key.startsWith(OWN_KEY_PREFIX) && APP_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
}

/**
 * Tira a foto dos sinais e grava o marcador quando não há nenhuma chave do app.
 * Um storage que lança devolve o padrão conservador.
 */
export function captureOnboardingBootSignals(storage: BootStorage | null | undefined): BootSignals {
  let signals: BootSignals
  try {
    if (!storage) throw new Error('sem localStorage')
    const marker = storage.getItem(FIRST_BOOT_MARKER_KEY) === '1'
    let appKeys = false
    for (let index = 0; index < storage.length; index++) {
      if (isAppKey(storage.key(index))) {
        appKeys = true
        break
      }
    }
    if (!appKeys && !marker) {
      storage.setItem(FIRST_BOOT_MARKER_KEY, '1')
      signals = { chavesFelixo: false, marcadorPrimeiroBoot: true }
    } else {
      signals = { chavesFelixo: appKeys, marcadorPrimeiroBoot: marker }
    }
  } catch {
    signals = CONSERVATIVE_BOOT_SIGNALS
  }
  captured = Object.freeze(signals)
  return captured
}

/** Os sinais capturados no boot; sem captura, o padrão conservador. */
export function getOnboardingBootSignals(): BootSignals {
  return captured ?? CONSERVATIVE_BOOT_SIGNALS
}

/** Apaga o marcador quando o estado do tutorial já existe (a partir daí, o SQLite decide). */
export function clearFirstBootMarker(storage: Pick<Storage, 'removeItem'> | null | undefined): void {
  try {
    storage?.removeItem(FIRST_BOOT_MARKER_KEY)
  } catch {
    // Sem storage, o marcador fica; o estado no SQLite já impede a reabertura.
  }
}

/** Só para testes: esquece a captura do boot. */
export function resetOnboardingBootSignalsForTests(): void {
  captured = null
}

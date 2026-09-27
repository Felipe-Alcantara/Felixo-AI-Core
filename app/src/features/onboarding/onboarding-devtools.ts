/**
 * Falha forçada do tutorial, só na instância de automação.
 *
 * O smoke prova que uma falha de render do tutorial fica isolada (o canvas
 * continua de pé) gravando `sessionStorage['felixo:onboarding:falha'] = 'render'`.
 * O sinal só vale com a ponte `window.felixo.devtools`, que existe apenas na
 * instância isolada do `felixo devtools`: no app normal a chave é ignorada.
 */

export const DEVTOOLS_FAULT_KEY = 'felixo:onboarding:falha'

export type OnboardingFault = 'render'

type FaultWindow = {
  felixo?: { devtools?: unknown }
  sessionStorage?: Pick<Storage, 'getItem'>
}

export function readDevtoolsFault(win: FaultWindow | null | undefined): OnboardingFault | null {
  try {
    if (!win?.felixo?.devtools) return null
    return win.sessionStorage?.getItem(DEVTOOLS_FAULT_KEY) === 'render' ? 'render' : null
  } catch {
    return null
  }
}

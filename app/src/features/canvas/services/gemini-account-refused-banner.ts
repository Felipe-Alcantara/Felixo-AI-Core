// Faixa do bloco do Gemini CLI quando o Google recusa a conta pessoal ao entrar.
// A recusa só aparece na tela de login da CLI (0.62.0: "This client is no longer
// supported for Gemini Code Assist for individuals", com a indicação da suíte
// Antigravity), em inglês e longe de qualquer botão; o painel de contas já a
// explica ao conferir o login. A faixa leva a explicação e o caminho (a
// Antigravity) para onde a pessoa está olhando. Só .ts puro: o vitest roda em
// node, sem DOM.

export type GeminiAccountRefusedBanner = {
  title: string
  detail: string
}

/** A frase do Google, que a CLI quebra de linha no meio. */
const REFUSAL = /no\s+longer\s+supported\s+for\s+Gemini\s+Code\s+Assist\s+for\s+individuals/i

/**
 * A tela mostra a recusa? A frase vem dentro da caixa do diálogo de login: sem
 * as bordas `│`, a quebra de linha no meio dela não a esconde.
 */
export function showsGeminiAccountRefusal(screen: string): boolean {
  return REFUSAL.test(screen.replace(/[│┃]/g, ' '))
}

export function geminiAccountRefusedBanner(params: {
  providerId: string
  /** `snapshot.accountRefused`, do terminal vivo. */
  accountRefused?: boolean
}): GeminiAccountRefusedBanner | null {
  if (params.providerId !== 'gemini' || !params.accountRefused) return null
  return {
    title: 'O Google não aceita mais conta pessoal no Gemini CLI',
    detail:
      'Desde 18/06/2026 o Gemini CLI recusa contas pessoais do Google (Gemini Code Assist para indivíduos). ' +
      'Para usar essa conta, abra um agente Antigravity (comando agy), a CLI que o Google indica no lugar.',
  }
}

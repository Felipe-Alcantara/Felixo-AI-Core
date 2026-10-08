// Faixa do bloco quando o `openia run` sai porque o OpenRouter recusou a chave.
// O Openia 0.2.0 testa a chave antes de lançar a ferramenta e sai com código 3
// (o mesmo da autenticação do `openia image`); antes, o Claude Code em `-p`
// ficava parado e calado com a chave recusada. A resposta do OpenRouter já
// aparece no terminal; a faixa diz, fora dele, onde trocar a chave no Felixo.
// Só .ts puro: o vitest roda em node, sem DOM.

/** Mesmo número de `OPENIA_CHAVE_RECUSADA` em `electron/services/pty-process-manager.cjs`. */
export const OPENIA_CHAVE_RECUSADA = 3

export type OpeniaKeyRefusedBanner = {
  title: string
  detail: string
}

export function openiaKeyRefusedBanner(params: {
  providerId: string
  args?: readonly string[]
  activity?: string
  exitCode?: number
  accountLabel?: string | null
}): OpeniaKeyRefusedBanner | null {
  if (params.providerId !== 'openia' || params.args?.[0] !== 'run') return null
  // `error` é o fim sem saída nenhuma; o código 3 já diz que foi a recusa.
  if (params.activity !== 'exited' && params.activity !== 'error') return null
  if (params.exitCode !== OPENIA_CHAVE_RECUSADA) return null

  // Sem conta, o bloco roda no "Login do sistema" (a chave global do Openia),
  // que é como o seletor de conta do configurador chama essa opção.
  const conta = params.accountLabel?.trim()
  const onde = conta ? `conta ${conta}` : 'Login do sistema'
  return {
    title: 'O OpenRouter recusou a chave',
    detail:
      `A chave do ${onde} é inválida, foi revogada, não tem permissão ou esgotou o limite. ` +
      `Troque em Agente → Openia → ${onde} → Chave do OpenRouter e abra o agente de novo.`,
  }
}

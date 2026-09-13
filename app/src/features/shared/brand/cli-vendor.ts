/**
 * Organização por trás de cada CLI, derivada do tipo — não digitada por linha
 * de modelo. Arquivo próprio porque `CliMark.tsx` só pode exportar componentes
 * (o fast refresh quebra com constantes ao lado; mesma regra que separou
 * `canvas-tool-labels.ts` do painel de ferramentas).
 */
const ORG_POR_CLI: Record<string, string> = {
  codex: 'OpenAI',
  'codex-app-server': 'OpenAI',
  claude: 'Anthropic',
  gemini: 'Google',
  'gemini-acp': 'Google',
}

export function cliVendor(cliType?: string): string | null {
  return cliType ? ORG_POR_CLI[cliType] ?? null : null
}

import { Terminal } from 'lucide-react'

/**
 * Logo do provedor a partir do tipo de CLI do chat.
 *
 * O `ProviderMark` irmão resolve identidade pelo comando de lançamento (é o
 * que o canvas tem em mãos); aqui a entrada é o `cliType` do modelo, que é o
 * que o chat conhece. Mesmos arquivos em `public/brand/providers`, para as
 * duas telas mostrarem exatamente a mesma marca.
 */
const ASSET_POR_CLI: Record<string, string | null> = {
  codex: 'openai-color',
  'codex-app-server': 'openai-color',
  claude: 'claude-color',
  gemini: 'gemini-color',
  'gemini-acp': 'gemini-color',
}

const PROVIDER_POR_CLI: Record<string, string> = {
  codex: 'codex',
  'codex-app-server': 'codex',
  claude: 'claude',
  gemini: 'gemini',
  'gemini-acp': 'gemini',
}

export function CliMark({ cliType, size = 16 }: { cliType?: string; size?: number }) {
  const asset = cliType ? ASSET_POR_CLI[cliType] ?? null : null
  const providerClass = asset ? `felixo-provider-mark--${PROVIDER_POR_CLI[cliType ?? ''] ?? 'terminal'}` : ''

  return (
    <span className={`felixo-provider-mark ${providerClass}`} style={{ width: size, height: size }} aria-hidden>
      {asset ? (
        <img
          src={`${import.meta.env.BASE_URL}brand/providers/${asset}.svg`}
          width={size}
          height={size}
          alt=""
          draggable={false}
        />
      ) : (
        <Terminal size={size} strokeWidth={1.5} aria-hidden />
      )}
    </span>
  )
}

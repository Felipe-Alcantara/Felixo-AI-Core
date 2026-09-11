'use strict'

/**
 * Fontes oficiais que podem alimentar o painel de uso.
 *
 * A lista é deliberadamente declarativa: adicionar uma fonte nova não deve
 * espalhar comandos e rótulos pelo serviço, pelo IPC e pela interface. Os
 * comandos de autenticação são consultas somente leitura; nenhuma fonte aceita
 * chave, token ou cookie como entrada.
 */
const AGENT_USAGE_SOURCES = Object.freeze([
  {
    id: 'codex',
    name: 'Codex CLI',
    provider: 'OpenAI',
    command: 'codex',
    auth: {
      kind: 'cli-command',
      label: 'codex login status',
      command: 'codex',
      args: ['login', 'status'],
    },
    // `codex login status` só confirma a sessão. A fonte primária de quota é
    // o app-server autenticado (`account/rateLimits/read`); o rollout local
    // continua como fallback de identidade/último valor conhecido.
    localProbe: 'codex-rollout',
    // Resets bancados ("banked resets"): crédito único que zera a janela
    // antes do tempo, concedido pela OpenAI. Não existe em nenhum arquivo
    // local — só o app-server da própria CLI, já autenticado, sabe. Ver
    // codex-account-rate-limits.cjs para o porquê. A leitura é somente
    // leitura; o consumo é um fluxo separado e protegido por confirmação.
    liveQuery: 'codex-rate-limits',
    resetCreditsQuery: 'codex-app-server',
    usage: {
      kind: 'live-query',
      label: 'Codex limites ao vivo (app-server)',
      docsUrl: 'https://developers.openai.com/codex/cli',
      limitation:
        'A quota vem do app-server autenticado; se ele não responder, a rodada fica explicitamente indisponível e o último valor conhecido permanece separado.',
    },
  },
  {
    id: 'claude',
    name: 'Claude Code CLI',
    provider: 'Anthropic',
    command: 'claude',
    auth: {
      kind: 'cli-command',
      label: 'claude auth status --json',
      command: 'claude',
      args: ['auth', 'status', '--json'],
    },
    // O `/status` só existe dentro de uma sessão interativa com TTY. O serviço
    // abre uma sessão descartável e consulta cada perfil com o ambiente dele;
    // o probe continua como fallback para quem já optou pela status line.
    liveQuery: 'claude-status',
    localProbe: 'claude-statusline',
    usage: {
      kind: 'live-query',
      label: 'Claude Code /status (ao vivo)',
      docsUrl: 'https://code.claude.com/docs/en/interactive-mode',
      limitation:
        'O Claude só publica o limite dentro do /status de uma sessão interativa; a consulta ao vivo desta conta não retornou um número nesta rodada.',
    },
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    provider: 'Google',
    command: 'gemini',
    auth: null,
    usage: {
      kind: 'assisted-event',
      label: 'Gemini CLI /stats model',
      docsUrl: 'https://geminicli.com/docs/reference/commands',
      limitation:
        'A quota só sai do /stats model dentro da sessão interativa: em modo não interativo (-p) a CLI não responde, e nada de quota é gravado em ~/.gemini.',
    },
  },
  {
    id: 'openia',
    name: 'Openia (launcher OpenRouter)',
    provider: 'OpenRouter',
    command: 'openia',
    auth: {
      kind: 'cli-command',
      label: 'openia key status --json',
      command: 'openia',
      args: ['key', 'status', '--json'],
    },
    // `openia statusline` consulta /api/v1/credits com a chave que o próprio
    // launcher guarda. A chave nunca passa pelo app: só a linha de saída.
    liveQuery: 'usage-command',
    usage: {
      kind: 'live-query',
      label: 'openia statusline (/api/v1/credits)',
      command: 'openia',
      args: ['statusline'],
      docsUrl: 'https://github.com/Felipe-Alcantara/Openia',
      limitation:
        'O saldo vem da conta do OpenRouter pela chave ativa do launcher. Sem chave cadastrada não há o que consultar.',
    },
  },
])

function listAgentUsageSources() {
  return AGENT_USAGE_SOURCES.map(cloneSource)
}

function getAgentUsageSource(providerId) {
  const source = AGENT_USAGE_SOURCES.find((candidate) => candidate.id === providerId)
  return source ? cloneSource(source) : null
}

function cloneSource(source) {
  return {
    ...source,
    localProbe: source.localProbe ?? null,
    auth: source.auth
      ? { ...source.auth, args: [...source.auth.args] }
      : null,
    usage: {
      ...source.usage,
      ...(source.usage.args ? { args: [...source.usage.args] } : {}),
    },
  }
}

module.exports = {
  AGENT_USAGE_SOURCES,
  getAgentUsageSource,
  listAgentUsageSources,
}

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
    // A quota não vem do comando: `codex login status` só diz que existe
    // sessão. Quem tem o número é o rollout que a própria CLI grava em
    // ~/.codex/sessions — daí o probe local.
    localProbe: 'codex-rollout',
    usage: {
      kind: 'local-execution',
      label: 'Codex rollout da sessão (rate_limits)',
      docsUrl: 'https://developers.openai.com/codex/cli',
      limitation:
        'O número vem do último rate_limits que a CLI gravou no rollout da sessão; entre sessões ele permanece como último valor conhecido.',
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
    usage: {
      kind: 'cli-command',
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

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
    usage: {
      kind: 'assisted-event',
      label: 'Claude Code status line (rate_limits)',
      docsUrl: 'https://code.claude.com/docs/en/statusline',
      limitation:
        'Os percentuais de rate limit são emitidos pela status line durante a sessão; auth status não contém esses números.',
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
        'A consulta de uso/quota é um comando da sessão interativa; a CLI não expõe uma consulta não interativa equivalente.',
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
    usage: {
      kind: 'unsupported',
      label: 'Openia/OpenRouter',
      docsUrl: 'https://github.com/Felipe-Alcantara/Openia',
      limitation:
        'O launcher informa apenas o estado da chave; não há endpoint de quota integrado ao contrato do app.',
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
    usage: { ...source.usage },
  }
}

module.exports = {
  AGENT_USAGE_SOURCES,
  getAgentUsageSource,
  listAgentUsageSources,
}

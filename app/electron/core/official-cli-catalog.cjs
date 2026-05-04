const OFFICIAL_AI_CLIS = Object.freeze([
  {
    id: 'codex',
    name: 'Codex CLI',
    provider: 'OpenAI',
    command: 'codex',
    windowsAliases: ['codex.exe', 'codex.cmd'],
    versionFlag: '--version',
    category: 'ai-provider',
    installUrl: 'https://developers.openai.com/codex/cli',
    authUrl: 'https://developers.openai.com/codex/auth',
    install: {
      label: 'npm i -g @openai/codex',
      command: 'npm',
      windowsCommand: 'npm.cmd',
      args: ['i', '-g', '@openai/codex'],
    },
    update: {
      label: 'npm i -g @openai/codex@latest',
      command: 'npm',
      windowsCommand: 'npm.cmd',
      args: ['i', '-g', '@openai/codex@latest'],
    },
    login: {
      label: 'codex login',
      command: 'codex',
      args: ['login'],
    },
    accountSwitch: {
      status: {
        label: 'codex login status',
        command: 'codex',
        windowsCommand: 'codex.cmd',
        args: ['login', 'status'],
      },
      logout: {
        label: 'codex logout',
        command: 'codex',
        windowsCommand: 'codex.cmd',
        args: ['logout'],
      },
    },
    models: [
      {
        id: 'codex-cli',
        name: 'Codex CLI',
        command: 'codex',
        source: 'CLI oficial instalada no sistema',
        cliType: 'codex',
        reasoningEffort: 'medium',
      },
      {
        id: 'codex-app-server-cli',
        name: 'Codex App Server',
        command: 'codex app-server',
        source: 'CLI oficial instalada no sistema',
        cliType: 'codex-app-server',
        reasoningEffort: 'medium',
      },
    ],
  },
  {
    id: 'claude',
    name: 'Claude Code CLI',
    provider: 'Anthropic',
    command: 'claude',
    windowsAliases: ['claude.exe', 'claude.cmd'],
    versionFlag: '--version',
    category: 'ai-provider',
    installUrl: 'https://code.claude.com/docs/en/setup',
    authUrl: 'https://code.claude.com/docs/en/setup',
    install: {
      label: 'npm install -g @anthropic-ai/claude-code',
      command: 'npm',
      windowsCommand: 'npm.cmd',
      args: ['install', '-g', '@anthropic-ai/claude-code'],
    },
    update: {
      label: 'claude update',
      command: 'claude',
      windowsCommand: 'claude.cmd',
      args: ['update'],
    },
    login: {
      label: 'claude',
      command: 'claude',
      args: [],
    },
    models: [
      {
        id: 'claude-code-cli',
        name: 'Claude Code CLI',
        command: 'claude',
        source: 'CLI oficial instalada no sistema',
        cliType: 'claude',
      },
    ],
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    provider: 'Google',
    command: 'gemini',
    windowsAliases: ['gemini.exe', 'gemini.cmd'],
    versionFlag: '--version',
    category: 'ai-provider',
    installUrl: 'https://geminicli.com/docs/get-started/installation/',
    authUrl: 'https://geminicli.com/docs/get-started/authentication/',
    install: {
      label: 'npm install -g @google/gemini-cli',
      command: 'npm',
      windowsCommand: 'npm.cmd',
      args: ['install', '-g', '@google/gemini-cli'],
    },
    update: {
      label: 'npm install -g @google/gemini-cli@latest',
      command: 'npm',
      windowsCommand: 'npm.cmd',
      args: ['install', '-g', '@google/gemini-cli@latest'],
    },
    login: {
      label: 'gemini',
      command: 'gemini',
      args: [],
    },
    models: [
      {
        id: 'gemini-cli',
        name: 'Gemini CLI',
        command: 'gemini',
        source: 'CLI oficial instalada no sistema',
        cliType: 'gemini',
      },
      {
        id: 'gemini-acp-cli',
        name: 'Gemini ACP',
        command: 'gemini --experimental-acp',
        source: 'CLI oficial instalada no sistema',
        cliType: 'gemini-acp',
      },
    ],
  },
])

function listOfficialAiClis() {
  return OFFICIAL_AI_CLIS.map(cloneOfficialCli)
}

function getOfficialAiCli(id) {
  const cli = OFFICIAL_AI_CLIS.find((candidate) => candidate.id === id)
  return cli ? cloneOfficialCli(cli) : null
}

function getOfficialAiCliForCommand(command) {
  const cli = OFFICIAL_AI_CLIS.find((candidate) => candidate.command === command)
  return cli ? cloneOfficialCli(cli) : null
}

function listOfficialAiCliModels(id) {
  const cli = getOfficialAiCli(id)
  return cli ? cli.models.map((model) => ({ ...model })) : []
}

function cloneOfficialCli(cli) {
  return {
    ...cli,
    windowsAliases: [...(cli.windowsAliases ?? [])],
    install: { ...cli.install, args: [...cli.install.args] },
    update: { ...cli.update, args: [...cli.update.args] },
    login: { ...cli.login, args: [...cli.login.args] },
    accountSwitch: cli.accountSwitch
      ? {
          status: {
            ...cli.accountSwitch.status,
            args: [...cli.accountSwitch.status.args],
          },
          logout: {
            ...cli.accountSwitch.logout,
            args: [...cli.accountSwitch.logout.args],
          },
        }
      : undefined,
    models: cli.models.map((model) => ({ ...model })),
  }
}

module.exports = {
  OFFICIAL_AI_CLIS,
  getOfficialAiCli,
  getOfficialAiCliForCommand,
  listOfficialAiCliModels,
  listOfficialAiClis,
}

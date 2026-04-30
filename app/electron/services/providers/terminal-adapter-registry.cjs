const terminalAdapters = Object.freeze({
  claude: require('../adapters/claude-adapter.cjs'),
  codex: require('../adapters/codex-adapter.cjs'),
  gemini: require('../adapters/gemini-adapter.cjs'),
  'gemini-acp': require('../adapters/gemini-acp-adapter.cjs'),
  'codex-app-server': require('../adapters/codex-app-server-adapter.cjs'),
})

function getTerminalAdapter(cliType) {
  if (!Object.prototype.hasOwnProperty.call(terminalAdapters, cliType)) {
    return null
  }

  return terminalAdapters[cliType]
}

function listTerminalAdapterTypes() {
  return Object.keys(terminalAdapters)
}

module.exports = {
  getTerminalAdapter,
  listTerminalAdapterTypes,
  terminalAdapters,
}

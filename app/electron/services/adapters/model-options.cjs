const CODEX_REASONING_EFFORTS = new Set(['low', 'medium', 'high', 'xhigh'])
const CLAUDE_REASONING_EFFORTS = new Set(['low', 'medium', 'high', 'max'])

function createCodexExecOptionArgs(context = {}) {
  const args = []
  const providerModel = getProviderModel(context)
  const reasoningEffort = getReasoningEffort(context, CODEX_REASONING_EFFORTS)

  if (providerModel) {
    args.push('--model', providerModel)
  }

  if (reasoningEffort) {
    args.push('--config', createTomlStringConfig('model_reasoning_effort', reasoningEffort))
  }

  return args
}

function createCodexConfigOptionArgs(context = {}) {
  const args = []
  const providerModel = getProviderModel(context)
  const reasoningEffort = getReasoningEffort(context, CODEX_REASONING_EFFORTS)

  if (providerModel) {
    args.push('--config', createTomlStringConfig('model', providerModel))
  }

  if (reasoningEffort) {
    args.push('--config', createTomlStringConfig('model_reasoning_effort', reasoningEffort))
  }

  return args
}

function createModelOptionArgs(context = {}) {
  const providerModel = getProviderModel(context)

  return providerModel ? ['--model', providerModel] : []
}

function createClaudeOptionArgs(context = {}) {
  const args = createModelOptionArgs(context)
  const reasoningEffort = getReasoningEffort(context, CLAUDE_REASONING_EFFORTS)

  if (reasoningEffort) {
    args.push('--effort', reasoningEffort)
  }

  return args
}

function getProviderModel(context = {}) {
  return getTrimmedString(context.model?.providerModel)
}

function getReasoningEffort(context = {}, allowedEfforts) {
  const value = getTrimmedString(context.model?.reasoningEffort)

  return allowedEfforts.has(value) ? value : ''
}

function createTomlStringConfig(key, value) {
  return `${key}="${escapeTomlString(value)}"`
}

function escapeTomlString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function getTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

module.exports = {
  createClaudeOptionArgs,
  createCodexConfigOptionArgs,
  createCodexExecOptionArgs,
  createModelOptionArgs,
}

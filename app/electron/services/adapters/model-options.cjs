const CODEX_REASONING_EFFORTS = new Set(['low', 'medium', 'high', 'xhigh'])
const CLAUDE_REASONING_EFFORTS = new Set(['low', 'medium', 'high', 'max'])
const CLAUDE_PERMISSION_MODES = new Set([
  'default',
  'acceptEdits',
  'plan',
  'auto',
  'dontAsk',
  'bypassPermissions',
])
const CLAUDE_PERMISSION_MODE_ENV = 'FELIXO_CLAUDE_PERMISSION_MODE'
const CODEX_FULL_ACCESS_ENV = 'FELIXO_CODEX_FULL_ACCESS'
const GEMINI_FULL_ACCESS_ENV = 'FELIXO_GEMINI_FULL_ACCESS'
const DEFAULT_CLAUDE_PERMISSION_MODE = 'bypassPermissions'

function createCodexExecOptionArgs(context = {}) {
  const args = []
  const providerModel = getProviderModel(context)
  const reasoningEffort = getReasoningEffort(context, CODEX_REASONING_EFFORTS)

  args.push(...createCodexFullAccessArgs(context))

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

  if (isCodexFullAccessEnabled(context)) {
    args.push(
      '--config',
      createTomlStringConfig('sandbox_mode', 'danger-full-access'),
      '--config',
      createTomlStringConfig('approval_policy', 'never'),
    )
  }

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

function createGeminiFullAccessArgs(context = {}) {
  return isGeminiFullAccessEnabled(context) ? ['--yolo'] : []
}

function createClaudeOptionArgs(context = {}) {
  const args = []
  const reasoningEffort = getReasoningEffort(context, CLAUDE_REASONING_EFFORTS)
  const permissionMode = getClaudePermissionMode(context)

  if (permissionMode) {
    args.push('--permission-mode', permissionMode)
  }

  args.push(...createModelOptionArgs(context))

  if (reasoningEffort) {
    args.push('--effort', reasoningEffort)
  }

  return args
}

function getClaudePermissionMode(context = {}) {
  const value = getTrimmedString(
    context.claudePermissionMode ?? process.env[CLAUDE_PERMISSION_MODE_ENV],
  )

  if (value === 'off' || value === 'none') {
    return ''
  }

  return CLAUDE_PERMISSION_MODES.has(value)
    ? value
    : DEFAULT_CLAUDE_PERMISSION_MODE
}

function createCodexFullAccessArgs(context = {}) {
  return isCodexFullAccessEnabled(context)
    ? ['--dangerously-bypass-approvals-and-sandbox']
    : []
}

function isCodexFullAccessEnabled(context = {}) {
  return isFullAccessEnabled(context.codexFullAccess, CODEX_FULL_ACCESS_ENV)
}

function isGeminiFullAccessEnabled(context = {}) {
  return isFullAccessEnabled(context.geminiFullAccess, GEMINI_FULL_ACCESS_ENV)
}

function isFullAccessEnabled(contextValue, envKey) {
  const value = getTrimmedString(contextValue ?? process.env[envKey]).toLowerCase()

  return !['0', 'false', 'off', 'no', 'never'].includes(value)
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
  CLAUDE_PERMISSION_MODE_ENV,
  CODEX_FULL_ACCESS_ENV,
  GEMINI_FULL_ACCESS_ENV,
  createCodexFullAccessArgs,
  createClaudeOptionArgs,
  createCodexConfigOptionArgs,
  createCodexExecOptionArgs,
  createGeminiFullAccessArgs,
  createModelOptionArgs,
  getClaudePermissionMode,
  isCodexFullAccessEnabled,
  isGeminiFullAccessEnabled,
}

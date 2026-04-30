function createCliExecutionPlan({
  adapter,
  context,
  prompt,
  resumePrompt,
}) {
  const usesPersistentProcess = shouldUsePersistentProcess(adapter)
  const usesNativeResume =
    !usesPersistentProcess && shouldUseResumePrompt(adapter, context, resumePrompt)

  return {
    mode: usesPersistentProcess
      ? 'persistent-process'
      : usesNativeResume
        ? 'native-resume'
        : 'one-shot',
    spawnPrompt: usesNativeResume ? resumePrompt : prompt,
    usesNativeResume,
    usesPersistentProcess,
  }
}

function getAdapterSpawnArgs(adapter, prompt, context) {
  if (
    context.usesNativeResume &&
    typeof adapter.getResumeArgs === 'function'
  ) {
    return adapter.getResumeArgs(prompt, context)
  }

  return adapter.getSpawnArgs(prompt, context)
}

function shouldUseResumePrompt(adapter, context, resumePrompt) {
  if (
    !resumePrompt ||
    !context.isContinuation ||
    typeof adapter.getResumeArgs !== 'function'
  ) {
    return false
  }

  return canAdapterResume(adapter, context)
}

function shouldUsePersistentProcess(adapter) {
  return (
    typeof adapter.getPersistentSpawnArgs === 'function' &&
    typeof adapter.createPersistentInput === 'function'
  )
}

function choosePersistentPrompt({
  adapter,
  isReusingProcess,
  context,
  prompt,
  resumePrompt,
}) {
  const shouldUseShortPrompt =
    resumePrompt &&
    context.isContinuation &&
    (isReusingProcess || canAdapterResume(adapter, context))

  return shouldUseShortPrompt ? resumePrompt : prompt
}

function normalizePersistentInput(value) {
  if (typeof value === 'string') {
    return {
      input: value,
      didStartSession: true,
      didSendPrompt: true,
    }
  }

  if (!value || typeof value.input !== 'string') {
    throw new Error('Adapter persistente retornou uma entrada inválida.')
  }

  return {
    input: value.input,
    didStartSession: Boolean(value.didStartSession),
    didSendPrompt: Boolean(value.didSendPrompt),
  }
}

function canAdapterResume(adapter, context) {
  if (typeof adapter.canResume === 'function') {
    return adapter.canResume(context)
  }

  return Boolean(context.providerSessionId)
}

module.exports = {
  canAdapterResume,
  choosePersistentPrompt,
  createCliExecutionPlan,
  getAdapterSpawnArgs,
  normalizePersistentInput,
  shouldUsePersistentProcess,
  shouldUseResumePrompt,
}

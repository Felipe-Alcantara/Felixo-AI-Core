function createOrchestrationIpcBridge({ runner }) {
  const outputBuffers = new Map()

  function handleCliEvent({
    cliEvent,
    streamSessionId,
    threadId,
    context = {},
  }) {
    if (!cliEvent || typeof cliEvent !== 'object') {
      return { handled: false }
    }

    const agentJob = runner.getAgentJobByThreadId(threadId)

    if (agentJob && cliEvent.type === 'text') {
      appendOutput(outputBuffers, threadId, cliEvent.text)
    }

    if (isOrchestrationCliEvent(cliEvent) && context.role !== 'agent') {
      return {
        handled: true,
        promise: runner.handleOrchestrationEvent(
          {
            ...cliEvent,
            sessionId: streamSessionId,
            threadId,
          },
          {
            ...context,
            streamSessionId,
            threadId,
          },
        ),
      }
    }

    if (agentJob && cliEvent.type === 'done') {
      return {
        handled: false,
        promise: runner.onAgentJobCompleted({
          threadId,
          result: consumeOutput(outputBuffers, threadId),
        }),
      }
    }

    if (agentJob && cliEvent.type === 'error') {
      consumeOutput(outputBuffers, threadId)
      return {
        handled: false,
        promise: runner.onAgentJobCompleted({
          threadId,
          error: cliEvent.message ?? 'Sub-agente retornou erro.',
        }),
      }
    }

    if (cliEvent.type === 'done' && shouldSuppressOrchestratorDone(runner, threadId)) {
      return { handled: true }
    }

    return { handled: false }
  }

  return {
    handleCliEvent,
  }
}

function isOrchestrationCliEvent(event) {
  return (
    event?.type === 'spawn_agent' ||
    event?.type === 'awaiting_agents' ||
    event?.type === 'final_answer'
  )
}

function shouldSuppressOrchestratorDone(runner, threadId) {
  const run = runner.getRunByThreadId(threadId)

  return Boolean(
    run &&
      (run.status === 'waiting_agents' ||
        run.status === 'running_orchestrator' ||
        run.status === 'completed'),
  )
}

function appendOutput(outputBuffers, threadId, text) {
  if (!String(text ?? '').trim()) {
    return
  }

  outputBuffers.set(
    threadId,
    `${outputBuffers.get(threadId) ?? ''}${text}`,
  )
}

function consumeOutput(outputBuffers, threadId) {
  const output = outputBuffers.get(threadId) ?? ''
  outputBuffers.delete(threadId)
  return output
}

module.exports = {
  appendOutput,
  consumeOutput,
  createOrchestrationIpcBridge,
  isOrchestrationCliEvent,
  shouldSuppressOrchestratorDone,
}

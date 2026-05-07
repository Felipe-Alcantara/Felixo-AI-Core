// When the orchestrator starts emitting plain text, we wait this long for a
// structured JSON event before assuming it bypassed delegation. Long enough
// to allow brief preamble before JSON, short enough to limit the visible leak
// of a direct answer onto the chat.
const ORCHESTRATOR_FREE_TEXT_TIMEOUT_MS = 4000

function createOrchestrationIpcBridge({
  runner,
  abortStream,
  freeTextTimeoutMs = ORCHESTRATOR_FREE_TEXT_TIMEOUT_MS,
} = {}) {
  const outputBuffers = new Map()
  // Per-thread state for the free-text guard: tracks whether we've seen any
  // structured event and the pending timeout to fire the guard early.
  const guardState = new Map()

  function clearGuardState(threadId) {
    const state = guardState.get(threadId)
    if (state?.timer) {
      clearTimeout(state.timer)
    }
    guardState.delete(threadId)
  }

  function markStructured(threadId) {
    const state = guardState.get(threadId)
    if (state) {
      state.sawStructured = true
      if (state.timer) {
        clearTimeout(state.timer)
        state.timer = null
      }
    }
  }

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

    // Orchestrator free-text early-detection: if we see text on a non-agent
    // thread before any structured event, start a timer; if no structured
    // event arrives in time, abort the stream and fire the guard early to
    // limit the visible leak on the chat.
    if (
      !agentJob &&
      context.role !== 'agent' &&
      cliEvent.type === 'text' &&
      String(cliEvent.text ?? '').trim()
    ) {
      const existing = guardState.get(threadId)
      if (!existing) {
        const state = {
          sawStructured: false,
          fired: false,
          timer: null,
        }
        state.timer = setTimeout(() => {
          if (state.sawStructured || state.fired) {
            return
          }
          state.fired = true
          if (typeof abortStream === 'function') {
            try {
              abortStream(streamSessionId)
            } catch {
              // best-effort abort; runner will still re-invoke below
            }
          }
          // Fire the guard now instead of waiting for the natural `done`.
          runner
            .checkOrchestratorDoneWithoutSpawn({
              threadId,
              context: { ...context, streamSessionId, threadId },
            })
            .catch(() => {})
        }, freeTextTimeoutMs)
        guardState.set(threadId, state)
      }
    }

    if (cliEvent.type === 'orchestration_events' && context.role !== 'agent') {
      markStructured(threadId)
      return {
        handled: true,
        promise: handleOrchestrationEvents({
          runner,
          events: cliEvent.events,
          streamSessionId,
          threadId,
          context,
        }),
      }
    }

    if (isOrchestrationCliEvent(cliEvent) && context.role !== 'agent') {
      markStructured(threadId)
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
      const partialOutput = consumeOutput(outputBuffers, threadId)
      return {
        handled: false,
        promise: runner.onAgentJobCompleted({
          threadId,
          error: cliEvent.message ?? 'Sub-agente retornou erro.',
          partialOutput,
        }),
      }
    }

    // Free-text orchestrator response detection: if the orchestrator stream
    // finishes on a non-agent thread without ever emitting a structured event
    // (no spawn_agent, no final_answer), the LLM bypassed the delegation
    // protocol with plain text. Let the runner decide whether to re-invoke.
    if (cliEvent.type === 'done' && !agentJob && context.role !== 'agent') {
      const state = guardState.get(threadId)
      const alreadyFiredEarly = state?.fired === true
      clearGuardState(threadId)
      if (alreadyFiredEarly) {
        // The early timeout already aborted and re-invoked; ignore the natural
        // `done` to avoid double-firing.
        return { handled: true }
      }
      if (shouldSuppressOrchestratorDone(runner, threadId)) {
        return { handled: true }
      }
      const shouldGuard = shouldGuardOrchestratorDoneWithoutSpawn({
        runner,
        threadId,
        context,
      })
      return {
        handled: shouldGuard,
        promise: runner.checkOrchestratorDoneWithoutSpawn({
          threadId,
          context: { ...context, streamSessionId, threadId },
        }),
      }
    }

    if (cliEvent.type === 'done' && shouldSuppressOrchestratorDone(runner, threadId)) {
      return { handled: true }
    }

    if (cliEvent.type === 'error' && !agentJob && context.role !== 'agent') {
      clearGuardState(threadId)
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
    event?.type === 'final_answer' ||
    event?.type === 'orchestration_events'
  )
}

async function handleOrchestrationEvents({
  runner,
  events,
  streamSessionId,
  threadId,
  context,
}) {
  if (!Array.isArray(events)) {
    return { handled: true, ok: true }
  }

  let lastResult = { handled: true, ok: true }

  for (const event of events) {
    lastResult = await runner.handleOrchestrationEvent(
      {
        ...event,
        sessionId: streamSessionId,
        threadId,
      },
      {
        ...context,
        streamSessionId,
        threadId,
      },
    )

    if (lastResult.ok === false) {
      return lastResult
    }
  }

  return lastResult
}

function shouldSuppressOrchestratorDone(runner, threadId) {
  const run = runner.getRunByThreadId(threadId)

  return Boolean(
    run &&
      (run.status === 'waiting_agents' ||
        run.status === 'completed' ||
        hasActiveAgentJobs(run)),
  )
}

function shouldGuardOrchestratorDoneWithoutSpawn({ runner, threadId, context }) {
  if (typeof runner.shouldGuardOrchestratorDoneWithoutSpawn !== 'function') {
    return false
  }

  return runner.shouldGuardOrchestratorDoneWithoutSpawn({ threadId, context })
}

function hasActiveAgentJobs(run) {
  return run.agentJobs?.some((job) => job.status === 'pending' || job.status === 'running')
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
  handleOrchestrationEvents,
  isOrchestrationCliEvent,
  shouldGuardOrchestratorDoneWithoutSpawn,
  shouldSuppressOrchestratorDone,
}

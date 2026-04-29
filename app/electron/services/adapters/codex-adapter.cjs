function getSpawnArgs(prompt, context = {}) {
  const args = ['exec', '--json', '--skip-git-repo-check']

  if (context.cwd) {
    args.push('--cd', context.cwd)
  }

  args.push(prompt)

  return {
    command: 'codex',
    args,
  }
}

function parseLine(line) {
  const payload = JSON.parse(line)

  if (payload.type === 'item.completed') {
    const item = payload.item

    if (item?.type === 'agent_message' && typeof item.text === 'string') {
      return {
        type: 'text',
        text: item.text,
      }
    }

    return null
  }

  if (payload.type === 'turn.completed') {
    return {
      type: 'done',
    }
  }

  if (payload.type === 'error') {
    const message = payload.message ?? payload.error?.message ?? ''

    if (String(message).toLowerCase().includes('reconnect')) {
      return null
    }

    return {
      type: 'error',
      message: message || 'Codex retornou um erro.',
    }
  }

  return null
}

module.exports = {
  getSpawnArgs,
  parseLine,
}

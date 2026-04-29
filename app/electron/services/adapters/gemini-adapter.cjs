function getSpawnArgs(prompt) {
  return {
    command: 'gemini',
    args: ['--prompt', prompt, '--output-format', 'stream-json', '--skip-trust'],
  }
}

function parseLine(line) {
  const payload = JSON.parse(line)

  if (
    payload.type === 'message' &&
    payload.role === 'model' &&
    typeof payload.content === 'string'
  ) {
    return {
      type: 'text',
      text: payload.content,
    }
  }

  if (payload.type === 'result') {
    return {
      type: 'done',
    }
  }

  if (payload.type === 'error') {
    return {
      type: 'error',
      message: payload.message ?? 'Gemini retornou um erro.',
    }
  }

  return null
}

module.exports = {
  getSpawnArgs,
  parseLine,
}

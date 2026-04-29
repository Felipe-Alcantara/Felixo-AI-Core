function createJsonlLineReader(onLine) {
  let buffer = ''

  return {
    push(chunk) {
      buffer += chunk

      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        emitLine(onLine, line)
      }
    },
    flush() {
      emitLine(onLine, buffer)
      buffer = ''
    },
  }
}

function emitLine(onLine, line) {
  const trimmedLine = line.trim()

  if (trimmedLine) {
    onLine(trimmedLine)
  }
}

module.exports = {
  createJsonlLineReader,
}
